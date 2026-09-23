import type { CatalogClient, CatalogSearchResult, Product, ProductAvailability } from "./types";

type EktCatalogOptions = {
  baseUrl: string;
  username: string;
  password: string;
  searchPages?: number;
};

type EktProduct = Record<string, unknown>;

export function createEktCatalogClient(options: EktCatalogOptions): CatalogClient {
  const client = new EktCatalogHttpClient(options);

  return {
    searchProducts: (query) => client.searchProducts(query),
    getProduct: (id) => client.getProduct(id),
    findAlternatives: (productId, requirements) => client.findAlternatives(productId, requirements),
  };
}

export function createCatalogClientFromEnv(): CatalogClient | null {
  const baseUrl = process.env.EKT_API_BASE_URL;
  const username = process.env.EKT_API_USER;
  const password = process.env.EKT_API_PASSWORD;

  if (!baseUrl || !username || !password) {
    return null;
  }

  return createEktCatalogClient({
    baseUrl,
    username,
    password,
    searchPages: Number(process.env.EKT_API_SEARCH_PAGES || 10),
  });
}

class EktCatalogHttpClient {
  private baseUrl: string;
  private authHeader: string;
  private searchPages: number;

  constructor(options: EktCatalogOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.authHeader = `Basic ${encodeBasicAuth(options.username, options.password)}`;
    this.searchPages = options.searchPages || 10;
  }

  async searchProducts(query: string): Promise<CatalogSearchResult> {
    const normalizedQuery = normalize(query);
    const pages = await this.fetchProductPages(this.searchPages);
    const products = pages
      .map(normalizeEktProduct)
      .filter((product) => productMatchesQuery(product, normalizedQuery))
      .slice(0, 8);

    return { products };
  }

  async getProduct(id: string): Promise<Product | null> {
    const detail = await this.request<EktProduct>(`/products/detail?id=${encodeURIComponent(id)}`);
    return normalizeEktProduct(detail);
  }

  async findAlternatives(productId: string, requirements = ""): Promise<Product[]> {
    const source = await this.getProduct(productId);

    if (!source) {
      return [];
    }

    const query = [source.category, requirements].filter(Boolean).join(" ");
    const candidates = (await this.searchProducts(query)).products
      .filter((product) => product.id !== source.id)
      .map((product) => ({
        ...product,
        alternativeReason: buildAlternativeReason(source, product),
      }));

    return candidates;
  }

  private async fetchProductPages(limit: number): Promise<EktProduct[]> {
    const products: EktProduct[] = [];

    for (let page = 1; page <= limit; page += 1) {
      const path = page === 1 ? "/products" : `/products?page=${page}`;
      const response = await this.request<unknown>(path);
      const pageProducts = extractProductList(response);

      if (pageProducts.length === 0) {
        break;
      }

      products.push(...pageProducts);
    }

    return products;
  }

  private async request<T>(path: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: {
        Authorization: this.authHeader,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`EKT API error ${response.status} for ${path}`);
    }

    return response.json() as Promise<T>;
  }
}

function extractProductList(response: unknown): EktProduct[] {
  if (Array.isArray(response)) {
    return response.filter(isRecord);
  }

  if (!isRecord(response)) {
    return [];
  }

  const possibleKeys = ["data", "items", "products", "result", "rows"];

  for (const key of possibleKeys) {
    const value = response[key];
    if (Array.isArray(value)) {
      return value.filter(isRecord);
    }
  }

  return [];
}

function normalizeEktProduct(raw: EktProduct): Product {
  const id = readString(raw, ["id", "ID", "product_id", "PRODUCT_ID", "kod", "KOD"]) || "";
  const sku = readString(raw, ["sku", "SKU", "artikul", "ARTIKUL", "article", "ARTICLE", "code", "CODE"]);
  const name = readString(raw, ["name", "NAME", "naimenovanie", "NAIMENOVANIE", "title", "TITLE"]) || sku || id;
  const category = readString(raw, ["category", "CATEGORY", "kategoriya", "KATEGORIYA", "group", "GROUP"]);
  const price = readNumber(raw, ["price", "PRICE", "cena", "CENA", "cost", "COST"]);
  const quantity = readNumber(raw, ["quantity", "QUANTITY", "ostatok", "OSTATOK", "stock", "STOCK", "available", "AVAILABLE"]);
  const certificateUrl = readString(raw, ["certificateUrl", "CERTIFICATE_URL", "sertifikat", "SERTIFIKAT", "certificate", "CERTIFICATE"]);

  return {
    id: id || sku || name,
    sku,
    name,
    category,
    price,
    currency: price ? "KZT" : undefined,
    characteristics: extractCharacteristics(raw),
    certificateUrl,
    availability: normalizeAvailability(quantity, raw),
  };
}

function normalizeAvailability(quantity: number | undefined, raw: EktProduct): ProductAvailability {
  const warehouse = readString(raw, ["warehouse", "WAREHOUSE", "sklad", "SKLAD"]);

  if (quantity === undefined) {
    return { status: "unknown", warehouse };
  }

  if (quantity <= 0) {
    return { status: "out_of_stock", quantity, warehouse };
  }

  return {
    status: quantity <= 5 ? "limited" : "in_stock",
    quantity,
    warehouse,
  };
}

function extractCharacteristics(raw: EktProduct): Record<string, string> {
  const characteristics: Record<string, string> = {};
  const skipped = new Set(["id", "ID", "name", "NAME", "price", "PRICE"]);

  for (const [key, value] of Object.entries(raw)) {
    if (skipped.has(key) || value === null || value === undefined || typeof value === "object") {
      continue;
    }

    const normalizedKey = key.toLowerCase();
    if (/(har|char|param|voltage|tok|power|mosh|napr|edin|krat|measure|unit)/i.test(normalizedKey)) {
      characteristics[key] = String(value);
    }
  }

  return characteristics;
}

function productMatchesQuery(product: Product, query: string): boolean {
  const haystack = normalize([
    product.id,
    product.sku,
    product.name,
    product.category,
    ...Object.values(product.characteristics || {}),
  ].filter(Boolean).join(" "));

  const queryParts = query
    .split(/\s+/)
    .map((part) => part.replace(/[^\p{L}\p{N}_-]/gu, ""))
    .filter((part) => part.length > 2);

  if (queryParts.length === 0) {
    return false;
  }

  return queryParts.every((part) => haystack.includes(part))
    || queryParts.some((part) => haystack.includes(part));
}

function buildAlternativeReason(source: Product, candidate: Product): string {
  const matches: string[] = [];
  const differences: string[] = [];

  if (source.category && candidate.category && normalize(source.category) === normalize(candidate.category)) {
    matches.push("та же категория");
  }

  for (const [key, value] of Object.entries(source.characteristics || {})) {
    const candidateValue = candidate.characteristics?.[key];
    if (!candidateValue) {
      continue;
    }

    if (areEquivalentValues(value, candidateValue)) {
      matches.push(`совпадает ${key}`);
    } else {
      differences.push(`${key}: ${value} / ${candidateValue}`);
    }
  }

  const matchText = matches.length > 0 ? matches.join(", ") : "похожая карточка товара";
  const differenceText = differences.length > 0 ? ` Отличия: ${differences.join("; ")}.` : "";

  return `${matchText}.${differenceText}`;
}

function areEquivalentValues(left: string, right: string): boolean {
  return normalizeUnitValue(left) === normalizeUnitValue(right);
}

function normalizeUnitValue(value: string): string {
  return normalize(value)
    .replace(/\bампер(а|ов)?\b/g, "a")
    .replace(/\bвольт(а|ов)?\b/g, "v")
    .replace(/\bватт(а|ов)?\b/g, "w")
    .replace(/\s+/g, "");
}

function readString(raw: EktProduct, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number") {
      return String(value);
    }
  }

  return undefined;
}

function readNumber(raw: EktProduct, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "number") {
      return value;
    }
    if (typeof value === "string") {
      const parsed = Number(value.replace(/\s/g, "").replace(",", "."));
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
  }

  return undefined;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/ё/g, "е").trim();
}

function isRecord(value: unknown): value is EktProduct {
  return typeof value === "object" && value !== null;
}

function encodeBasicAuth(username: string, password: string): string {
  return btoa(`${username}:${password}`);
}
