import type { ProductSummary } from "../catalog/types.ts";

function tokens(value: string): Set<string> {
  return new Set(value.normalize("NFKC").toLocaleLowerCase("ru").replace(/&[a-z0-9#]+;/g, " ")
    .match(/[\p{L}\p{N}]+/gu)?.filter(token => token.length > 1) ?? []);
}

// Retrieval order only. Similar words never establish technical equivalence.
export function rankCandidates(original: ProductSummary, candidates: ProductSummary[]): ProductSummary[] {
  const query = tokens(original.name);
  return candidates.map((product, position) => ({ product, position,
    score: [...tokens(product.name)].reduce((score, token) => score + (query.has(token) ? 1 : 0), 0),
  })).sort((a, b) => b.score - a.score || a.position - b.position).map(item => item.product);
}
