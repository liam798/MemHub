"""知识库 API"""
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user, has_kb_access, require_kb_write, require_kb_admin, require_kb_owner
from app.models.user import User
from app.models.knowledge_base import KnowledgeBase, KnowledgeBaseMember, MemberRole
from app.schemas.knowledge_base import (
    KnowledgeBaseCreate,
    KnowledgeBaseUpdate,
    KnowledgeBaseResponse,
    MemberAdd,
    MemberUpdate,
    MemberResponse,
)
from app.schemas.document import DocumentResponse
from app.services.knowledge_base import create_knowledge_base, add_member, update_member_role, remove_member
from app.services.activity import record_activity
from app.models.activity import ActivityAction
from app.rag.pipeline import chunk_and_embed

router = APIRouter(prefix="/knowledge-bases", tags=["知识库"])
logger = logging.getLogger(__name__)
ALLOWED_UPLOAD_EXTENSIONS = {".txt", ".md", ".pdf", ".docx"}


def _file_extension(filename: str) -> str:
    name = (filename or "").lower()
    if "." not in name:
        return ""
    return f".{name.rsplit('.', 1)[-1]}"


def _kb_response(
    kb: KnowledgeBase,
    owner_usernames: dict[int, str] | None = None,
    doc_counts: dict[int, int] | None = None,
) -> KnowledgeBaseResponse:
    return KnowledgeBaseResponse(
        id=kb.id,
        name=kb.name,
        description=kb.description or "",
        visibility=kb.visibility,
        owner_id=kb.owner_id,
        owner_username=(owner_usernames or {}).get(kb.owner_id, ""),
        created_at=kb.created_at.isoformat() if kb.created_at else None,
        document_count=(doc_counts or {}).get(kb.id, 0),
    )


def _get_kb(db: Session, kb_id: int) -> KnowledgeBase | None:
    return db.query(KnowledgeBase).filter(KnowledgeBase.id == kb_id).first()


@router.get("", response_model=list[KnowledgeBaseResponse])
def list_my_knowledge_bases(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """我的知识库列表（拥有的 + 有权限的）"""
    owned = db.query(KnowledgeBase).filter(KnowledgeBase.owner_id == current_user.id).all()
    member_kbs = (
        db.query(KnowledgeBase)
        .join(KnowledgeBaseMember)
        .filter(KnowledgeBaseMember.user_id == current_user.id)
        .all()
    )
    all_kbs = list({kb.id: kb for kb in owned + member_kbs}.values())
    if not all_kbs:
        return []

    kb_ids = [kb.id for kb in all_kbs]
    owner_ids = sorted({kb.owner_id for kb in all_kbs})

    from app.models.document import Document
    doc_rows = (
        db.query(Document.knowledge_base_id, func.count(Document.id))
        .filter(Document.knowledge_base_id.in_(kb_ids))
        .group_by(Document.knowledge_base_id)
        .all()
    )
    doc_counts = {kb_id: count for kb_id, count in doc_rows}

    owners = db.query(User.id, User.username).filter(User.id.in_(owner_ids)).all()
    owner_usernames = {owner_id: username for owner_id, username in owners}

    return [
        _kb_response(kb, owner_usernames=owner_usernames, doc_counts=doc_counts)
        for kb in all_kbs
    ]


@router.post("", response_model=KnowledgeBaseResponse)
def create(
    data: KnowledgeBaseCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """创建知识库"""
    kb = create_knowledge_base(db, current_user, data.name, data.description, data.visibility)
    record_activity(db, current_user.id, ActivityAction.CREATE_KB, kb.id, {"name": kb.name})
    return _kb_response(kb, owner_usernames={current_user.id: current_user.username})


@router.get("/{kb_id}", response_model=KnowledgeBaseResponse)
def get(
    kb_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """知识库详情"""
    kb = _get_kb(db, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="知识库不存在")
    if not has_kb_access(kb, current_user, db):
        raise HTTPException(status_code=403, detail="无访问权限")
    owner = db.query(User).filter(User.id == kb.owner_id).first()
    owner_name = owner.username if owner else ""
    from app.models.document import Document
    doc_count = (
        db.query(func.count(Document.id))
        .filter(Document.knowledge_base_id == kb.id)
        .scalar()
        or 0
    )
    return _kb_response(
        kb,
        owner_usernames={kb.owner_id: owner_name},
        doc_counts={kb.id: doc_count},
    )


@router.patch("/{kb_id}", response_model=KnowledgeBaseResponse)
def update(
    kb_id: int,
    data: KnowledgeBaseUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """更新知识库（仅所有者或管理员）"""
    kb = _get_kb(db, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="知识库不存在")
    if not require_kb_admin(kb, current_user, db):
        raise HTTPException(status_code=403, detail="需管理员权限")
    if data.name is not None:
        kb.name = data.name
    if data.description is not None:
        kb.description = data.description
    if data.visibility is not None:
        kb.visibility = data.visibility
    db.commit()
    db.refresh(kb)
    owner = db.query(User).filter(User.id == kb.owner_id).first()
    owner_name = owner.username if owner else ""
    from app.models.document import Document
    doc_count = (
        db.query(func.count(Document.id))
        .filter(Document.knowledge_base_id == kb.id)
        .scalar()
        or 0
    )
    return _kb_response(
        kb,
        owner_usernames={kb.owner_id: owner_name},
        doc_counts={kb.id: doc_count},
    )


@router.delete("/{kb_id}")
def delete(
    kb_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """删除知识库（仅所有者）"""
    kb = _get_kb(db, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="知识库不存在")
    if not require_kb_owner(kb, current_user):
        raise HTTPException(status_code=403, detail="仅所有者可删除")
    from app.rag.vector_store import delete_kb_vectors
    try:
        delete_kb_vectors(kb_id)
    except Exception:
        logger.exception("delete vector collection failed kb_id=%s", kb_id)
    db.delete(kb)
    db.commit()
    return {"message": "已删除"}


@router.post("/{kb_id}/documents")
def upload_document(
    kb_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    file: UploadFile = File(...),
):
    """上传文档到知识库"""
    kb = _get_kb(db, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="知识库不存在")
    if not require_kb_write(kb, current_user, db):
        raise HTTPException(status_code=403, detail="无写权限")

    filename = file.filename or "unknown"
    ext = _file_extension(filename)
    if ext not in ALLOWED_UPLOAD_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"暂不支持该文件类型，仅支持：{', '.join(sorted(ALLOWED_UPLOAD_EXTENSIONS))}",
        )

    raw = file.file.read()
    max_bytes = settings.MAX_UPLOAD_FILE_SIZE_MB * 1024 * 1024
    if len(raw) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"文件过大，最大允许 {settings.MAX_UPLOAD_FILE_SIZE_MB} MB",
        )
    from app.rag.parser import parse_document
    content = parse_document(raw, filename, file.content_type or "")
    if not content.strip():
        raise HTTPException(status_code=400, detail="文件内容为空或格式不支持")

    from app.models.document import Document
    doc = Document(
        knowledge_base_id=kb_id,
        filename=filename,
        content_type=file.content_type or "",
        file_size=len(raw),
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    try:
        chunk_count = chunk_and_embed(kb_id, content, {"document_id": doc.id, "filename": filename})
        doc.chunk_count = chunk_count
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("chunk_and_embed failed kb_id=%s document_id=%s", kb_id, doc.id)
        db.delete(doc)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="文档向量化失败，请稍后重试",
        )

    record_activity(
        db, current_user.id, ActivityAction.UPLOAD_DOC, kb_id,
        {"filename": filename, "document_id": doc.id},
    )
    return {"document_id": doc.id, "chunk_count": chunk_count}


@router.get("/{kb_id}/documents", response_model=list[DocumentResponse])
def list_documents(
    kb_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    offset: int = Query(0, ge=0, description="跳过的记录数"),
    limit: int = Query(100, ge=1, le=200, description="返回的最大记录数"),
):
    """文档列表"""
    kb = _get_kb(db, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="知识库不存在")
    if not has_kb_access(kb, current_user, db):
        raise HTTPException(status_code=403, detail="无访问权限")
    from app.models.document import Document
    docs = (
        db.query(Document)
        .filter(Document.knowledge_base_id == kb_id)
        .order_by(Document.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return [
        DocumentResponse(
            id=d.id,
            filename=d.filename,
            content_type=d.content_type or "",
            file_size=d.file_size or 0,
            chunk_count=d.chunk_count or 0,
            created_at=d.created_at.isoformat() if d.created_at else None,
        )
        for d in docs
    ]


@router.get("/{kb_id}/members", response_model=list[MemberResponse])
def list_members(
    kb_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """成员列表"""
    kb = _get_kb(db, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="知识库不存在")
    if not has_kb_access(kb, current_user, db):
        raise HTTPException(status_code=403, detail="无访问权限")

    members = db.query(KnowledgeBaseMember).filter(KnowledgeBaseMember.knowledge_base_id == kb_id).all()
    user_ids = [m.user_id for m in members]
    users = db.query(User).filter(User.id.in_(user_ids)).all() if user_ids else []
    user_map = {u.id: u for u in users}

    result = []
    for m in members:
        u = user_map.get(m.user_id)
        if not u:
            continue
        result.append(MemberResponse(
            id=m.id,
            user_id=u.id,
            username=u.username,
            email=u.email,
            role=m.role,
            created_at=m.created_at.isoformat() if m.created_at else None,
        ))

    owner = db.query(User).filter(User.id == kb.owner_id).first()
    if owner:
        result.insert(0, MemberResponse(
            id=0,
            user_id=owner.id,
            username=owner.username,
            email=owner.email,
            role=MemberRole.OWNER,
            created_at=kb.created_at.isoformat() if kb.created_at else None,
        ))
    return result


@router.post("/{kb_id}/members", response_model=MemberResponse)
def add_member_endpoint(
    kb_id: int,
    data: MemberAdd,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """添加成员（需管理员权限）"""
    kb = _get_kb(db, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="知识库不存在")
    if not require_kb_admin(kb, current_user, db):
        raise HTTPException(status_code=403, detail="需管理员权限")
    if data.user_id == kb.owner_id:
        raise HTTPException(status_code=400, detail="不能修改所有者")
    if data.role == MemberRole.OWNER:
        raise HTTPException(status_code=400, detail="不能直接添加所有者")

    existing = db.query(KnowledgeBaseMember).filter(
        KnowledgeBaseMember.knowledge_base_id == kb_id,
        KnowledgeBaseMember.user_id == data.user_id,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="该用户已是成员")

    user = db.query(User).filter(User.id == data.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    try:
        member = add_member(db, kb, data.user_id, data.role)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="该用户已是成员")
    record_activity(
        db, current_user.id, ActivityAction.ADD_MEMBER, kb_id,
        {"member_username": user.username, "role": data.role.value},
    )
    return MemberResponse(
        id=member.id,
        user_id=user.id,
        username=user.username,
        email=user.email,
        role=member.role,
        created_at=member.created_at.isoformat() if member.created_at else None,
    )


@router.patch("/{kb_id}/members/{user_id}", response_model=MemberResponse)
def update_member_endpoint(
    kb_id: int,
    user_id: int,
    data: MemberUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """更新成员角色（需管理员权限）"""
    kb = _get_kb(db, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="知识库不存在")
    if not require_kb_admin(kb, current_user, db):
        raise HTTPException(status_code=403, detail="需管理员权限")
    if user_id == kb.owner_id:
        raise HTTPException(status_code=400, detail="不能修改所有者")
    if data.role == MemberRole.OWNER:
        raise HTTPException(status_code=400, detail="不能设置为所有者")

    member = db.query(KnowledgeBaseMember).filter(
        KnowledgeBaseMember.knowledge_base_id == kb_id,
        KnowledgeBaseMember.user_id == user_id,
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="成员不存在")

    member = update_member_role(db, member, data.role)
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="用户不存在")
    return MemberResponse(
        id=member.id,
        user_id=u.id,
        username=u.username,
        email=u.email,
        role=member.role,
        created_at=member.created_at.isoformat() if member.created_at else None,
    )


@router.delete("/{kb_id}/members/{user_id}")
def remove_member_endpoint(
    kb_id: int,
    user_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """移除成员（需管理员权限，或用户自己退出）"""
    kb = _get_kb(db, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="知识库不存在")
    if user_id == kb.owner_id:
        raise HTTPException(status_code=400, detail="不能移除所有者")

    if current_user.id == user_id:
        # 自己退出
        member = db.query(KnowledgeBaseMember).filter(
            KnowledgeBaseMember.knowledge_base_id == kb_id,
            KnowledgeBaseMember.user_id == user_id,
        ).first()
        if not member:
            raise HTTPException(status_code=404, detail="您不是该知识库成员")
    else:
        if not require_kb_admin(kb, current_user, db):
            raise HTTPException(status_code=403, detail="需管理员权限")
        member = db.query(KnowledgeBaseMember).filter(
            KnowledgeBaseMember.knowledge_base_id == kb_id,
            KnowledgeBaseMember.user_id == user_id,
        ).first()
        if not member:
            raise HTTPException(status_code=404, detail="成员不存在")

    remove_member(db, member)
    return {"message": "已移除"}
