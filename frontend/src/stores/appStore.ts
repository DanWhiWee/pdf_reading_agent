import { create } from "zustand";
import type { ReaderBackgroundId } from "../constants/readerTheme";
import type { ChatMessage, CitationMeta, DocumentMeta, SearchHit } from "../types";

const DOC_SESSION_KEY = "pdf-reading-agent-current-doc";
const READER_BG_KEY = "pdf-reading-agent-reader-bg";
const CHAT_COLLAPSED_KEY = "pdf-reading-agent-chat-collapsed";
const AI_HISTORY_ROUNDS_KEY = "pdf-reading-agent-ai-history-rounds";
const CHAT_HISTORY_PREFIX = "pdf-chat-history-";

function chatHistoryKey(docId: string) {
  return `${CHAT_HISTORY_PREFIX}${docId}`;
}

function loadChatHistory(docId: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(chatHistoryKey(docId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatMessage[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveChatHistory(docId: string, messages: ChatMessage[]) {
  try {
    // Strip imageDataUrl (base64 images) to keep localStorage small
    const toSave = messages.map(({ imageDataUrl: _, ...rest }) => rest);
    localStorage.setItem(chatHistoryKey(docId), JSON.stringify(toSave));
  } catch {
    /* ignore quota errors */
  }
}

function readReaderBackground(): ReaderBackgroundId {
  if (typeof localStorage === "undefined") return "default";
  try {
    const v = localStorage.getItem(READER_BG_KEY);
    if (
      v === "default" ||
      v === "eye" ||
      v === "gray" ||
      v === "warm" ||
      v === "dark"
    ) {
      return v;
    }
  } catch {
    /* ignore */
  }
  return "default";
}

function readChatCollapsed(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(CHAT_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function readAiHistoryRounds(): number {
  if (typeof localStorage === "undefined") return 10;
  try {
    const v = parseInt(localStorage.getItem(AI_HISTORY_ROUNDS_KEY) ?? "", 10);
    if (!isNaN(v) && v >= 1 && v <= 50) return v;
  } catch {
    /* ignore */
  }
  return 10;
}

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

export interface PdfNavTarget {
  page: number;
  y?: number | null;
  title?: string | null;
  nonce: number;
}

interface AppState {
  currentDocId: string | null;
  currentDocMeta: DocumentMeta | null;

  messages: ChatMessage[];
  isStreaming: boolean;

  selectedText: string;
  selectedPage: number | null;

  /** Scroll-only navigation (TOC, citations) */
  pdfNav: PdfNavTarget | null;

  /** In-document search: highlight current hit, prev/next in toolbar */
  pdfSearch: { hits: SearchHit[]; index: number; query: string } | null;

  setCurrentDoc: (id: string, meta: DocumentMeta) => void;
  clearDoc: () => void;

  addMessage: (msg: ChatMessage) => void;
  updateLastMessage: (content: string) => void;
  updateLastAssistant: (patch: {
    content?: string;
    reasoning?: string;
    citations?: CitationMeta[];
  }) => void;
  setIsStreaming: (v: boolean) => void;
  clearMessages: () => void;

  setSelectedText: (text: string, page?: number) => void;
  setSelectedPage: (page: number | null) => void;
  clearSelectedText: () => void;

  navigatePdf: (opts: { page: number; y?: number | null; title?: string | null }) => void;

  setPdfSearchResults: (hits: SearchHit[], query: string, index?: number) => void;
  setPdfSearchIndex: (index: number) => void;
  clearPdfSearch: () => void;
  pdfSearchNext: () => void;
  pdfSearchPrev: () => void;

  readerBackground: ReaderBackgroundId;
  setReaderBackground: (id: ReaderBackgroundId) => void;

  /** 用户粘贴的待发截图，base64 DataURL */
  pendingImage: string | null;
  setPendingImage: (v: string | null) => void;

  chatPanelCollapsed: boolean;
  setChatPanelCollapsed: (collapsed: boolean) => void;

  /** Rounds of chat history sent to AI (1 round = 1 user + 1 assistant message) */
  aiHistoryRounds: number;
  setAiHistoryRounds: (n: number) => void;
}

const initialDoc = readStoredDoc();
const initialMessages = initialDoc.currentDocId
  ? loadChatHistory(initialDoc.currentDocId)
  : [];

export const useAppStore = create<AppState>((set) => ({
  currentDocId: initialDoc.currentDocId,
  currentDocMeta: initialDoc.currentDocMeta,
  messages: initialMessages,
  isStreaming: false,
  selectedText: "",
  selectedPage: null,
  pdfNav: null,
  pdfSearch: null,

  readerBackground: readReaderBackground(),
  setReaderBackground: (id) => {
    try {
      localStorage.setItem(READER_BG_KEY, id);
    } catch {
      /* ignore */
    }
    set({ readerBackground: id });
  },

  pendingImage: null,
  setPendingImage: (v) => set({ pendingImage: v }),

  chatPanelCollapsed: readChatCollapsed(),
  setChatPanelCollapsed: (collapsed) => {
    try {
      localStorage.setItem(CHAT_COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
    set({ chatPanelCollapsed: collapsed });
  },

  aiHistoryRounds: readAiHistoryRounds(),
  setAiHistoryRounds: (n) => {
    const clamped = Math.min(50, Math.max(1, n));
    try {
      localStorage.setItem(AI_HISTORY_ROUNDS_KEY, String(clamped));
    } catch {
      /* ignore */
    }
    set({ aiHistoryRounds: clamped });
  },

  setCurrentDoc: (id, meta) => {
    try {
      sessionStorage.setItem(DOC_SESSION_KEY, JSON.stringify({ id, meta }));
    } catch {
      /* ignore */
    }
    set({
      currentDocId: id,
      currentDocMeta: meta,
      messages: loadChatHistory(id),
      pdfNav: null,
      pdfSearch: null,
    });
  },
  clearDoc: () => {
    try {
      sessionStorage.removeItem(DOC_SESSION_KEY);
    } catch {
      /* ignore */
    }
    set({
      currentDocId: null,
      currentDocMeta: null,
      messages: [],
      pdfNav: null,
      pdfSearch: null,
    });
  },

  addMessage: (msg) =>
    set((s) => {
      const messages = [...s.messages, msg];
      if (s.currentDocId) saveChatHistory(s.currentDocId, messages);
      return { messages };
    }),
  updateLastMessage: (content) =>
    set((s) => {
      const msgs = [...s.messages];
      if (msgs.length > 0) {
        msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content };
      }
      if (s.currentDocId) saveChatHistory(s.currentDocId, msgs);
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
        ...(patch.citations !== undefined ? { citations: patch.citations } : {}),
      };
      if (s.currentDocId) saveChatHistory(s.currentDocId, msgs);
      return { messages: msgs };
    }),
  setIsStreaming: (v) => set({ isStreaming: v }),
  clearMessages: () =>
    set((s) => {
      if (s.currentDocId) {
        try { localStorage.removeItem(chatHistoryKey(s.currentDocId)); } catch { /* ignore */ }
      }
      return { messages: [] };
    }),

  setSelectedText: (text, page) =>
    set({ selectedText: text, selectedPage: page ?? null }),
  setSelectedPage: (page) =>
    set((s) => ({ selectedText: s.selectedText, selectedPage: page })),
  clearSelectedText: () => set({ selectedText: "", selectedPage: null }),

  navigatePdf: ({ page, y, title }) =>
    set({
      pdfNav: {
        page,
        y: y ?? null,
        title: title ?? null,
        nonce: Date.now(),
      },
    }),

  setPdfSearchResults: (hits, query, index = 0) =>
    set({
      pdfSearch:
        hits.length === 0
          ? null
          : {
              hits,
              query: query.trim(),
              index: Math.min(Math.max(0, index), hits.length - 1),
            },
    }),

  setPdfSearchIndex: (index) =>
    set((s) => {
      const ps = s.pdfSearch;
      if (!ps?.hits.length) return {};
      const i = Math.min(Math.max(0, index), ps.hits.length - 1);
      return { pdfSearch: { ...ps, index: i } };
    }),

  clearPdfSearch: () => set({ pdfSearch: null }),

  pdfSearchNext: () =>
    set((s) => {
      const ps = s.pdfSearch;
      if (!ps?.hits.length) return {};
      const ni = (ps.index + 1) % ps.hits.length;
      return {
        pdfSearch: { hits: ps.hits, index: ni, query: ps.query },
      };
    }),

  pdfSearchPrev: () =>
    set((s) => {
      const ps = s.pdfSearch;
      if (!ps?.hits.length) return {};
      const ni = (ps.index - 1 + ps.hits.length) % ps.hits.length;
      return {
        pdfSearch: { hits: ps.hits, index: ni, query: ps.query },
      };
    }),
}));
