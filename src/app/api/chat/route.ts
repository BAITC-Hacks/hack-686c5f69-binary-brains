import { NextResponse } from "next/server";
import { assistantService } from "../../../lib/assistant/assistantService";
import { addMessage, clearPendingCartItems, getOrCreateSession } from "../../../lib/assistant/sessionManager";
import { cartSessionId, confirmCart, prepareCart } from "../../../lib/cart/cartStore";
import { cartFailure, cartResponse } from "../../../lib/cart/http";

export const runtime = "nodejs";
const confirmations = new Map<string, Promise<{ sessionId: string; message: string; cartUrl?: string }>>();

export async function POST(request: Request) {
  const body = await request.json();
  const message = String(body.message || "").trim();
  const sessionId = body.sessionId ? String(body.sessionId) : undefined;

  if (!message) {
    return NextResponse.json(
      { error: "message is required" },
      { status: 400 },
    );
  }

  // The assistant stores a proposed line, but only this explicit confirmation can write to the cart.
  if (/^(?:да[, .!]*добавь|подтверждаю|добавь(?:\s+в\s+корзину)?)\s*[.!]?$/i.test(message)) {
    const cartSession = cartSessionId(request);
    (request as Request & { cartSession?: typeof cartSession }).cartSession = cartSession;
    const chatSession = getOrCreateSession(sessionId);
    let task = confirmations.get(chatSession.id);
    if (!task) {
      task = (async () => {
        const items = chatSession.pendingCartItems;
        if (items.length !== 1) {
          return { sessionId: chatSession.id, message: "Сначала выберите один товар и количество." };
        }
        const item = items[0];
        const prepared = await prepareCart(cartSession.id, item.productId, item.quantity);
        const cart = await confirmCart(cartSession.id, prepared.confirmationToken);
        clearPendingCartItems(chatSession);
        addMessage(chatSession, "user", message);
        addMessage(chatSession, "assistant", "Товар добавлен в демонстрационную корзину.");
        return { sessionId: chatSession.id, message: "Товар добавлен в демонстрационную корзину.", cartUrl: cart.cartUrl };
      })();
      confirmations.set(chatSession.id, task);
    }
    try {
      return cartResponse(request, await task);
    } catch (error) {
      return cartFailure(error);
    } finally {
      if (confirmations.get(chatSession.id) === task) confirmations.delete(chatSession.id);
    }
  }

  const response = await assistantService.handleMessage(message, sessionId);
  return NextResponse.json(response);
}
