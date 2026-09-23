import type { Product, PropertyValue } from "./types.ts";

// Narrow extraction rules for explicit luminaire specifications, with provenance.
export function extractLuminaireProperties(name: string, description: string) {
  const properties: Record<string, PropertyValue> = {};
  const evidence: Record<string, { source: "name" | "description"; text: string }> = {};
  const conflicts: Product["conflicts"] = [];
  const rules = [
    { key: "TEXT_LAMP_COUNT", pattern: /(\d+)\s*[xх×]\s*[eе]27(?!\d)/giu, number: true },
    { key: "TEXT_DIAMETER_MM", pattern: /диаметр\s*:?\s*(\d+(?:[.,]\d+)?)\s*мм/giu, number: true },
    // API descriptions sometimes join adjacent HTML text as "E27IP20".
    { key: "TEXT_IP_RATING", pattern: /(?<![a-z])IP\s*(\d{2})(?!\d)/giu, number: false },
  ];
  for (const rule of rules) {
    const matches = ([{ source: "name", text: name }, { source: "description", text: description }] as const)
      .flatMap(input => [...input.text.matchAll(rule.pattern)].map(match => ({ source: input.source,
        text: match[0], value: rule.number ? Number(match[1].replace(",", ".")) : `IP${match[1]}` })));
    const values = [...new Set(matches.map(match => String(match.value)))];
    if (values.length > 1) {
      conflicts.push({ property: rule.key, values, message: `В тексте противоречивые значения ${rule.key}; требуется уточнение.` });
    } else if (matches.length) {
      properties[rule.key] = matches[0].value;
      evidence[rule.key] = { source: matches[0].source, text: matches[0].text };
    }
  }
  return { properties, evidence, conflicts };
}
