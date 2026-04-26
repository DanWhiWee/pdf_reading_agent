import type { CitationMeta, DocumentMeta } from "../types";

/** Empty = same origin / Vite proxy to backend. Set VITE_API_BASE if you serve the SPA without a proxy. */
const BASE = import.meta.env.VITE_API_BASE ?? "";

export async function uploadPDF(file: File): Promise<DocumentMeta> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE}/api/pdf/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Upload failed");
  }
  return res.json();
}

export function getPDFFileUrl(docId: string): string {
  return `${BASE}/api/pdf/${docId}/file`;
}

/** EmbedPDF `AnnotationTransferItem[]` 的 JSON 形态，由后端原样存取 */
export async function fetchChatHistory(docId: string): Promise<unknown[]> {
  const res = await fetch(`${BASE}/api/pdf/${docId}/chat`);
  if (!res.ok) {
    if (res.status === 404) return [];
    throw new Error(`HTTP ${res.status}`);
  }
  const data = (await res.json()) as { messages?: unknown[] };
  return Array.isArray(data.messages) ? data.messages : [];
}

export async function saveChatHistory(
  docId: string,
  messages: unknown[],
): Promise<void> {
  await fetch(`${BASE}/api/pdf/${docId}/chat`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: messages }),
  });
}

export function saveChatHistoryKeepalive(
  docId: string,
  messages: unknown[],
): void {
  void fetch(`${BASE}/api/pdf/${docId}/chat`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: messages }),
    keepalive: true,
  });
}

export async function fetchPdfAnnotations(
  docId: string,
): Promise<unknown[]> {
  const res = await fetch(`${BASE}/api/pdf/${docId}/annotations`);
  if (!res.ok) {
    if (res.status === 404) return [];
    throw new Error(`HTTP ${res.status}`);
  }
  const data = (await res.json()) as { items?: unknown[] };
  return Array.isArray(data.items) ? data.items : [];
}

export async function savePdfAnnotations(
  docId: string,
  items: unknown[],
): Promise<void> {
  const res = await fetch(`${BASE}/api/pdf/${docId}/annotations`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
}

/** 页面关闭/刷新时尽力送达（不保证响应体可读） */
export function savePdfAnnotationsKeepalive(
  docId: string,
  items: unknown[],
): void {
  const body = JSON.stringify({ items });
  void fetch(`${BASE}/api/pdf/${docId}/annotations`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  });
}

export async function searchPDF(
  docId: string,
  query: string
): Promise<{ results: { page: number; rect: number[]; text: string }[] }> {
  const res = await fetch(
    `${BASE}/api/pdf/${docId}/search?q=${encodeURIComponent(query)}`
  );
  return res.json();
}

export async function fetchPageText(
  docId: string,
  page: number
): Promise<string> {
  const res = await fetch(`${BASE}/api/pdf/${docId}/text/${page}`);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const data = (await res.json()) as { page: number; text: string };
  return data.text || "";
}

export interface PdfLink {
  page: number;
  rect: [number, number, number, number]; // normalized [x0,y0,x1,y1] 0-1
  dest_page: number;
  dest_y: number; // normalized y in destination page 0-1
}

export async function fetchDocLinks(docId: string): Promise<PdfLink[]> {
  const res = await fetch(`${BASE}/api/pdf/${docId}/links`);
  if (!res.ok) return [];
  const data = (await res.json()) as { links?: PdfLink[] };
  return Array.isArray(data.links) ? data.links : [];
}

export async function fetchRagStatus(docId: string): Promise<{ ready: boolean }> {
  const res = await fetch(`${BASE}/api/pdf/${docId}/rag-status`);
  if (!res.ok) return { ready: false };
  return res.json();
}

export interface StreamChatParams {
  message: string;
  doc_id?: string | null;
  selected_text?: string;
  page_number?: number | null;
  history?: { role: string; content: string }[];
  model?: string;
  image_data?: string;
}

export type StreamToken = { token: string; kind: "reasoning" | "content" };

export type StreamDoneMeta = { citations?: CitationMeta[] };

export async function streamChat(
  params: StreamChatParams,
  onToken: (delta: StreamToken) => void,
  onDone: (meta?: StreamDoneMeta) => void,
  onError: (err: string) => void,
  signal?: AbortSignal
) {
  const body: Record<string, unknown> = {
    message: params.message,
    history: params.history ?? [],
  };
  if (typeof params.doc_id === "string" && params.doc_id.length > 0) {
    body.doc_id = params.doc_id;
  }
  if (params.selected_text) body.selected_text = params.selected_text;
  if (params.page_number != null && params.page_number > 0) {
    body.page_number = params.page_number;
  }
  if (params.image_data) body.image_data = params.image_data;

  const res = await fetch(`${BASE}/api/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) {
    onError(`HTTP ${res.status}`);
    onDone(undefined);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let doneMeta: StreamDoneMeta | undefined;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.token != null && data.token !== "") {
            const kind =
              data.kind === "reasoning" ? "reasoning" : "content";
            onToken({ token: data.token, kind });
          }
          if (data.done) {
            if (Array.isArray(data.citations) && data.citations.length > 0) {
              doneMeta = { citations: data.citations as CitationMeta[] };
            }
          }
          if (data.error) {
            onError(data.error);
            onDone(undefined);
            return;
          }
        } catch {
          // ignore malformed lines
        }
      }
    }
    onDone(doneMeta);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    onError(msg);
    onDone(undefined);
  }
}
