import { cartSessionId, confirmCart } from "../../../../lib/cart/cartStore";
import { cartFailure, cartResponse } from "../../../../lib/cart/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = cartSessionId(request);
  (request as Request & { cartSession?: typeof session }).cartSession = session;
  try {
    const body: unknown = await request.json();
    const values = body && typeof body === "object" ? body as Record<string, unknown> : {};
    const result = await confirmCart(session.id, values.confirmationToken as string);
    return cartResponse(request, result);
  } catch (error) {
    return cartFailure(error);
  }
}
