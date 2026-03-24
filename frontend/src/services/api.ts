import type { DocumentMeta } from "../types";

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

export async function searchPDF(
  docId: string,
  query: string
): Promise<{ results: { page: number; rect: number[]; text: string }[] }> {
  const res = await fetch(
    `${BASE}/api/pdf/${docId}/search?q=${encodeURIComponent(query)}`
  );
  return res.json();
}

export interface StreamChatParams {
  message: string;
  doc_id?: string | null;
  selected_text?: string;
  page_number?: number | null;
  history?: { role: string; content: string }[];
  model?: string;
}

export type StreamToken = { token: string; kind: "reasoning" | "content" };

export async function streamChat(
  params: StreamChatParams,
  onToken: (delta: StreamToken) => void,
  onDone: () => void,
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

  const res = await fetch(`${BASE}/api/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) {
    onError(`HTTP ${res.status}`);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

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
        if (data.done) onDone();
        if (data.error) onError(data.error);
      } catch {
        // ignore malformed lines
      }
    }
  }
  onDone();
}
