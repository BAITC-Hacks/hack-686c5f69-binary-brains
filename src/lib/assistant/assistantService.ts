import { demoCartClient } from "./cartClient";
import { createDefaultCatalogClient } from "./catalogClient";
import { detectIntent } from "./intentRouter";
import { getPurchaseInfoAnswer } from "./purchaseInfo";
import {
  addMessage,
  clearPendingCartItems,
  getOrCreateSession,
  setPendingCartItems,
} from "./sessionManager";
import type {
  AssistantResponse,
  CatalogClient,
  CartClient,
  PendingCartItem,
  Product,
  ProductCard,
} from "./types";

type AssistantServiceOptions = {
  catalogClient?: CatalogClient;
  cartClient?: CartClient;
};

export class AssistantService {
  private catalogClient: CatalogClient;
  private cartClient: CartClient;

  constructor(options: AssistantServiceOptions = {}) {
    this.catalogClient = options.catalogClient || createDefaultCatalogClient();
    this.cartClient = options.cartClient || demoCartClient;
  }

  async handleMessage(message: string, sessionId?: string): Promise<AssistantResponse> {
    const session = getOrCreateSession(sessionId);
    addMessage(session, "user", message);

    const intent = detectIntent(message);

    if (intent === "confirm_add_to_cart") {
      if (session.pendingCartItems.length === 0) {
        return this.reply(session.id, "Пока нет выбранных товаров для добавления. Напишите артикул или название товара.");
      }

      const { cartUrl } = await this.cartClient.addItems(session.pendingCartItems, session.id);
      clearPendingCartItems(session);
      return this.reply(session.id, "Готово, добавила выбранные позиции в корзину.", { cartUrl });
    }

    if (intent === "purchase_info") {
      const answer = getPurchaseInfoAnswer(message);
      return this.reply(session.id, answer || "Уточните, пожалуйста, вас интересует оплата, доставка или минимальная партия?");
    }

    if (intent === "alternatives") {
      const productId = session.pendingCartItems[0]?.productId || extractProductId(message);
      if (!productId) {
        return this.reply(session.id, "Укажите артикул или товар, для которого нужно найти аналог.");
      }

      const alternatives = await this.catalogClient.findAlternatives(productId, message);
      const cards = alternatives.map((product) => this.toProductCard(product, product.alternativeReason || "Подходит как возможная замена по категории и характеристикам."));
      return this.reply(session.id, "Нашла возможные аналоги. Проверьте характеристики перед добавлением.", { cards });
    }

    if (intent === "product_lookup") {
      const directProductId = extractProductId(message);
      const directProduct = directProductId ? await this.catalogClient.getProduct(directProductId) : null;
      const result = directProduct
        ? { products: [directProduct] }
        : await this.catalogClient.searchProducts(message);

      if (result.products.length === 0) {
        return this.reply(session.id, "Не нашла товар по запросу. Уточните артикул, бренд или ключевую характеристику.");
      }

      const product = result.products[0];
      const quantity = extractQuantity(message) || 1;
      const pendingItem: PendingCartItem = {
        productId: product.id,
        sku: product.sku,
        name: product.name,
        quantity: clampQuantity(quantity, product.availability.quantity),
      };

      setPendingCartItems(session, [pendingItem]);

      return this.reply(session.id, formatProductAnswer(product, pendingItem.quantity), {
        cards: result.products.map((item) => this.toProductCard(item)),
        needsConfirmation: true,
      });
    }

    return this.reply(session.id, "Уточните, пожалуйста, артикул, название товара или что именно нужно узнать: наличие, характеристики, аналог, оплата или доставка.");
  }

  private reply(sessionId: string, message: string, extra: Partial<AssistantResponse> = {}): AssistantResponse {
    const session = getOrCreateSession(sessionId);
    addMessage(session, "assistant", message);
    return {
      sessionId,
      message,
      ...extra,
    };
  }

  private toProductCard(product: Product, reason?: string): ProductCard {
    return {
      id: product.id,
      sku: product.sku,
      name: product.name,
      price: product.price,
      currency: product.currency,
      availability: product.availability,
      reason,
    };
  }
}

function formatProductAnswer(product: Product, quantity: number): string {
  const availability = product.availability.quantity
    ? `В наличии: ${product.availability.quantity} шт.`
    : "Наличие нужно уточнить.";
  const certificate = product.certificateUrl ? ` Сертификат: ${product.certificateUrl}` : "";

  return `${product.name}. ${availability} Количество для корзины: ${quantity}. Для добавления напишите: "да, добавь".${certificate}`;
}

function extractProductId(message: string): string | null {
  const numericId = message.match(/\b\d{4,}\b/);
  if (numericId) {
    return numericId[0];
  }

  const article = message.match(/\b(?=[A-Z0-9_-]*\d)[A-Z0-9_-]{4,}\b/i);
  if (article) {
    return article[0];
  }

  const demoId = message.match(/\bDEMO-[A-Z0-9_-]+\b/i);
  if (demoId) {
    return demoId[0];
  }

  return null;
}

function extractQuantity(message: string): number | null {
  const match = message.match(/(\d+)\s*(шт|штук|ед|pcs)?/i);
  return match ? Number(match[1]) : null;
}

function clampQuantity(requested: number, available?: number): number {
  if (!available || available < 1) {
    return requested;
  }

  return Math.min(requested, available);
}

export const assistantService = new AssistantService();
