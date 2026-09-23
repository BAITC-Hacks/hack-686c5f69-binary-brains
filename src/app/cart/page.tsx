"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CartSnapshot } from "../../lib/cart/cartStore";

export default function CartPage() {
  const [cart, setCart] = useState<CartSnapshot>();
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/cart", { cache: "no-store" })
      .then(async (response) => { if (!response.ok) throw new Error("Не удалось загрузить корзину."); return response.json() as Promise<CartSnapshot>; })
      .then(setCart).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Ошибка загрузки."));
  }, []);
  return (
    <main className="cart-page">
      <Link href="/">← Вернуться в чат</Link>
      <h1>Демонстрационная корзина</h1>
      <p>Здесь отображаются товары, добавленные после вашего подтверждения. Реальный заказ на ekt.kz не создаётся.</p>
      {error && <p role="alert">{error}</p>}
      {!cart && !error && <p>Загружаем корзину…</p>}
      {cart?.items.length === 0 && <p>Корзина пуста. Выберите товар в чате.</p>}
      {cart?.items.map((item) => (
        <article className="cart-item" key={item.productId}>
          <strong>{item.name}</strong>
          <span>Артикул: {item.sku || "не указан"}</span>
          <span>Количество: {item.quantity} шт.</span>
          <span>{item.price === undefined ? "Цена уточняется" : `${new Intl.NumberFormat("ru-RU").format(item.price)} ${item.currency ?? ""} за штуку`}</span>
        </article>
      ))}
    </main>
  );
}
