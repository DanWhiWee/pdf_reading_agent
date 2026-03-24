import { create } from "zustand";
import type { ChatMessage, DocumentMeta } from "../types";

const DOC_SESSION_KEY = "pdf-reading-agent-current-doc";

function readStoredDoc(): {
  currentDocId: string | null;
  currentDocMeta: DocumentMeta | null;
} {
  if (typeof sessionStorage === "undefined") {
    return { currentDocId: null, currentDocMeta: null };
  }
  try {
    const raw = sessionStorage.getItem(DOC_SESSION_KEY);
    if (!raw) return { currentDocId: null, currentDocMeta: null };
    const parsed = JSON.parse(raw) as { id: string; meta: DocumentMeta };
    if (parsed?.id && parsed?.meta?.filename) {
      return { currentDocId: parsed.id, currentDocMeta: parsed.meta };
    }
  } catch {
    /* ignore */
  }
  return { currentDocId: null, currentDocMeta: null };
}

interface AppState {
  currentDocId: string | null;
  currentDocMeta: DocumentMeta | null;

  messages: ChatMessage[];
  isStreaming: boolean;

  selectedText: string;
  selectedPage: number | null;

  setCurrentDoc: (id: string, meta: DocumentMeta) => void;
  clearDoc: () => void;

  addMessage: (msg: ChatMessage) => void;
  updateLastMessage: (content: string) => void;
  updateLastAssistant: (patch: {
    content?: string;
    reasoning?: string;
  }) => void;
  setIsStreaming: (v: boolean) => void;
  clearMessages: () => void;

  setSelectedText: (text: string, page?: number) => void;
  clearSelectedText: () => void;
}

const initialDoc = readStoredDoc();

export const useAppStore = create<AppState>((set) => ({
  currentDocId: initialDoc.currentDocId,
  currentDocMeta: initialDoc.currentDocMeta,
  messages: [],
  isStreaming: false,
  selectedText: "",
  selectedPage: null,

  setCurrentDoc: (id, meta) => {
    try {
      sessionStorage.setItem(DOC_SESSION_KEY, JSON.stringify({ id, meta }));
    } catch {
      /* ignore */
    }
    set({ currentDocId: id, currentDocMeta: meta });
  },
  clearDoc: () => {
    try {
      sessionStorage.removeItem(DOC_SESSION_KEY);
    } catch {
      /* ignore */
    }
    set({ currentDocId: null, currentDocMeta: null, messages: [] });
  },

  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  updateLastMessage: (content) =>
    set((s) => {
      const msgs = [...s.messages];
      if (msgs.length > 0) {
        msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content };
      }
      return { messages: msgs };
    }),
  updateLastAssistant: (patch) =>
    set((s) => {
      const msgs = [...s.messages];
      if (msgs.length === 0) return { messages: msgs };
      const last = msgs[msgs.length - 1];
      if (last.role !== "assistant") return { messages: msgs };
      msgs[msgs.length - 1] = {
        ...last,
        ...(patch.content !== undefined ? { content: patch.content } : {}),
        ...(patch.reasoning !== undefined ? { reasoning: patch.reasoning } : {}),
      };
      return { messages: msgs };
    }),
  setIsStreaming: (v) => set({ isStreaming: v }),
  clearMessages: () => set({ messages: [] }),

  setSelectedText: (text, page) =>
    set({ selectedText: text, selectedPage: page ?? null }),
  clearSelectedText: () => set({ selectedText: "", selectedPage: null }),
}));
