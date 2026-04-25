import json
import tempfile
import uuid
from pathlib import Path
from typing import Any, List, Optional, Set

import fitz  # PyMuPDF


class PDFService:
    def __init__(self, upload_dir: Path):
        self.upload_dir = upload_dir

    def save_and_parse(self, file_bytes: bytes, filename: str) -> dict:
        doc_id = uuid.uuid4().hex[:12]
        file_path = self.upload_dir / f"{doc_id}.pdf"
        file_path.write_bytes(file_bytes)

        # Re-save via a temp file to repair structural issues (e.g. missing XObject
        # subtype) that MuPDF tolerates but PDFium (WASM renderer) rejects.
        # Must use a temp file: PyMuPDF disallows garbage-collect save to the same
        # open file handle.
        doc = fitz.open(file_path)
        with tempfile.NamedTemporaryFile(
            suffix=".pdf", dir=self.upload_dir, delete=False
        ) as tmp:
            tmp_path = Path(tmp.name)
        try:
            doc.save(tmp_path, garbage=4, deflate=True, clean=True)
            doc.close()
            tmp_path.replace(file_path)
        except Exception:
            doc.close()
            tmp_path.unlink(missing_ok=True)
        doc = fitz.open(file_path)
        toc_raw = doc.get_toc(simple=False)
        toc_items = []
        for t in toc_raw:
            item = {"level": t[0], "title": t[1], "page": t[2], "y": None}
            if len(t) >= 4 and isinstance(t[3], dict):
                dest = t[3]
                if "to" in dest and isinstance(dest["to"], fitz.Point):
                    item["y"] = float(dest["to"].y)
                elif "to" in dest and hasattr(dest["to"], "y"):
                    item["y"] = float(dest["to"].y)
            toc_items.append(item)
        meta = {
            "id": doc_id,
            "filename": filename,
            "title": doc.metadata.get("title") or filename,
            "num_pages": len(doc),
            "toc": toc_items,
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
        max_hits = 200
        flags_dehyph = int(getattr(fitz, "TEXT_DEHYPHENATE", 0))
        try:
            for i, page in enumerate(doc):
                try:
                    if flags_dehyph:
                        hits = page.search_for(query, flags=flags_dehyph)
                    else:
                        hits = page.search_for(query)
                except TypeError:
                    hits = page.search_for(query)
                for inst in hits:
                    r = fitz.Rect(inst)
                    results.append(
                        {
                            "page": i + 1,
                            "rect": [
                                float(r.x0),
                                float(r.y0),
                                float(r.x1),
                                float(r.y1),
                            ],
                            "text": query,
                        }
                    )
                    if len(results) >= max_hits:
                        return results
        finally:
            doc.close()
        return results

    def get_all_links(self, doc_id: str) -> List[dict]:
        """Return all internal GoTo links for the document, with rects normalized
        to [0,1] relative to each page's width/height so the frontend can position
        clickable hotspots without knowing the absolute PDF dimensions."""
        file_path = self.upload_dir / f"{doc_id}.pdf"
        doc = fitz.open(file_path)
        result: List[dict] = []
        try:
            for i, page in enumerate(doc):
                w, h = page.rect.width, page.rect.height
                if w == 0 or h == 0:
                    continue
                for link in page.get_links():
                    if link.get("kind") != fitz.LINK_GOTO:
                        continue
                    r = link.get("from")
                    if not r:
                        continue
                    dest_page = link.get("page")
                    if dest_page is None:
                        continue
                    to = link.get("to")
                    result.append({
                        "page": i + 1,
                        "rect": [r.x0 / w, r.y0 / h, r.x1 / w, r.y1 / h],
                        "dest_page": int(dest_page) + 1,
                        "dest_y": float(to.y / h) if to else 0.0,
                    })
        finally:
            doc.close()
        return result

    def get_file_path(self, doc_id: str) -> Optional[Path]:
        file_path = self.upload_dir / f"{doc_id}.pdf"
        return file_path if file_path.exists() else None

    def annotations_path(self, doc_id: str) -> Optional[Path]:
        if not self.get_file_path(doc_id):
            return None
        return self.upload_dir / f"{doc_id}.annotations.json"

    def read_annotations(self, doc_id: str) -> List[Any]:
        p = self.annotations_path(doc_id)
        if not p or not p.is_file():
            return []
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return []
        if isinstance(data, dict) and isinstance(data.get("items"), list):
            return data["items"]
        return []

    def write_annotations(self, doc_id: str, items: List[Any]) -> None:
        if not self.get_file_path(doc_id):
            raise FileNotFoundError("Document not found")
        p = self.annotations_path(doc_id)
        assert p is not None
        p.write_text(
            json.dumps({"items": items}, ensure_ascii=False),
            encoding="utf-8",
        )

    def extract_context_for_chat(
        self,
        doc_id: str,
        max_chars: int,
        center_page: Optional[int] = None,
    ) -> str:
        """
        Build plain-text context within max_chars.
        Reads pages lazily in center-outward order so large PDFs only
        touch the pages actually needed.
        """
        file_path = self.upload_dir / f"{doc_id}.pdf"
        if not file_path.exists():
            return ""
        doc = fitz.open(file_path)
        n = len(doc)
        if n == 0:
            doc.close()
            return ""

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
        try:
            for p in order:
                raw = (doc[p - 1].get_text() or "").strip()
                if not raw:
                    continue
                blk = f"=== Page {p} ===\n{raw}"
                sep = 2 if chunks else 0
                if total + len(blk) + sep <= max_chars:
                    chunks.append(blk)
                    total += len(blk) + sep
                    continue
                remain = max_chars - total - sep - 120
                if remain > 300:
                    chunks.append(f"=== Page {p} ===\n{raw[:remain]}\n...[truncated]")
                break
        finally:
            doc.close()

        return "\n\n".join(chunks)
