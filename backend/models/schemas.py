from pydantic import BaseModel, Field, AliasChoices
from typing import Optional, List


class ChatMessageDTO(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    model_config = {"populate_by_name": True}

    message: str
    doc_id: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("doc_id", "docId"),
    )
    selected_text: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("selected_text", "selectedText"),
    )
    page_number: Optional[int] = Field(
        default=None,
        validation_alias=AliasChoices("page_number", "pageNumber"),
    )
    history: List[ChatMessageDTO] = []
    model: Optional[str] = None
    image_data: Optional[str] = None


class TOCItem(BaseModel):
    level: int
    title: str
    page: int
    y: Optional[float] = None


class DocumentMeta(BaseModel):
    id: str
    filename: str
    title: str
    num_pages: int
    toc: List[TOCItem] = []


class PageText(BaseModel):
    page: int
    text: str


class SearchHit(BaseModel):
    page: int
    rect: List[float]
    text: str
