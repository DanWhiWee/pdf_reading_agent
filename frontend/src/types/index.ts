export interface TOCItem {
  level: number;
  title: string;
  page: number;
  y?: number | null;
}

export interface DocumentMeta {
  id: string;
  filename: string;
  title: string;
  num_pages: number;
  toc: TOCItem[];
}

/** RAG / retrieval source; click navigates to PDF page only */
export interface CitationMeta {
  index: number;
  page: number;
  preview: string;
  rect?: number[] | null;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Chain-of-thought / reasoning, shown in a collapsible block */
  reasoning?: string;
  /** Retrieved passages for this answer (Phase 2 RAG) */
  citations?: CitationMeta[];
  selectedText?: string;
  pageNumber?: number;
}

export interface SearchHit {
  page: number;
  /** PDF user space [x0,y0,x1,y1]; may be missing for some backends */
  rect?: number[] | null;
  text: string;
}
