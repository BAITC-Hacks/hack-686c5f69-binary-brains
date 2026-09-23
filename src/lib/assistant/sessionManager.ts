import type { AssistantSession, ChatMessage, PendingCartItem, RecognizedItem } from "./types";

const sessions = new Map<string, AssistantSession>();

const createId = () => crypto.randomUUID();

export function getOrCreateSession(sessionId?: string): AssistantSession {
  if (sessionId && sessions.has(sessionId)) {
    return sessions.get(sessionId)!;
  }

  const id = sessionId || createId();
  const session: AssistantSession = {
    id,
    messages: [],
    pendingCartItems: [],
    recognizedItems: [],
  };

  sessions.set(id, session);
  return session;
}

export function addMessage(session: AssistantSession, role: ChatMessage["role"], content: string) {
  session.messages.push({
    role,
    content,
    createdAt: new Date().toISOString(),
  });
}

export function setPendingCartItems(session: AssistantSession, items: PendingCartItem[]) {
  session.pendingCartItems = items;
}

export function clearPendingCartItems(session: AssistantSession) {
  session.pendingCartItems = [];
}

export function addRecognizedItems(session: AssistantSession, items: RecognizedItem[]) {
  session.recognizedItems.push(...items);
}
