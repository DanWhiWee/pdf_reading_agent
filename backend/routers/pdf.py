from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import FileResponse

from config import UPLOAD_DIR
from services.pdf_service import PDFService

router = APIRouter(prefix="/api/pdf", tags=["pdf"])
pdf_service = PDFService(UPLOAD_DIR)


@router.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")
    content = await file.read()
    meta = pdf_service.save_and_parse(content, file.filename)
    return meta


@router.get("/{doc_id}/file")
async def get_pdf_file(doc_id: str):
    file_path = pdf_service.get_file_path(doc_id)
    if not file_path:
        raise HTTPException(status_code=404, detail="Document not found")
    return FileResponse(file_path, media_type="application/pdf")


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
