from typing import Any, List

from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from config import DATA_DIR, UPLOAD_DIR
from services.pdf_service import PDFService
from services.rag_service import RAGService

router = APIRouter(prefix="/api/pdf", tags=["pdf"])
pdf_service = PDFService(UPLOAD_DIR)
rag_service = RAGService(DATA_DIR, UPLOAD_DIR)


class AnnotationsPayload(BaseModel):
    items: List[Any] = Field(default_factory=list)


@router.post("/upload")
async def upload_pdf(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")
    content = await file.read()
    meta = pdf_service.save_and_parse(content, file.filename)
    doc_id = meta["id"]
    background_tasks.add_task(rag_service.build_index, doc_id)
    return meta


@router.get("/{doc_id}/file")
async def get_pdf_file(doc_id: str):
    file_path = pdf_service.get_file_path(doc_id)
    if not file_path:
        raise HTTPException(status_code=404, detail="Document not found")
    return FileResponse(
        file_path,
        media_type="application/pdf",
        filename=file_path.name,
        headers={
            "Content-Disposition": f'inline; filename="{file_path.name}"',
            "Cache-Control": "public, max-age=86400, immutable",
        },
    )


@router.get("/{doc_id}/text")
async def get_full_text(doc_id: str):
    pages = pdf_service.extract_all_text(doc_id)
    return {"pages": pages}


@router.get("/{doc_id}/text/{page_num}")
async def get_page_text(doc_id: str, page_num: int):
    text = pdf_service.get_page_text(doc_id, page_num)
    return {"page": page_num, "text": text}


@router.get("/{doc_id}/search")
async def search_in_pdf(doc_id: str, q: str = ""):
    if not q:
        return {"results": []}
    results = pdf_service.search_text(doc_id, q)
    return {"results": results}


@router.get("/{doc_id}/rag-status")
async def rag_status(doc_id: str):
    return {"ready": rag_service.index_exists(doc_id)}


@router.get("/{doc_id}/annotations")
async def get_annotations(doc_id: str):
    if not pdf_service.get_file_path(doc_id):
        raise HTTPException(status_code=404, detail="Document not found")
    return {"items": pdf_service.read_annotations(doc_id)}


@router.put("/{doc_id}/annotations")
async def put_annotations(doc_id: str, body: AnnotationsPayload):
    if not pdf_service.get_file_path(doc_id):
        raise HTTPException(status_code=404, detail="Document not found")
    try:
        pdf_service.write_annotations(doc_id, body.items)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"ok": True, "count": len(body.items)}
