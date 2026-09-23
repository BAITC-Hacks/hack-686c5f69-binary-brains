import { addRecognizedItems, getOrCreateSession } from "../assistant/sessionManager";
import { parseExcel } from "./excelParser";
import { parseImage } from "./imageParser";
import { parsePdf } from "./pdfParser";
import { parseWord } from "./wordParser";
import type { ParsedDocument } from "./types";

export async function parseUploadedFile(file: File, sessionId?: string): Promise<ParsedDocument> {
  const buffer = await file.arrayBuffer();
  const mimeType = file.type;
  const fileName = file.name;
  const session = getOrCreateSession(sessionId);

  let parsed: ParsedDocument;

  if (mimeType.includes("pdf") || fileName.endsWith(".pdf")) {
    parsed = await parsePdf(buffer, fileName);
  } else if (mimeType.includes("spreadsheet") || fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
    parsed = await parseExcel(buffer, fileName);
  } else if (mimeType.includes("word") || fileName.endsWith(".docx") || fileName.endsWith(".doc")) {
    parsed = await parseWord(buffer, fileName);
  } else if (mimeType.includes("image") || /\.(jpe?g|png)$/i.test(fileName)) {
    parsed = await parseImage(buffer, fileName);
  } else {
    parsed = {
      fileName,
      mimeType,
      text: "",
      items: [],
    };
  }

  parsed.sessionId = session.id;
  addRecognizedItems(session, parsed.items);
  return parsed;
}
