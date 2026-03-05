"""后台管理相关模式"""
from pydantic import BaseModel

from app.models.knowledge_base import Visibility


class AdminUserResponse(BaseModel):
    id: int
    username: str
    email: str
    is_admin: bool
    owned_kb_count: int = 0
    created_at: str | None = None


class AdminKnowledgeBaseResponse(BaseModel):
    id: int
    name: str
    description: str
    visibility: Visibility
    owner_id: int
    owner_username: str
    document_count: int = 0
    created_at: str | None = None
    updated_at: str | None = None


class AdminUserKnowledgeBaseResponse(BaseModel):
    id: int
    name: str
    description: str
    visibility: Visibility
    owner_id: int
    owner_username: str
    document_count: int = 0
    user_role: str
    created_at: str | None = None
    updated_at: str | None = None
