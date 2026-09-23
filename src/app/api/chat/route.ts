import { NextResponse } from "next/server";
import { assistantService } from "../../../lib/assistant/assistantService";

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

  const response = await assistantService.handleMessage(message, sessionId);
  return NextResponse.json(response);
}
