"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { AssistantResponse, ProductCard, RecognizedItem } from "../lib/assistant/types";

type Entry = { id: string; role: "user" | "assistant"; text: string; cards?: ProductCard[]; items?: RecognizedItem[]; cartUrl?: string };
type Prepared = { confirmationToken: string; product: { name: string; price?: number; currency?: string }; quantity: number };

function formatPrice(price?: number, currency?: string) {
  return price === undefined ? "Цена уточняется" : `${new Intl.NumberFormat("ru-RU").format(price)} ${currency || ""}`.trim();
}

async function responseJson<T>(response: Response): Promise<T> {
  const value = await response.json();
  if (!response.ok) throw new Error(typeof value.error === "string" ? value.error : "Ошибка запроса. Попробуйте ещё раз.");
  return value as T;
}

export function ChatWorkspace() {
  const [entries, setEntries] = useState<Entry[]>([{ id: "hello", role: "assistant", text: "Здравствуйте! Напишите артикул или название товара. Можно загрузить спецификацию, а затем выбрать товары для корзины." }]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string>();
  const [pending, setPending] = useState<Prepared>();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [cartBusy, setCartBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => { void fetch("/api/cart", { cache: "no-store" }); }, []);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [entries, pending]);

  const append = (entry: Omit<Entry, "id">) => setEntries((prev) => [...prev, { ...entry, id: crypto.randomUUID() }]);

  async function sendMessage(text: string) {
    const message = text.trim();
    if (!message || busy || cartBusy) return;
    setInput("");
    append({ role: "user", text: message });
    if (/^\s*(да[,.! ]*добавь|подтверждаю|добавь в корзину)\s*[.!]?\s*$/i.test(message)) {
      if (pending) await confirmSelection();
      else append({ role: "assistant", text: "Сначала выберите товар и количество на карточке. Затем подтвердите добавление." });
      return;
    }
    setBusy(true);
    try {
      const result = await responseJson<AssistantResponse>(await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message }),
      }));
      setSessionId(result.sessionId);
      append({ role: "assistant", text: result.message, cards: result.cards, items: result.recognizedItems, cartUrl: result.cartUrl });
    } catch (error) {
      append({ role: "assistant", text: error instanceof Error ? error.message : "Сервис временно недоступен." });
    } finally { setBusy(false); }
  }

  async function upload(file: File) {
    append({ role: "user", text: `Файл: ${file.name}` });
    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      if (sessionId) form.set("sessionId", sessionId);
      const result = await responseJson<{ sessionId: string; fileName: string; items: RecognizedItem[] }>(await fetch("/api/upload", { method: "POST", body: form }));
      setSessionId(result.sessionId);
      append({ role: "assistant", text: result.items.length ? "Распознанные позиции. Проверьте каждую перед выбором товара:" : "В файле не удалось выделить позиции. Укажите артикул в чате или загрузите другой файл.", items: result.items });
    } catch (error) {
      append({ role: "assistant", text: error instanceof Error ? error.message : "Не удалось обработать файл." });
    } finally { setBusy(false); if (fileInput.current) fileInput.current.value = ""; }
  }

  async function selectProduct(card: ProductCard) {
    if (cartBusy) return;
    setCartBusy(true);
    setPending(undefined);
    try {
      const result = await responseJson<Prepared>(await fetch("/api/cart/prepare", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: card.id, quantity: quantities[card.id] ?? 1 }),
      }));
      setPending(result);
      append({ role: "assistant", text: `Проверьте выбор: ${result.product.name}, ${result.quantity} шт. ${formatPrice(result.product.price, result.product.currency)} за штуку. Добавить в демонстрационную корзину?` });
    } catch (error) {
      append({ role: "assistant", text: error instanceof Error ? error.message : "Не удалось проверить товар." });
    } finally { setCartBusy(false); }
  }

  async function confirmSelection() {
    if (!pending || cartBusy) return;
    setCartBusy(true);
    const token = pending.confirmationToken;
    try {
      const result = await responseJson<{ cartUrl: string }>(await fetch("/api/cart/confirm", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmationToken: token }),
      }));
      setPending(undefined);
      append({ role: "assistant", text: "Товар добавлен в демонстрационную корзину.", cartUrl: result.cartUrl });
    } catch (error) {
      setPending(undefined);
      append({ role: "assistant", text: error instanceof Error ? error.message : "Не удалось добавить товар." });
    } finally { setCartBusy(false); }
  }

  return (
    <main className="workspace">
      <header className="topbar">
        <div><strong>ekt.kz · помощник</strong><small>Подбор электротоваров</small></div>
        <Link className="cart-link" href="/cart">Корзина ↗</Link>
      </header>
      <section className="chat" aria-label="Чат консультанта">
        <div className="intro"><h1>Поможем подобрать товар</h1><p>Спросите о наличии, характеристиках или аналогах.</p></div>
        <div className="messages" aria-live="polite">
          {entries.map((entry) => (
            <div key={entry.id} className={`message ${entry.role}`}>
              <div className="bubble">{entry.text}</div>
              {entry.cards && entry.cards.length > 0 && (
                <div className="cards">{entry.cards.map((card) => (
                  <article className="product-card" key={card.id}>
                    <strong>{card.name}</strong>
                    {card.sku && <small>Артикул: {card.sku}</small>}
                    <span>{formatPrice(card.price, card.currency)}</span>
                    <span>{card.availability.quantity !== undefined ? `Остаток: ${card.availability.quantity} шт.` : "Остаток уточняется"}</span>
                    {card.reason && <p>Почему подходит: {card.reason}</p>}
                    <div className="card-actions">
                      <label>Шт. <input aria-label={`Количество ${card.name}`} type="number" min="1" max="1000" step="1" value={quantities[card.id] ?? 1} onChange={(event) => setQuantities((prev) => ({ ...prev, [card.id]: Number(event.target.value) }))} /></label>
                      <button type="button" disabled={cartBusy || card.availability.status === "out_of_stock"} onClick={() => void selectProduct(card)}>Выбрать</button>
                    </div>
                  </article>
                ))}</div>
              )}
              {entry.items && entry.items.length > 0 && (
                <div className="recognized">{entry.items.map((item, index) => (
                  <div key={`${entry.id}-${index}`}><span>{item.name || item.sku || item.rawText}{item.quantity ? ` · ${item.quantity} шт.` : ""}</span><button type="button" disabled={busy} onClick={() => void sendMessage(item.sku || item.name || item.rawText)}>Найти</button></div>
                ))}</div>
              )}
              {entry.cartUrl && <Link className="action-link" href={entry.cartUrl}>Открыть корзину →</Link>}
            </div>
          ))}
          {pending && <div className="confirmation"><span>{pending.product.name} · {pending.quantity} шт.</span><button type="button" disabled={cartBusy} onClick={() => void confirmSelection()}>Да, добавить в корзину</button><button className="secondary" type="button" disabled={cartBusy} onClick={() => setPending(undefined)}>Отмена</button></div>}
          {busy && <p className="working">Обрабатываю запрос…</p>}
          <div ref={bottom} />
        </div>
        <form className="composer" onSubmit={(event) => { event.preventDefault(); void sendMessage(input); }}>
          <input ref={fileInput} className="visually-hidden" type="file" accept=".jpg,.jpeg,.png,.xlsx,.xls,.docx,.doc,.pdf" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} />
          <button type="button" className="attach" aria-label="Прикрепить файл" title="Прикрепить файл" disabled={busy} onClick={() => fileInput.current?.click()}>＋</button>
          <input aria-label="Сообщение" placeholder="Напишите артикул или вопрос…" value={input} onChange={(event) => setInput(event.target.value)} />
          <button type="submit" disabled={busy || !input.trim()}>Отправить</button>
        </form>
      </section>
      <footer>Демонстрационная корзина. Заказ на ekt.kz не оформляется, платёжные данные не запрашиваются.</footer>
    </main>
  );
}
