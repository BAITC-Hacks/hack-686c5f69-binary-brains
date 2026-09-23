import { CatalogError } from "./types.ts";
import type { Product, ProductSummary, PropertyValue } from "./types.ts";
import { extractCertificates } from "./certificates.ts";
import { extractLuminaireProperties } from "./text-properties.ts";

export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

export function numeric(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const result = typeof value === "number" ? value : Number(value.trim().replace(",", "."));
  return Number.isFinite(result) && result >= 0 ? result : null;
}

function scalar(value: unknown): PropertyValue | null {
  if (typeof value === "string" || typeof value === "boolean") return value;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function safeUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  if (!/^(?:https?:\/\/|\/)/i.test(value.trim())) return null;
  try {
    const url = new URL(value, "https://ekt.kz");
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function normalizeSummary(input: unknown): ProductSummary {
  const raw = record(input);
  if (!["string", "number"].includes(typeof raw.id) || !String(raw.id).trim() ||
      typeof raw.article !== "string" || !raw.article.trim() ||
      typeof raw.name !== "string" || !raw.name.trim()) {
    throw new CatalogError("INVALID_DATA", "Некорректная карточка: нужны id, article и name.");
  }
  return {
    id: String(raw.id), article: raw.article.trim(), name: raw.name.trim(),
    price: numeric(raw.price), currency: typeof raw.currency === "string" ? raw.currency : null,
    url: safeUrl(raw.url), image: safeUrl(raw.image),
  };
}

export function normalizeProperties(input: unknown): Record<string, PropertyValue> {
  const result: Record<string, PropertyValue> = Object.create(null);
  const entries = Array.isArray(input)
    ? input.map(item => { const row = record(item); return [row.code ?? row.CODE, row.value ?? row.VALUE]; })
    : Object.entries(record(input));
  for (const [key, rawValue] of entries) {
    if (typeof key !== "string") continue;
    const object = record(rawValue);
    const value = scalar(object.VALUE ?? object.value ?? rawValue);
    if (value !== null) result[key.toUpperCase()] = value;
  }
  return result;
}

export function normalizeProduct(input: unknown, source: Product["source"]): Product {
  const raw = record(input);
  const properties = normalizeProperties(raw.properties);
  const explicitCategory = typeof raw.category === "string" ? raw.category.trim() : "";
  const propertyCategory = typeof properties.KATEGORIYA === "string" ? properties.KATEGORIYA.trim() : "";
  const luminaireCategory = typeof properties.KATEGORIYA_SVETILNIKA === "string" ? properties.KATEGORIYA_SVETILNIKA.trim() : "";
  const quantity = numeric(raw.quantity);
  const description = typeof raw.description === "string" ? raw.description : "";
  const conflicts: Product["conflicts"] = [];
  const name = normalizeSummary(input);
  const current = properties.NOMINALNYY_TOK;
  // Match explicit ampere units only: DRX250 and 18kA are not nominal-current evidence.
  // Descriptions may describe a whole series (6–63 A) or breaking capacity (4500 A).
  // Only a single explicitly labelled nominal-current value is product evidence.
  const labelledCurrents = [...description.matchAll(/номинальн(?:ый|ым)\s+ток(?:ом)?\s*[:—–-]?\s*(\d+(?:[.,]\d+)?)\s*[аa](?=$|[^\p{L}\p{N}])(?!\s*(?:[-–—,]\s*|до\s+)\d)/giu)]
    .map(match => Number(match[1].replace(",", ".")));
  const currents = [...name.name.matchAll(/(?:^|[^\p{L}\p{N}])(\d+(?:[.,]\d+)?)\s*[аa](?=$|[^\p{L}\p{N}])/giu)]
    .map(match => Number(match[1].replace(",", ".")));
  currents.push(...labelledCurrents);
  const propertyCurrent = typeof current === "string"
    ? numeric(current.replace(/\s*[аa]\s*$/iu, "")) : numeric(current);
  if (propertyCurrent !== null && currents.some(value => value !== propertyCurrent)) {
    conflicts.push({ property: "NOMINALNYY_TOK", values: [...new Set([...currents, propertyCurrent])].map(String),
      message: "Номинальный ток в названии/описании и свойствах противоречит друг другу; требуется уточнение." });
  }
  const certificateResult = extractCertificates(raw, safeUrl);
  const textProperties = luminaireCategory ? extractLuminaireProperties(name.name, description) : { properties: {}, evidence: {}, conflicts: [] };
  // TEXT_* is a reserved derived namespace: raw values may not bypass extraction.
  for (const key of Object.keys(properties)) if (key.startsWith("TEXT_")) delete properties[key];
  Object.assign(properties, textProperties.properties);
  conflicts.push(...textProperties.conflicts);
  if (luminaireCategory && properties.TIP_TSOKOLYA !== undefined) {
    const apiSocket = String(properties.TIP_TSOKOLYA).trim().toUpperCase().replace(/Е/g, "E");
    const textSockets = [...new Set([...`${name.name} ${description}`.matchAll(/(?:\d+\s*[xх×]\s*|(?<![a-z]))[eе](\d{2})(?!\d)/giu)]
      .map(match => `E${match[1]}`))];
    if (/^E\d{2}$/.test(apiSocket) && textSockets.some(socket => socket !== apiSocket)) {
      conflicts.push({ property: "TIP_TSOKOLYA", values: [...new Set([apiSocket, ...textSockets])],
        message: "Цоколь в свойствах и тексте товара противоречит друг другу; требуется уточнение." });
    }
  }
  const stores = Array.isArray(raw.stores) ? raw.stores.flatMap(value => {
    const store = record(value);
    if (!["string", "number"].includes(typeof store.id) || typeof store.name !== "string") return [];
    return [{ id: String(store.id), name: store.name, quantity: numeric(store.quantity) }];
  }) : [];
  return {
    ...name, description, category: explicitCategory || propertyCategory || luminaireCategory || null,
    categorySource: explicitCategory ? "category" : propertyCategory ? "properties.KATEGORIYA" : luminaireCategory ? "properties.KATEGORIYA_SVETILNIKA" : null,
    quantity, availability: quantity === null ? "unknown" : quantity > 0 ? "in_stock" : "out_of_stock",
    stores, storesRaw: raw.stores ?? null, offersRaw: raw.offers ?? null, properties,
    textPropertyEvidence: textProperties.evidence,
    certificates: certificateResult.certificates, certificateStatus: certificateResult.status,
    minimumOrder: { rawValue: properties.KRATNOST_MIN ?? null, verified: false }, conflicts,
    warnings: [
      ...(source === "demo" ? ["Синтетические демонстрационные данные; не сведения магазина."] : []),
      ...(name.currency === null ? ["Валюта не указана источником."] : []),
      ...(quantity === null ? ["Остаток неизвестен."] : []),
      ...(certificateResult.certificates.length === 0 ? ["Ссылка на сертификат не найдена в поддерживаемых полях ответа."] : []),
      ...(certificateResult.unresolved ? ["Поле сертификата есть, но часть значений не содержит доступной ссылки; требуется уточнение у поставщика."] : []),
      "Семантика KRATNOST_MIN и правила доступности складов требуют подтверждения.",
      ...conflicts.map(conflict => conflict.message),
    ], source, checkedAt: new Date().toISOString(),
  };
}
