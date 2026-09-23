import type { RecognizedItem } from "../assistant/types";

const skuPattern = /\b[A-ZА-Я0-9][A-ZА-Я0-9-]{3,}\b/gi;
const quantityPattern = /(\d+)\s*(шт|штук|ед|pcs)?/i;

export function extractItemsFromText(text: string): RecognizedItem[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const sku = line.match(skuPattern)?.[0];
      const quantityMatch = line.match(quantityPattern);
      const quantity = quantityMatch ? Number(quantityMatch[1]) : undefined;

      return {
        rawText: line,
        sku,
        name: sku ? line.replace(sku, "").trim() || undefined : line,
        quantity,
        confidence: sku ? 0.75 : 0.45,
      };
    });
}
