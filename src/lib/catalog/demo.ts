import { CatalogError } from "./types.ts";
import type { CatalogSource } from "./types.ts";

// Synthetic fixtures. IDs, availability, prices and URLs do not represent ekt.kz inventory.
export const demoProducts = [
  { id: "demo-1", article: "DEMO-160-OLD", name: "ДЕМО автомат 3P 160А 18kA — нет в наличии",
    category: "circuit-breaker", price: 100, currency: "DEMO", quantity: 0, stores: [],
    properties: { NOMINALNYY_TOK: 160, POLES: 3, BREAKING_CAPACITY_KA: 18, TRIP_TYPE: "thermal-magnetic", VOLTAGE: 400, BRAND: "Demo A", KRATNOST_MIN: 1 } },
  { id: "demo-2", article: "DEMO-160-NEW", name: "ДЕМО автомат 3P 160А 18kA — кандидат",
    category: "circuit-breaker", price: 120, currency: "DEMO", quantity: 8, stores: [],
    certificates: [{ name: "ДЕМО ссылка, не настоящий сертификат", url: "https://example.invalid/demo-certificate.pdf" }],
    properties: { NOMINALNYY_TOK: 160, POLES: 3, BREAKING_CAPACITY_KA: 18, TRIP_TYPE: "thermal-magnetic", VOLTAGE: 400, BRAND: "Demo B", KRATNOST_MIN: 1 } },
  { id: "demo-3", article: "DEMO-250", name: "ДЕМО автомат 3P 250А 18kA — другой ток",
    category: "circuit-breaker", price: 140, currency: "DEMO", quantity: 9, stores: [],
    properties: { NOMINALNYY_TOK: 250, POLES: 3, BREAKING_CAPACITY_KA: 18, TRIP_TYPE: "thermal-magnetic", VOLTAGE: 400, BRAND: "Demo B" } },
  { id: "demo-4", article: "DEMO-CONFLICT", name: "ДЕМО DRX250 3ф 160А 18ka — конфликт",
    category: "circuit-breaker", price: 130, quantity: 23, stores: [],
    properties: { NOMINALNYY_TOK: { VALUE: "250" }, KRATNOST_MIN: 1 } },
];

export const demoProfile = {
  category: "circuit-breaker",
  requiredProperties: ["NOMINALNYY_TOK", "POLES", "BREAKING_CAPACITY_KA", "TRIP_TYPE", "VOLTAGE"],
};

export function createDemoSource(): CatalogSource {
  return {
    mode: "demo",
    async listPage(page) {
      const items = structuredClone(demoProducts.slice((page - 1) * 2, page * 2));
      return { page, per_page: 2, count: items.length, items };
    },
    async getDetail(id) {
      const product = demoProducts.find(item => item.id === id);
      if (!product) throw new CatalogError("NOT_FOUND", "Демонстрационный товар не найден.");
      return structuredClone(product);
    },
  };
}
