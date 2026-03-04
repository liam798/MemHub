"""文档相关模式"""
from pydantic import BaseModel, Field


class CreateDocumentRequest(BaseModel):
    """新建文档（原文传给大模型，不向量化）"""
    title: str = Field(min_length=1, max_length=256, description="文档标题")
    content: str = Field(default="", description="文档正文，支持 Markdown")


class UpdateDocumentRequest(BaseModel):
    """更新文档（仅原文文档）"""
    title: str | None = Field(None, min_length=1, max_length=256, description="文档标题，不传则不改")
    content: str | None = Field(None, description="文档正文，不传则不改")


class DocumentResponse(BaseModel):
    id: int
    filename: str
    content_type: str
    file_size: int
    chunk_count: int
    created_at: str | None = None
    updated_at: str | None = None
    is_rule: bool = False  # 是否为规则（原文传给模型，不向量化）

    class Config:
        from_attributes = True


class DocumentDetailResponse(DocumentResponse):
    """文档详情，规则类包含 content"""
    content: str | None = None
