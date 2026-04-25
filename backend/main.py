import fitz
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import pdf, chat

fitz.TOOLS.mupdf_display_errors(False)

app = FastAPI(title="PDF Reading Agent")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(pdf.router)
app.include_router(chat.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
