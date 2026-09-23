import type { RecognizedItem } from "../assistant/types";

export type ParsedDocument = {
  sessionId?: string;
  fileName: string;
  mimeType?: string;
  text: string;
  items: RecognizedItem[];
};
