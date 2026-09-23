import { NextResponse } from "next/server";
import { CartError } from "./cartStore";

export function cartResponse(request: Request, payload: unknown, status = 200) {
  const response = NextResponse.json(payload, { status });
  const session = (request as Request & { cartSession?: { id: string; created: boolean } }).cartSession;
  if (session?.created) {
    response.cookies.set("ekt_demo_cart", session.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24,
    });
  }
  return response;
}

export function cartFailure(error: unknown) {
  const known = error instanceof CartError;
  return NextResponse.json({ error: known ? error.message : "Ошибка корзины." }, { status: known ? error.status : 500 });
}
