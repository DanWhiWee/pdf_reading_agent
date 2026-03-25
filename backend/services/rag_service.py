"""
FAISS + sentence-transformers RAG index per PDF (built after upload).
"""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import fitz  # PyMuPDF
import numpy as np

log = logging.getLogger("uvicorn.error")

RAG_ENABLED = os.getenv("RAG_ENABLED", "true").lower() in ("1", "true", "yes")
RAG_CHUNK_SIZE = int(os.getenv("RAG_CHUNK_SIZE", "480"))
RAG_CHUNK_OVERLAP = int(os.getenv("RAG_CHUNK_OVERLAP", "90"))
RAG_TOP_K = int(os.getenv("RAG_TOP_K", "8"))
RAG_MAX_CONTEXT_CHARS = int(os.getenv("RAG_MAX_CONTEXT_CHARS", "14000"))
RAG_EMBEDDING_MODEL = os.getenv(
    "RAG_EMBEDDING_MODEL", "paraphrase-multilingual-MiniLM-L12-v2"
)
RAG_MAX_CHUNKS_PER_DOC = int(os.getenv("RAG_MAX_CHUNKS_PER_DOC", "4000"))


_embedder = None


def _get_embedder():
    global _embedder
    if _embedder is None:
        from sentence_transformers import SentenceTransformer

        log.warning("Loading embedding model %s (first time may download)...", RAG_EMBEDDING_MODEL)
        _embedder = SentenceTransformer(RAG_EMBEDDING_MODEL)
    return _embedder


def _chunk_page_text(page_num: int, text: str) -> List[Dict[str, Any]]:
    text = (text or "").strip()
    if not text:
        return []
    chunks: List[Dict[str, Any]] = []
    size, ov = RAG_CHUNK_SIZE, RAG_CHUNK_OVERLAP
    step = max(1, size - ov)
    start = 0
    while start < len(text):
        end = min(start + size, len(text))
        piece = text[start:end].strip()
        if len(piece) >= 20:
            chunks.append({"page": page_num, "text": piece, "char_start": start})
        start += step
    return chunks


class RAGService:
    def __init__(self, data_dir: Path, upload_dir: Path):
        self.data_dir = data_dir
        self.upload_dir = upload_dir

    def _paths(self, doc_id: str) -> Tuple[Path, Path]:
        return (
            self.data_dir / f"{doc_id}.faiss",
            self.data_dir / f"{doc_id}_rag.json",
        )

    def index_exists(self, doc_id: str) -> bool:
        faiss_p, meta_p = self._paths(doc_id)
        return faiss_p.is_file() and meta_p.is_file()

    def build_index(self, doc_id: str) -> None:
        if not RAG_ENABLED:
            log.info("RAG disabled, skip index for %s", doc_id)
            return
        pdf_path = self.upload_dir / f"{doc_id}.pdf"
        if not pdf_path.is_file():
            log.warning("RAG: pdf missing for %s", doc_id)
            return
        faiss_p, meta_p = self._paths(doc_id)
        try:
            import faiss
        except ImportError:
            log.error("faiss not installed; skip RAG index")
            return

        doc = fitz.open(pdf_path)
        all_chunks: List[Dict[str, Any]] = []
        try:
            for i in range(len(doc)):
                page = doc[i]
                pno = i + 1
                raw = page.get_text() or ""
                for c in _chunk_page_text(pno, raw):
                    all_chunks.append(c)
                if len(all_chunks) >= RAG_MAX_CHUNKS_PER_DOC:
                    log.warning(
                        "RAG: doc %s truncated at %s chunks", doc_id, RAG_MAX_CHUNKS_PER_DOC
                    )
                    break
        finally:
            doc.close()

        if not all_chunks:
            log.warning("RAG: no text chunks for %s", doc_id)
            return

        model = _get_embedder()
        texts = [c["text"] for c in all_chunks]
        emb = model.encode(
            texts,
            batch_size=32,
            show_progress_bar=False,
            normalize_embeddings=True,
        )
        if not isinstance(emb, np.ndarray):
            emb = np.array(emb, dtype=np.float32)
        emb = emb.astype(np.float32)
        dim = emb.shape[1]
        index = faiss.IndexFlatIP(dim)
        index.add(emb)

        faiss.write_index(index, str(faiss_p))
        meta = {
            "model": RAG_EMBEDDING_MODEL,
            "dim": dim,
            "chunks": [
                {
                    "page": c["page"],
                    "text": c["text"],
                    "rect": None,
                }
                for c in all_chunks
            ],
        }
        meta_p.write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
        log.warning(
            "RAG index built doc_id=%s chunks=%s dim=%s", doc_id, len(all_chunks), dim
        )

    def _load(self, doc_id: str) -> Optional[Tuple[Any, List[Dict[str, Any]]]]:
        if not self.index_exists(doc_id):
            return None
        try:
            import faiss
        except ImportError:
            return None
        faiss_p, meta_p = self._paths(doc_id)
        try:
            index = faiss.read_index(str(faiss_p))
            meta = json.loads(meta_p.read_text(encoding="utf-8"))
            chunks = meta.get("chunks") or []
            if index.ntotal != len(chunks):
                log.error("RAG: faiss/meta mismatch for %s", doc_id)
                return None
            return index, chunks
        except Exception:
            log.exception("RAG: load failed %s", doc_id)
            return None

    def retrieve_for_chat(
        self,
        doc_id: str,
        message: str,
        selected_text: str = "",
        center_page: Optional[int] = None,
    ) -> Tuple[str, List[Dict[str, Any]]]:
        """
        Returns (context_block, citations) for injecting into the LLM.
        """
        if not RAG_ENABLED:
            return "", []
        loaded = self._load(doc_id)
        if not loaded:
            return "", []
        index, chunks = loaded
        import faiss

        q_parts = [(message or "").strip()]
        if selected_text:
            q_parts.append((selected_text or "").strip()[:3000])
        query = "\n".join(p for p in q_parts if p)
        if not query.strip():
            query = "document"

        model = _get_embedder()
        qv = model.encode([query], normalize_embeddings=True)
        if not isinstance(qv, np.ndarray):
            qv = np.array(qv, dtype=np.float32)
        qv = qv.astype(np.float32)
        faiss.normalize_L2(qv)

        k = min(RAG_TOP_K, index.ntotal)
        scores, idxs = index.search(qv, k)

        pairs: List[Tuple[float, int]] = []
        for j in range(k):
            ii = int(idxs[0][j])
            if ii < 0:
                continue
            sc = float(scores[0][j])
            if center_page and chunks[ii]["page"] == center_page:
                sc += 0.15
            pairs.append((sc, ii))
        pairs.sort(key=lambda x: x[0], reverse=True)
        order = [p[1] for p in pairs]

        lines: List[str] = []
        cites: List[Dict[str, Any]] = []
        total = 0
        label = 1
        for ix in order:
            ch = chunks[ix]
            block = f"[{label}] (第 {ch['page']} 页)\n{ch['text']}"
            sep = 4 if lines else 0
            if total + len(block) + sep > RAG_MAX_CONTEXT_CHARS:
                break
            lines.append(block)
            total += len(block) + sep
            cites.append(
                {
                    "index": label,
                    "page": ch["page"],
                    "preview": ch["text"][:180].replace("\n", " ").strip(),
                    "rect": None,
                }
            )
            label += 1

        return "\n\n".join(lines), cites
