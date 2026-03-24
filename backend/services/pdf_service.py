import uuid
from pathlib import Path
from typing import List, Optional, Set

import fitz  # PyMuPDF


class PDFService:
    def __init__(self, upload_dir: Path):
        self.upload_dir = upload_dir

    def save_and_parse(self, file_bytes: bytes, filename: str) -> dict:
        doc_id = uuid.uuid4().hex[:12]
        file_path = self.upload_dir / f"{doc_id}.pdf"
        file_path.write_bytes(file_bytes)

        doc = fitz.open(file_path)
        toc_raw = doc.get_toc()
        meta = {
            "id": doc_id,
            "filename": filename,
            "title": doc.metadata.get("title") or filename,
            "num_pages": len(doc),
            "toc": [
                {"level": t[0], "title": t[1], "page": t[2]} for t in toc_raw
            ],
        }
        doc.close()
        return meta

    def extract_all_text(self, doc_id: str) -> List[dict]:
        file_path = self.upload_dir / f"{doc_id}.pdf"
        doc = fitz.open(file_path)
        pages = []
        for i, page in enumerate(doc):
            pages.append({"page": i + 1, "text": page.get_text()})
        doc.close()
        return pages

    def get_page_text(self, doc_id: str, page_num: int) -> str:
        file_path = self.upload_dir / f"{doc_id}.pdf"
        doc = fitz.open(file_path)
        text = ""
        if 0 < page_num <= len(doc):
            text = doc[page_num - 1].get_text()
        doc.close()
        return text

    def search_text(self, doc_id: str, query: str) -> List[dict]:
        file_path = self.upload_dir / f"{doc_id}.pdf"
        doc = fitz.open(file_path)
        results = []
        for i, page in enumerate(doc):
            for inst in page.search_for(query):
                results.append(
                    {
                        "page": i + 1,
                        "rect": [inst.x0, inst.y0, inst.x1, inst.y1],
                        "text": query,
                    }
                )
        doc.close()
        return results

    def get_file_path(self, doc_id: str) -> Optional[Path]:
        file_path = self.upload_dir / f"{doc_id}.pdf"
        return file_path if file_path.exists() else None

    def extract_context_for_chat(
        self,
        doc_id: str,
        max_chars: int,
        center_page: Optional[int] = None,
    ) -> str:
        """
        Build plain-text context within max_chars.
        If center_page is set, expand outward from that page first (selection-aware),
        then fall back to adding other pages by distance.
        """
        pages = self.extract_all_text(doc_id)
        if not pages:
            return ""

        n = len(pages)

        def block(p: int) -> str:
            if not (1 <= p <= n):
                return ""
            t = (pages[p - 1].get("text") or "").strip()
            if not t:
                return ""
            return f"=== Page {p} ===\n{t}"

        order: List[int] = []
        if center_page and 1 <= center_page <= n:
            seen: Set[int] = set()
            for radius in range(n + 1):
                candidates = [center_page] if radius == 0 else [
                    center_page - radius,
                    center_page + radius,
                ]
                for p in candidates:
                    if 1 <= p <= n and p not in seen:
                        seen.add(p)
                        order.append(p)
        else:
            order = list(range(1, n + 1))

        chunks: List[str] = []
        total = 0
        for p in order:
            blk = block(p)
            if not blk:
                continue
            sep = 2 if chunks else 0
            if total + len(blk) + sep <= max_chars:
                chunks.append(blk)
                total += len(blk) + sep
                continue
            remain = max_chars - total - sep - 120
            if remain > 300:
                raw = (pages[p - 1].get("text") or "").strip()
                chunks.append(f"=== Page {p} ===\n{raw[:remain]}\n...[truncated]")
            break

        return "\n\n".join(chunks)
