import { NextResponse } from "next/server";
import { parseUploadedFile } from "../../../lib/documents/documentParser";

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");
  const sessionIdValue = formData.get("sessionId");
  const sessionId = typeof sessionIdValue === "string" ? sessionIdValue : undefined;

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "file is required" },
      { status: 400 },
    );
  }

  const parsed = await parseUploadedFile(file, sessionId);

  return NextResponse.json({
    sessionId: parsed.sessionId,
    fileName: parsed.fileName,
    items: parsed.items,
  });
}
