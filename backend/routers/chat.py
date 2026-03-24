import json
import logging

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from config import UPLOAD_DIR, PDF_CONTEXT_MAX_CHARS
from models.schemas import ChatRequest
from services.llm_service import LLMService
from services.pdf_service import PDFService

router = APIRouter(prefix="/api/chat", tags=["chat"])
llm_service = LLMService()
pdf_service = PDFService(UPLOAD_DIR)

log = logging.getLogger("uvicorn.error")


@router.post("/stream")
async def stream_chat(request: ChatRequest):
    context = ""
    if request.doc_id:
        context = pdf_service.extract_context_for_chat(
            request.doc_id,
            PDF_CONTEXT_MAX_CHARS,
            request.page_number,
        )
        if not context.strip():
            context = (
                "[Note: This PDF has no extractable text layer — it may be scanned images. "
                "Answer from the user's question and any quoted selection only.]"
            )

    sel_len = len((request.selected_text or "").strip())
    log.warning(
        "chat/stream doc_id=%r page=%s context_chars=%d selected_chars=%d msg_preview=%r",
        request.doc_id,
        request.page_number,
        len(context),
        sel_len,
        (request.message or "")[:80],
    )

    history = [{"role": m.role, "content": m.content} for m in request.history]

    async def event_generator():
        try:
            async for kind, token in llm_service.stream_chat(
                user_message=request.message,
                history=history,
                context=context,
                selected_text=request.selected_text or "",
                model=request.model,
            ):
                yield f"data: {json.dumps({'token': token, 'kind': kind}, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
