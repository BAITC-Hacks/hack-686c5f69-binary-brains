import { cartSessionId, prepareCart } from "../../../../lib/cart/cartStore";
import { cartFailure, cartResponse } from "../../../../lib/cart/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = cartSessionId(request);
  (request as Request & { cartSession?: typeof session }).cartSession = session;
  try {
    const body: unknown = await request.json();
    const values = body && typeof body === "object" ? body as Record<string, unknown> : {};
    const result = await prepareCart(session.id, String(values.productId ?? ""), values.quantity as number);
    return cartResponse(request, result);
  } catch (error) {
    return cartFailure(error);
  }
}
