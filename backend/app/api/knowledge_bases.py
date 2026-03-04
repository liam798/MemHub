"""知识库 API"""
import logging
from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user, has_kb_access, require_kb_write, require_kb_admin, require_kb_owner
from app.models.user import User
from app.models.knowledge_base import KnowledgeBase, KnowledgeBaseMember, MemberRole, Visibility
from app.schemas.knowledge_base import (
    KnowledgeBaseCreate,
    KnowledgeBaseUpdate,
    KnowledgeBaseResponse,
    MemberAdd,
    MemberUpdate,
    MemberResponse,
)
from app.schemas.document import (
    DocumentResponse,
    DocumentDetailResponse,
    CreateDocumentRequest,
    UpdateDocumentRequest,
)
from app.models.document import Document, CONTENT_TYPE_RULE
from app.services.knowledge_base import create_knowledge_base, add_member, update_member_role, remove_member
from app.services.activity import record_activity
from app.models.activity import ActivityAction

router = APIRouter(prefix="/knowledge-bases", tags=["知识库"])
logger = logging.getLogger(__name__)
ALLOWED_UPLOAD_EXTENSIONS = {".md"}


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
    created_at = kb.created_at
    updated_at = kb.updated_at or kb.created_at
    return KnowledgeBaseResponse(
        id=kb.id,
        name=kb.name,
        description=kb.description or "",
        visibility=kb.visibility,
        owner_id=kb.owner_id,
        owner_username=(owner_usernames or {}).get(kb.owner_id, ""),
        created_at=created_at.isoformat() if created_at else None,
        updated_at=updated_at.isoformat() if updated_at else None,
        document_count=(doc_counts or {}).get(kb.id, 0),
    )


def _get_kb(db: Session, kb_id: int) -> KnowledgeBase | None:
    return db.query(KnowledgeBase).filter(KnowledgeBase.id == kb_id).first()


@router.get("", response_model=list[KnowledgeBaseResponse])
def list_my_knowledge_bases(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    scope: Annotated[
        Literal["joined", "public"],
        Query(description="joined=我参与的(拥有+成员), public=公开知识库"),
    ] = "joined",
    name: Annotated[str | None, Query(description="按名称模糊匹配，用于 Agent 根据项目名关联知识库")] = None,
):
    """知识库列表。scope=joined 返回我拥有或参与的知识库，scope=public 返回全部公开知识库。name 不为空时仅返回名称包含该字符串的知识库（不区分大小写）。"""
    if scope == "public":
        all_kbs = (
            db.query(KnowledgeBase)
            .filter(KnowledgeBase.visibility == Visibility.PUBLIC)
            .order_by(KnowledgeBase.updated_at.desc(), KnowledgeBase.created_at.desc())
            .all()
        )
    else:
        owned = db.query(KnowledgeBase).filter(KnowledgeBase.owner_id == current_user.id).all()
        member_kbs = (
            db.query(KnowledgeBase)
            .join(KnowledgeBaseMember)
            .filter(KnowledgeBaseMember.user_id == current_user.id)
            .all()
        )
        all_kbs = list({kb.id: kb for kb in owned + member_kbs}.values())
        all_kbs.sort(
            key=lambda kb: (kb.updated_at or kb.created_at or datetime.min),
            reverse=True,
        )

    if name and name.strip():
        needle = name.strip().lower()
        all_kbs = [kb for kb in all_kbs if needle in (kb.name or "").lower()]

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

    if not filename.lower().endswith(".md"):
        filename = f"{filename}.md"

    doc = Document(
        knowledge_base_id=kb_id,
        filename=filename,
        content_type=CONTENT_TYPE_RULE,
        file_size=len(raw),
        chunk_count=0,
        content=content,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    record_activity(
        db, current_user.id, ActivityAction.UPLOAD_DOC, kb_id,
        {"filename": filename, "document_id": doc.id},
    )
    return {"document_id": doc.id}


@router.post("/{kb_id}/documents/create")
def create_document(
    kb_id: int,
    data: CreateDocumentRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """新建文档：原文传给大模型，不向量化。用于规则、记忆、审查事项等需原文生效的内容。"""
    kb = _get_kb(db, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="知识库不存在")
    if not require_kb_write(kb, current_user, db):
        raise HTTPException(status_code=403, detail="无写权限")
    filename = data.title.strip()
    if not filename.endswith(".md"):
        filename = f"{filename}.md"
    doc = Document(
        knowledge_base_id=kb_id,
        filename=filename,
        content_type=CONTENT_TYPE_RULE,
        file_size=len((data.content or "").encode("utf-8")),
        chunk_count=0,
        content=data.content or "",
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    record_activity(
        db, current_user.id, ActivityAction.CREATE_NOTE, kb_id,
        {"filename": filename, "document_id": doc.id, "rule": True},
    )
    return {"document_id": doc.id}


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
            updated_at=(d.updated_at or d.created_at).isoformat() if (d.updated_at or d.created_at) else None,
            is_rule=(d.content_type == CONTENT_TYPE_RULE),
        )
        for d in docs
    ]


@router.get("/{kb_id}/documents/{doc_id}", response_model=DocumentDetailResponse)
def get_document(
    kb_id: int,
    doc_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """获取文档详情，规则类返回 content"""
    kb = _get_kb(db, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="知识库不存在")
    if not has_kb_access(kb, current_user, db):
        raise HTTPException(status_code=403, detail="无访问权限")
    doc = db.query(Document).filter(
        Document.knowledge_base_id == kb_id,
        Document.id == doc_id,
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")
    content = (doc.content if doc.content_type == CONTENT_TYPE_RULE else None) or None
    return DocumentDetailResponse(
        id=doc.id,
        filename=doc.filename,
        content_type=doc.content_type or "",
        file_size=doc.file_size or 0,
        chunk_count=doc.chunk_count or 0,
        created_at=doc.created_at.isoformat() if doc.created_at else None,
        updated_at=(doc.updated_at or doc.created_at).isoformat() if (doc.updated_at or doc.created_at) else None,
        is_rule=(doc.content_type == CONTENT_TYPE_RULE),
        content=content,
    )


@router.patch("/{kb_id}/documents/{doc_id}")
def update_document(
    kb_id: int,
    doc_id: int,
    body: UpdateDocumentRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """更新文档：仅规则类文档可更新，可修改标题与正文。"""
    kb = _get_kb(db, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="知识库不存在")
    if not require_kb_write(kb, current_user, db):
        raise HTTPException(status_code=403, detail="无写权限")
    doc = db.query(Document).filter(
        Document.knowledge_base_id == kb_id,
        Document.id == doc_id,
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")
    if body.title is not None:
        doc.filename = body.title.strip()
    if body.content is not None:
        doc.content = body.content
    db.commit()
    record_activity(
        db, current_user.id, ActivityAction.UPDATE_NOTE, kb_id,
        {"filename": doc.filename, "document_id": doc.id},
    )
    return {"message": "已更新"}


@router.delete("/{kb_id}/documents/{doc_id}")
def delete_document(
    kb_id: int,
    doc_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """删除文档。规则类无向量；普通文档会同时删除向量库中对应块。"""
    kb = _get_kb(db, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="知识库不存在")
    if not require_kb_write(kb, current_user, db):
        raise HTTPException(status_code=403, detail="无写权限")
    doc = db.query(Document).filter(
        Document.knowledge_base_id == kb_id,
        Document.id == doc_id,
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")
    filename = doc.filename
    is_rule = doc.content_type == CONTENT_TYPE_RULE
    if not is_rule:
        from app.rag.vector_store import delete_vectors_by_filter
        delete_vectors_by_filter(kb_id, {"document_id": doc_id})
    db.delete(doc)
    db.commit()
    if is_rule:
        record_activity(
            db, current_user.id, ActivityAction.DELETE_NOTE, kb_id,
            {"filename": filename, "document_id": doc_id},
        )
    return {"message": "已删除"}


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
