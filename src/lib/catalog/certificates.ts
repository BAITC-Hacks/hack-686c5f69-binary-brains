import type { Product } from "./types.ts";

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

const fieldPattern = /^(certificates?|certificate_files|sertifikat(?:y|s)?|sertifikat_sootvetstviya)$/i;

export function extractCertificates(raw: Record<string, unknown>, safeUrl: (value: unknown) => string | null) {
  const links = new Map<string, Product["certificates"][number]>();
  const sources: unknown[] = Object.entries(raw).filter(([key]) => fieldPattern.test(key)).map(([, value]) => value);
  const properties = raw.properties;
  if (Array.isArray(properties)) {
    for (const value of properties) {
      const row = object(value);
      if (fieldPattern.test(String(row.CODE ?? row.code ?? ""))) sources.push(row.VALUE ?? row.value);
    }
  } else {
    for (const [key, value] of Object.entries(object(properties))) if (fieldPattern.test(key)) sources.push(value);
  }
  let unresolved = false;
  function visit(value: unknown, name = "Сертификат", depth = 0): void {
    if (value == null || value === "" || value === false) return;
    if (depth > 6) { unresolved = true; return; }
    if (Array.isArray(value)) { for (const child of value) visit(child, name, depth + 1); return; }
    if (typeof value === "string") {
      const url = safeUrl(value);
      if (url) {
        if (!links.has(url) || name !== "Сертификат") links.set(url, { name, url });
      }
      else unresolved = true;
      return;
    }
    if (typeof value !== "object") { unresolved = true; return; }
    const row = object(value);
    const label = row.name ?? row.NAME ?? row.DESCRIPTION;
    const title = typeof label === "string" && label.trim() ? label.trim() : name;
    const children = Object.entries(row).filter(([key]) => /^(url|src|value|file|files)$/i.test(key));
    if (!children.length && Object.keys(row).length) unresolved = true;
    for (const [, child] of children) visit(child, title, depth + 1);
  }
  for (const source of sources) visit(source);
  return { certificates: [...links.values()], status: links.size ? "available" as const : unresolved ? "unresolved" as const : "not_provided" as const,
    unresolved };
}
