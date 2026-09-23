import { extractItemsFromText } from "./itemExtractor";
import type { ParsedDocument } from "./types";

export async function parseWord(buffer: ArrayBuffer, fileName = "upload.docx"): Promise<ParsedDocument> {
  const text = new TextDecoder().decode(buffer);

  return {
    fileName,
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    text,
    items: extractItemsFromText(text),
  };
}
