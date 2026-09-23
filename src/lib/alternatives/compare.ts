import type { PropertyValue } from "../catalog/types.ts";

// Units are converted only for explicitly known API fields.
const dimensions: Record<string, "current" | "voltage"> = {
  NOMINALNYY_TOK: "current",
  NOMINALNAYA_OTKLYUCHAYUSHCHAYA_SPOSOBNOST: "current",
  NOMINALNOE_NAPRYAZHENIE: "voltage",
};

function text(value: PropertyValue): string {
  return String(value).trim().toLocaleLowerCase("ru").replace(/\s+/g, " ");
}

function measurement(value: PropertyValue, dimension: "current" | "voltage"): number | null {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d+(?:[.,]\d+)?)\s*([mмkкKК]?)([aAаАvVвВ])$/u);
  if (!match) return null;
  const unit = `${match[2]}${match[3]}`.toLowerCase().replace(/а/g, "a").replace(/в/g, "v").replace(/к/g, "k").replace(/м/g, "m");
  if (!unit.endsWith(dimension === "current" ? "a" : "v")) return null;
  const scale = unit.startsWith("k") ? 1000 : unit.startsWith("m") ? 0.001 : 1;
  return Number(match[1].replace(",", ".")) * scale;
}

export function equivalentProperty(key: string, left: PropertyValue, right: PropertyValue): boolean {
  const dimension = dimensions[key];
  if (!dimension) return text(left) === text(right);
  const a = measurement(left, dimension);
  const b = measurement(right, dimension);
  // Missing units and ranges are ambiguous: never guess their meaning.
  if (a !== null || b !== null) {
    return a !== null && b !== null && Math.abs(a - b) <= Number.EPSILON * Math.max(1, a, b) * 4;
  }
  return text(left) === text(right);
}
