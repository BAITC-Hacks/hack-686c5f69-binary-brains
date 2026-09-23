import { extractItemsFromText } from "./itemExtractor";
import type { ParsedDocument } from "./types";

export async function parsePdf(buffer: ArrayBuffer, fileName = "upload.pdf"): Promise<ParsedDocument> {
  return {
    fileName,
    mimeType: "application/pdf",
    text: "",
    items: [
      {
        rawText: `PDF ${fileName} received. Text extraction adapter is ready for pdf parser integration.`,
        confidence: 0.2,
      },
    ],
  };
}

export function parsePdfText(text: string, fileName = "upload.pdf"): ParsedDocument {
  return {
    fileName,
    mimeType: "application/pdf",
    text,
    items: extractItemsFromText(text),
  };
}
