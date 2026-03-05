"""后台管理 API"""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_admin_user
from app.models.document import Document
from app.models.knowledge_base import KnowledgeBase, KnowledgeBaseMember, MemberRole
from app.models.user import User
from app.schemas.admin import (
    AdminKnowledgeBaseResponse,
    AdminUserKnowledgeBaseResponse,
    AdminUserResponse,
)

router = APIRouter(prefix="/admin", tags=["后台管理"])


@router.get("/users", response_model=list[AdminUserResponse])
def list_users(
    _: Annotated[User, Depends(require_admin_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """管理员查看用户列表。"""
    users = db.query(User).order_by(User.created_at.asc(), User.id.asc()).all()
    if not users:
        return []

    owner_rows = (
        db.query(KnowledgeBase.owner_id, func.count(KnowledgeBase.id))
        .group_by(KnowledgeBase.owner_id)
        .all()
    )
    owned_kb_counts = {owner_id: count for owner_id, count in owner_rows}

    return [
        AdminUserResponse(
            id=u.id,
            username=u.username,
            email=u.email,
            is_admin=u.is_admin,
            owned_kb_count=owned_kb_counts.get(u.id, 0),
            created_at=u.created_at.isoformat() if u.created_at else None,
        )
        for u in users
    ]


@router.get("/knowledge-bases", response_model=list[AdminKnowledgeBaseResponse])
def list_knowledge_bases(
    _: Annotated[User, Depends(require_admin_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """管理员查看知识库列表。"""
    kbs = (
        db.query(KnowledgeBase)
        .order_by(KnowledgeBase.updated_at.desc(), KnowledgeBase.created_at.desc())
        .all()
    )
    if not kbs:
        return []

    owner_ids = sorted({kb.owner_id for kb in kbs})
    owners = db.query(User.id, User.username).filter(User.id.in_(owner_ids)).all()
    owner_usernames = {owner_id: username for owner_id, username in owners}

    kb_ids = [kb.id for kb in kbs]
    doc_rows = (
        db.query(Document.knowledge_base_id, func.count(Document.id))
        .filter(Document.knowledge_base_id.in_(kb_ids))
        .group_by(Document.knowledge_base_id)
        .all()
    )
    doc_counts = {kb_id: count for kb_id, count in doc_rows}

    return [
        AdminKnowledgeBaseResponse(
            id=kb.id,
            name=kb.name,
            description=kb.description or "",
            visibility=kb.visibility,
            owner_id=kb.owner_id,
            owner_username=owner_usernames.get(kb.owner_id, ""),
            document_count=doc_counts.get(kb.id, 0),
            created_at=kb.created_at.isoformat() if kb.created_at else None,
            updated_at=(kb.updated_at or kb.created_at).isoformat() if (kb.updated_at or kb.created_at) else None,
        )
        for kb in kbs
    ]


@router.get("/users/{user_id}/knowledge-bases", response_model=list[AdminUserKnowledgeBaseResponse])
def list_user_knowledge_bases(
    user_id: int,
    _: Annotated[User, Depends(require_admin_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """管理员查看指定用户关联的知识库（拥有 + 成员）。"""
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="用户不存在")

    owned_kbs = db.query(KnowledgeBase).filter(KnowledgeBase.owner_id == user_id).all()
    member_rows = (
        db.query(KnowledgeBaseMember.knowledge_base_id, KnowledgeBaseMember.role)
        .filter(KnowledgeBaseMember.user_id == user_id)
        .all()
    )
    member_role_map: dict[int, MemberRole] = {kb_id: role for kb_id, role in member_rows}
    member_kbs = (
        db.query(KnowledgeBase)
        .filter(KnowledgeBase.id.in_(list(member_role_map.keys())))
        .all()
        if member_role_map
        else []
    )

    merged: dict[int, tuple[KnowledgeBase, str]] = {}
    for kb in owned_kbs:
        merged[kb.id] = (kb, MemberRole.OWNER.value)
    for kb in member_kbs:
        if kb.id in merged:
            continue
        role = member_role_map.get(kb.id)
        merged[kb.id] = (kb, role.value if role else MemberRole.READ.value)

    items = list(merged.values())
    items.sort(key=lambda x: (x[0].updated_at or x[0].created_at), reverse=True)
    if not items:
        return []

    kbs = [kb for kb, _ in items]
    owner_ids = sorted({kb.owner_id for kb in kbs})
    owners = db.query(User.id, User.username).filter(User.id.in_(owner_ids)).all()
    owner_usernames = {owner_id: username for owner_id, username in owners}

    kb_ids = [kb.id for kb in kbs]
    doc_rows = (
        db.query(Document.knowledge_base_id, func.count(Document.id))
        .filter(Document.knowledge_base_id.in_(kb_ids))
        .group_by(Document.knowledge_base_id)
        .all()
    )
    doc_counts = {kb_id: count for kb_id, count in doc_rows}

    return [
        AdminUserKnowledgeBaseResponse(
            id=kb.id,
            name=kb.name,
            description=kb.description or "",
            visibility=kb.visibility,
            owner_id=kb.owner_id,
            owner_username=owner_usernames.get(kb.owner_id, ""),
            document_count=doc_counts.get(kb.id, 0),
            user_role=user_role,
            created_at=kb.created_at.isoformat() if kb.created_at else None,
            updated_at=(kb.updated_at or kb.created_at).isoformat() if (kb.updated_at or kb.created_at) else None,
        )
        for kb, user_role in items
    ]
