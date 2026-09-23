import type { CatalogService } from "../catalog/service.ts";
import { CatalogError } from "../catalog/types.ts";
import type { Product, PropertyValue } from "../catalog/types.ts";
import { equivalentProperty } from "./compare.ts";
import { propertyLabels } from "./profiles.ts";
import { rankCandidates } from "./rank.ts";

export interface AlternativeRequirements {
  // A domain-reviewed profile must list ALL critical properties for this category.
  category: string;
  requiredProperties: string[];
  quantity?: number;
  maxCandidates?: number;
  limit?: number;
  candidateIds?: string[];
  maxDurationMs?: number;
}

function comparable(value: PropertyValue): string {
  return String(value).trim().toLocaleLowerCase("ru").replace(/\s+/g, " ");
}

export async function findAlternatives(catalog: CatalogService, productId: string, requirements: AlternativeRequirements) {
  const quantity = requirements.quantity ?? 1;
  const maxCandidates = requirements.maxCandidates ?? 30;
  const limit = requirements.limit ?? 3;
  const maxDurationMs = requirements.maxDurationMs ?? 4000;
  const keys = [...new Set(requirements.requiredProperties.map(key => key.trim().toUpperCase()))];
  if (!requirements.category.trim() || !keys.length || keys.some(key => !key || key === "RECOMMEND") ||
      !Number.isFinite(quantity) || quantity <= 0 || !Number.isSafeInteger(maxCandidates) || maxCandidates < 1 || maxCandidates > 100 ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 10 ||
      !Number.isSafeInteger(maxDurationMs) || maxDurationMs < 1 || maxDurationMs > 15000) {
    throw new CatalogError("INPUT", "Нужны категория, критические свойства, положительное количество и допустимые лимиты.");
  }
  if (requirements.candidateIds !== undefined && (!Array.isArray(requirements.candidateIds) ||
      !requirements.candidateIds.length || requirements.candidateIds.length > 100 ||
      requirements.candidateIds.some(id => typeof id !== "string" || !id.trim()))) {
    throw new CatalogError("INPUT", "candidateIds должен содержать от 1 до 100 непустых id.");
  }
  const deadline = AbortSignal.timeout(maxDurationMs);
  const original = await catalog.getProduct(productId, { signal: deadline });
  const blocked = original.category !== requirements.category || original.conflicts.length > 0 ||
    keys.some(key => original.properties[key] === undefined || comparable(original.properties[key]) === "");
  if (blocked) return { items: [], checked: 0, incomplete: true,
    warnings: ["Для подбора нужны подтверждённая категория и непротиворечивые критические характеристики исходного товара."] };
  const index = requirements.candidateIds ? null : catalog.getIndex();
  const candidates = (requirements.candidateIds ? [...new Set(requirements.candidateIds)].map(id => ({ id })) : rankCandidates(original, index!.items))
    .filter(item => item.id !== productId);
  const matches: { product: Product; reasons: string[]; differences: string[]; requiresReview: true }[] = [];
  const warnings: string[] = [];
  let checked = 0;
  let attempted = 0;
  // Bounded, sequential reads avoid bursts against an API with unknown rate limits.
  for (const candidate of candidates.slice(0, maxCandidates)) {
    if (deadline.aborted) { warnings.push("Истёк лимит времени подбора; проверена только часть кандидатов."); break; }
    attempted++;
    let product: Product;
    try { product = await catalog.getProduct(candidate.id, { signal: deadline }); checked++; }
    catch {
      if (deadline.aborted) { warnings.push("Истёк лимит времени подбора; проверена только часть кандидатов."); break; }
      warnings.push(`Не удалось проверить товар ${candidate.id}.`); continue;
    }
    if (product.category !== requirements.category || product.conflicts.length ||
        product.quantity === null || product.quantity < quantity ||
        keys.some(key => product.properties[key] === undefined || !equivalentProperty(key, product.properties[key], original.properties[key]))) continue;
    const propertyKeys = new Set([...Object.keys(original.properties), ...Object.keys(product.properties)]);
    const differences = [...propertyKeys].filter(key => !keys.includes(key) &&
      !/^(?:CML2_|KRATNOST_|BRAND_PRIORITY$|RECOMMEND$|NOVINKA$|SPETSPREDLOZHENIE$|ARTIKULPOSTAVSHCHIKA$|IMYAKARTINKI$|BLOG_POST_ID$|INSTA$|POKAZYVAT_TSENY$|KOLICHESTVOVREZERVE$)/.test(key) &&
      comparable(product.properties[key] ?? "") !== comparable(original.properties[key] ?? ""))
      .map(key => `${propertyLabels[key] ?? key}: ${original.properties[key] ?? "не указано"} → ${product.properties[key] ?? "не указано"}`);
    matches.push({ product, reasons: [
      `Совпадает категория: ${requirements.category}.`,
      ...keys.map(key => `${propertyLabels[key] ?? key}: совпадает (${product.properties[key]}).`),
      `Остаток ${product.quantity} покрывает запрошенное количество ${quantity}.`,
    ], differences, requiresReview: true });
    if (matches.length >= limit) break;
  }
  return { items: matches.slice(0, limit), checked,
    incomplete: !index?.complete || attempted < candidates.length || warnings.length > 0,
    warnings: [...warnings, "Кандидаты совпадают по переданному профилю. Отличия, полноту характеристик и применимость замены нужно подтвердить перед выбором."] };
}
