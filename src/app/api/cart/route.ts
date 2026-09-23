import { cartSessionId, getCart } from "../../../lib/cart/cartStore";
import { cartResponse } from "../../../lib/cart/http";

export const runtime = "nodejs";

export function GET(request: Request) {
  const session = cartSessionId(request);
  (request as Request & { cartSession?: typeof session }).cartSession = session;
  return cartResponse(request, getCart(session.id));
}
