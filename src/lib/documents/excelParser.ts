import { extractItemsFromText } from "./itemExtractor";
import type { ParsedDocument } from "./types";

export async function parseExcel(buffer: ArrayBuffer, fileName = "upload.xlsx"): Promise<ParsedDocument> {
  const text = new TextDecoder().decode(buffer);

  return {
    fileName,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    text,
    items: extractItemsFromText(text),
  };
}
