import { CatalogError } from "./types.ts";
import type { CatalogIndex, CatalogSource, Product } from "./types.ts";
import { normalizeProduct, normalizeSummary, record } from "./normalize.ts";

export function createCatalogService(source: CatalogSource) {
  let index: CatalogIndex | null = null;
  async function refreshIndex(options: { maxPages?: number } = {}): Promise<CatalogIndex> {
    const maxPages = options.maxPages ?? 10;
    if (!Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 1000) {
      throw new CatalogError("INPUT", "maxPages должен быть от 1 до 1000.");
    }
    const items = new Map<string, ReturnType<typeof normalizeSummary>>();
    let stopReason: CatalogIndex["stopReason"] = "page_limit";
    let pagesRead = 0;
    for (let page = 1; page <= maxPages; page++) {
      const payload = record(await source.listPage(page));
      if (!Array.isArray(payload.items)) throw new CatalogError("INVALID_DATA", "В ответе каталога отсутствует массив items.");
      pagesRead++;
      if (payload.items.length === 0) { stopReason = "empty_page"; break; }
      const products = payload.items.map(normalizeSummary);
      if (products.every(product => items.has(product.id))) { stopReason = "repeated_page"; break; }
      for (const product of products) items.set(product.id, product);
    }
    index = { items: [...items.values()], complete: stopReason === "empty_page", stopReason,
      pagesRead, indexedAt: new Date().toISOString(), source: source.mode };
    return structuredClone(index);
  }
  function getIndex(): CatalogIndex {
    if (!index) throw new CatalogError("INDEX_NOT_READY", "Сначала выполните refreshIndex().");
    return structuredClone(index);
  }
  function searchProducts(query: string, limit = 10) {
    const snapshot = getIndex();
    const needle = query.trim().toLocaleLowerCase("ru");
    if (!needle || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new CatalogError("INPUT", "Нужны непустой запрос и limit от 1 до 100.");
    }
    const exact = snapshot.items.filter(item => item.article.toLocaleLowerCase("ru") === needle);
    const tokens = needle.split(/\s+/);
    const matches = exact.length ? exact : snapshot.items.filter(item => {
      const text = `${item.article} ${item.name}`.toLocaleLowerCase("ru");
      return tokens.every(token => text.includes(token));
    });
    return { items: matches.slice(0, limit), match: exact.length ? "exact_article" as const : "text" as const,
      totalMatches: matches.length, coverage: { complete: snapshot.complete, stopReason: snapshot.stopReason,
        indexedAt: snapshot.indexedAt, source: snapshot.source },
      warning: matches.length === 0 && !snapshot.complete ? "Не найдено в загруженной выборке; отсутствие во всём каталоге не подтверждено." : null };
  }
  async function getProduct(id: string): Promise<Product> {
    const product = normalizeProduct(await source.getDetail(id), source.mode);
    if (product.id !== id) throw new CatalogError("INVALID_DATA", "API вернул другой id товара.");
    return product;
  }
  return { refreshIndex, getIndex, searchProducts, getProduct };
}

export type CatalogService = ReturnType<typeof createCatalogService>;
