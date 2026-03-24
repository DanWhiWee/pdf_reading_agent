export interface TOCItem {
  level: number;
  title: string;
  page: number;
}

export interface DocumentMeta {
  id: string;
  filename: string;
  title: string;
  num_pages: number;
  toc: TOCItem[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Chain-of-thought / reasoning, shown in a collapsible block */
  reasoning?: string;
  selectedText?: string;
  pageNumber?: number;
}

export interface SearchHit {
  page: number;
  rect: number[];
  text: string;
}
