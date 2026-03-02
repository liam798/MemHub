"""RAG 相关模式"""
from pydantic import BaseModel, Field

from app.core.config import settings


class QueryRequest(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    top_k: int = Field(default=5, ge=1, le=settings.RAG_TOP_K_MAX)


class BatchQueryRequest(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    top_k: int = Field(default=5, ge=1, le=settings.RAG_TOP_K_MAX)
    kb_ids: list[int] = Field(default_factory=list)  # 空表示全部知识库


class QueryResponse(BaseModel):
    answer: str
    sources: list[dict] = Field(default_factory=list)
