export type ChatRole = "user" | "assistant";

export type ProductAvailability = {
  status: "in_stock" | "out_of_stock" | "limited" | "unknown";
  quantity?: number;
  warehouse?: string;
};

export type Product = {
  id: string;
  sku?: string;
  name: string;
  category?: string;
  price?: number;
  currency?: string;
  characteristics?: Record<string, string>;
  certificateUrl?: string;
  availability: ProductAvailability;
};

export type ProductCard = {
  id: string;
  sku?: string;
  name: string;
  price?: number;
  currency?: string;
  availability: ProductAvailability;
  reason?: string;
};

export type RecognizedItem = {
  rawText: string;
  sku?: string;
  name?: string;
  quantity?: number;
  confidence: number;
};

export type PendingCartItem = {
  productId: string;
  sku?: string;
  name: string;
  quantity: number;
};

export type ChatMessage = {
  role: ChatRole;
  content: string;
  createdAt: string;
};

export type AssistantSession = {
  id: string;
  messages: ChatMessage[];
  pendingCartItems: PendingCartItem[];
  recognizedItems: RecognizedItem[];
};

export type AssistantResponse = {
  message: string;
  cards?: ProductCard[];
  sessionId: string;
  recognizedItems?: RecognizedItem[];
  cartUrl?: string;
  needsConfirmation?: boolean;
};

export type CatalogSearchResult = {
  products: Product[];
};

export type CatalogClient = {
  searchProducts(query: string): Promise<CatalogSearchResult>;
  getProduct(id: string): Promise<Product | null>;
  findAlternatives(productId: string, requirements?: string): Promise<Product[]>;
};

export type CartClient = {
  addItems(items: PendingCartItem[], sessionId: string): Promise<{ cartUrl: string }>;
};
