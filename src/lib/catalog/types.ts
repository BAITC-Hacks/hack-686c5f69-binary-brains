export type PropertyValue = string | number | boolean;

export interface ProductSummary {
  id: string;
  article: string;
  name: string;
  price: number | null;
  currency: string | null;
  url: string | null;
  image: string | null;
}

export interface Product extends ProductSummary {
  category: string | null;
  categorySource: "category" | "properties.KATEGORIYA" | null;
  description: string;
  quantity: number | null;
  availability: "in_stock" | "out_of_stock" | "unknown";
  stores: { id: string; name: string; quantity: number | null }[];
  // The warehouse schema and fulfillment rules are not yet verified.
  storesRaw: unknown;
  offersRaw: unknown;
  properties: Record<string, PropertyValue>;
  certificates: { name: string; url: string }[];
  minimumOrder: { rawValue: PropertyValue | null; verified: false };
  conflicts: { property: string; values: string[]; message: string }[];
  warnings: string[];
  source: "ekt_api" | "demo";
  checkedAt: string;
}

export interface CatalogSource {
  mode: "ekt_api" | "demo";
  listPage(page: number): Promise<unknown>;
  getDetail(id: string): Promise<unknown>;
}

export interface CatalogIndex {
  items: ProductSummary[];
  complete: boolean;
  stopReason: "empty_page" | "page_limit" | "repeated_page";
  pagesRead: number;
  indexedAt: string;
  source: CatalogSource["mode"];
}

export class CatalogError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "CatalogError";
    this.code = code;
  }
}
