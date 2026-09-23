import type { CatalogClient, CatalogSearchResult, Product } from "./types";
import { createCatalogClientFromEnv } from "./ektCatalogClient";

const demoProducts: Product[] = [
  {
    id: "demo-515291",
    sku: "515291",
    name: "Автоматический выключатель demo 16A",
    category: "Автоматические выключатели",
    price: 1250,
    currency: "KZT",
    characteristics: {
      current: "16A",
      poles: "1P",
      breakingCapacity: "6kA",
    },
    certificateUrl: "https://ekt.kz/certificates/demo-515291.pdf",
    availability: {
      status: "in_stock",
      quantity: 12,
      warehouse: "Демо-склад",
    },
  },
  {
    id: "demo-alt-16a",
    sku: "ALT-16A",
    name: "Аналог автоматического выключателя 16A",
    category: "Автоматические выключатели",
    price: 1190,
    currency: "KZT",
    characteristics: {
      current: "16A",
      poles: "1P",
      breakingCapacity: "6kA",
    },
    availability: {
      status: "limited",
      quantity: 4,
      warehouse: "Демо-склад",
    },
  },
];

export const demoCatalogClient: CatalogClient = {
  async searchProducts(query: string): Promise<CatalogSearchResult> {
    const normalized = query.toLowerCase();
    const products = demoProducts.filter((product) => {
      return [product.name, product.sku, product.category]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalized));
    });

    return { products: products.length > 0 ? products : demoProducts.slice(0, 1) };
  },

  async getProduct(id: string): Promise<Product | null> {
    return demoProducts.find((product) => product.id === id || product.sku === id) || null;
  },

  async findAlternatives(productId: string): Promise<Product[]> {
    return demoProducts
      .filter((product) => product.id !== productId)
      .map((product) => ({
        ...product,
        availability: product.availability,
      }));
  },
};

export function createDefaultCatalogClient(): CatalogClient {
  return createCatalogClientFromEnv() || demoCatalogClient;
}
