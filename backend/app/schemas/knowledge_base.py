"""知识库相关模式"""
from pydantic import BaseModel, Field
from app.models.knowledge_base import Visibility, MemberRole


class KnowledgeBaseCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    description: str = Field(default="", max_length=2000)
    visibility: Visibility = Visibility.PRIVATE


class KnowledgeBaseUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=2000)
    visibility: Visibility | None = None


class KnowledgeBaseResponse(BaseModel):
    id: int
    name: str
    description: str
    visibility: Visibility
    owner_id: int
    owner_username: str = ""
    created_at: str | None = None
    updated_at: str | None = None
    document_count: int = 0

    class Config:
        from_attributes = True


class MemberAdd(BaseModel):
    user_id: int
    role: MemberRole


class MemberUpdate(BaseModel):
    role: MemberRole


class MemberResponse(BaseModel):
    id: int
    user_id: int
    username: str
    email: str
    role: MemberRole
    created_at: str | None = None

    class Config:
        from_attributes = True
