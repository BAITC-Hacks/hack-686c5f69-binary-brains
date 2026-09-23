import type { ParsedDocument } from "./types";

export async function parseImage(_buffer: ArrayBuffer, fileName = "upload.jpg"): Promise<ParsedDocument> {
  return {
    fileName,
    mimeType: "image/jpeg",
    text: "",
    items: [
      {
        rawText: `Image ${fileName} received. OCR adapter is ready for image recognition integration.`,
        confidence: 0.2,
      },
    ],
  };
}
