import { createDefaultCatalogClient } from "../assistant/catalogClient";
import type { Product } from "../assistant/types";
import { createEktSource, createCatalogService } from "../catalog/index.ts";

export type CartLine = {
  productId: string;
  name: string;
  sku?: string;
  quantity: number;
  price?: number;
  currency?: string;
};

export type CartSnapshot = {
  items: CartLine[];
  cartUrl: "/cart";
  demo: true;
};

type Pending = { token: string; productId: string; quantity: number; expiresAt: number };
type CartSession = { lines: CartLine[]; pending?: Pending; completed: Map<string, CartSnapshot> };
type State = { carts: Map<string, CartSession>; locks: Map<string, Promise<void>> };

// Shared across route modules and dev hot reload. Production needs a shared persistent store.
const globalState = globalThis as typeof globalThis & { __ektDemoCart?: State };
const state = globalState.__ektDemoCart ??= { carts: new Map(), locks: new Map() };

export class CartError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export function cartSessionId(request: Request): { id: string; created: boolean } {
  const cookies = request.headers.get("cookie") ?? "";
  const value = cookies.split(";").map((part) => part.trim()).find((part) => part.startsWith("ekt_demo_cart="))?.slice(14);
  if (value && /^[0-9a-f-]{36}$/i.test(value) && state.carts.has(value)) {
    return { id: value, created: false };
  }
  const id = crypto.randomUUID();
  state.carts.set(id, { lines: [], completed: new Map() });
  return { id, created: true };
}

export function getCart(id: string): CartSnapshot {
  return snapshot(requireCart(id));
}

export async function prepareCart(id: string, productId: string, quantity: number) {
  if (!productId || productId.length > 100 || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000) {
    throw new CartError("Укажите товар и целое количество от 1 до 1000.");
  }
  const product = await fetchProduct(productId);
  const cart = requireCart(id);
  checkQuantity(product, quantity, cart.lines.find((line) => line.productId === product.id)?.quantity ?? 0);
  const pending: Pending = { token: crypto.randomUUID(), productId: product.id, quantity, expiresAt: Date.now() + 10 * 60_000 };
  cart.pending = pending;
  return {
    confirmationToken: pending.token,
    product: { id: product.id, name: product.name, sku: product.sku, price: product.price, currency: product.currency },
    quantity,
    expiresInSeconds: 600,
  };
}

export async function confirmCart(id: string, token: string): Promise<CartSnapshot> {
  if (typeof token !== "string" || !/^[0-9a-f-]{36}$/i.test(token)) throw new CartError("Неверное подтверждение.");
  return withLock(id, async () => {
    const cart = requireCart(id);
    const previous = cart.completed.get(token);
    if (previous) return previous;
    const pending = cart.pending;
    if (!pending || pending.token !== token || pending.expiresAt < Date.now()) {
      throw new CartError("Подтверждение устарело. Выберите товар заново.", 409);
    }
    // Fetch again at commit time: the stock shown during preparation may have changed.
    const product = await fetchProduct(pending.productId);
    const existing = cart.lines.find((line) => line.productId === product.id);
    checkQuantity(product, pending.quantity, existing?.quantity ?? 0);
    if (existing) {
      existing.quantity += pending.quantity;
      existing.name = product.name;
      existing.price = product.price;
      existing.currency = product.currency;
    } else {
      cart.lines.push({ productId: product.id, name: product.name, sku: product.sku, quantity: pending.quantity, price: product.price, currency: product.currency });
    }
    cart.pending = undefined;
    const result = snapshot(cart);
    cart.completed.set(token, result);
    return result;
  });
}

function requireCart(id: string): CartSession {
  const cart = state.carts.get(id);
  if (!cart) throw new CartError("Сессия корзины истекла. Обновите страницу.", 409);
  return cart;
}

async function fetchProduct(id: string): Promise<Product> {
  let product: Product | null;
  try {
    const username = process.env.EKT_API_USERNAME || process.env.EKT_API_USER;
    const password = process.env.EKT_API_PASSWORD;
    if (username && password) {
      // The catalog owner's service re-fetches product detail rather than trusting search results.
      const fresh = await createCatalogService(createEktSource({ username, password })).getProduct(id);
      product = {
        id: fresh.id,
        sku: fresh.article,
        name: fresh.name,
        price: fresh.price ?? undefined,
        currency: fresh.currency ?? undefined,
        characteristics: Object.fromEntries(Object.entries(fresh.properties).map(([key, value]) => [key, String(value)])),
        availability: {
          status: fresh.availability,
          quantity: fresh.quantity ?? undefined,
        },
      };
    } else {
      product = await createDefaultCatalogClient().getProduct(id);
    }
  } catch {
    throw new CartError("Не удалось проверить актуальный остаток. Попробуйте позже.", 503);
  }
  if (!product) throw new CartError("Товар не найден в каталоге.", 404);
  return product;
}

function checkQuantity(product: Product, requested: number, alreadyInCart: number) {
  const available = product.availability.quantity;
  if (!Number.isSafeInteger(available) || available! < 0) {
    throw new CartError("Нет подтверждённых данных об остатке этого товара.", 409);
  }
  const rawMinimum = Object.entries(product.characteristics ?? {}).find(([key]) => key.toUpperCase() === "KRATNOST_MIN")?.[1];
  const minimum = rawMinimum === undefined ? 1 : Number(rawMinimum.replace(",", "."));
  if (!Number.isSafeInteger(minimum) || minimum < 1) throw new CartError("Нужно уточнить кратность заказа.", 409);
  if (requested % minimum !== 0) throw new CartError(`Количество должно быть кратно ${minimum}.`, 409);
  if (alreadyInCart + requested > available!) {
    throw new CartError(`Доступно ${available} шт.; в корзине уже ${alreadyInCart} шт.`, 409);
  }
}

function snapshot(cart: CartSession): CartSnapshot {
  return { items: cart.lines.map((line) => ({ ...line })), cartUrl: "/cart", demo: true };
}

async function withLock<T>(id: string, action: () => Promise<T>): Promise<T> {
  const previous = state.locks.get(id) ?? Promise.resolve();
  let unlock!: () => void;
  const next = new Promise<void>((resolve) => { unlock = resolve; });
  state.locks.set(id, next);
  await previous;
  try {
    return await action();
  } finally {
    unlock();
    if (state.locks.get(id) === next) state.locks.delete(id);
  }
}
