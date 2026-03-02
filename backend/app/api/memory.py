"""跨 agent 公共记忆 API"""
import json
from datetime import datetime, timedelta, timezone
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, has_kb_access, require_kb_write
from app.models.knowledge_base import KnowledgeBase
from app.models.memory import MemoryItem
from app.models.user import User
from app.schemas.memory import MemoryCreate, MemoryQuery, MemoryResponse
from app.schemas.memory_cleanup import MemoryCleanupRequest, MemoryCleanupResponse
from app.rag.vector_store import add_documents_to_kb, similarity_search, delete_vectors_by_filter
from langchain_core.documents import Document

router = APIRouter(tags=["公共记忆"])
logger = logging.getLogger(__name__)


_RESERVED_META_KEYS = {"knowledge_base_id", "type", "memory_id", "expires_at"}


def _get_kb(db: Session, kb_id: int) -> KnowledgeBase | None:
    return db.query(KnowledgeBase).filter(KnowledgeBase.id == kb_id).first()


def _parse_metadata(raw: str | None) -> dict | None:
    if not raw:
        return None
    try:
        return json.loads(raw)
    except Exception:
        return None


def _validate_metadata_keys(meta: dict | None) -> None:
    if not meta:
        return
    reserved = sorted(k for k in meta.keys() if k in _RESERVED_META_KEYS)
    if reserved:
        keys = ", ".join(reserved)
        raise HTTPException(status_code=400, detail=f"metadata 中包含保留字段：{keys}")


@router.post("/knowledge-bases/{kb_id}/memory", response_model=MemoryResponse)
def add_memory(
    kb_id: int,
    data: MemoryCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """写入公共记忆（受 KB 写权限约束）"""
    kb = _get_kb(db, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="知识库不存在")
    if not require_kb_write(kb, current_user, db):
        raise HTTPException(status_code=403, detail="无写入权限")

    _validate_metadata_keys(data.metadata)

    ttl = data.ttl_seconds
    expires_at = None
    if ttl is not None and ttl > 0:
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=ttl)

    item = MemoryItem(
        knowledge_base_id=kb_id,
        user_id=current_user.id,
        content=data.content,
        metadata_json=json.dumps(data.metadata or {}, ensure_ascii=False),
        ttl_seconds=ttl,
        expires_at=expires_at,
    )
    db.add(item)
    db.commit()
    db.refresh(item)

    # 写入向量库（与 KB 同集合）
    meta = {
        "knowledge_base_id": kb_id,
        "type": "memory",
        "memory_id": item.id,
        "expires_at": expires_at.isoformat() if expires_at else None,
    }
    if data.metadata:
        meta.update(data.metadata)
    doc = Document(page_content=item.content, metadata=meta)
    add_documents_to_kb(kb_id, [doc])

    return MemoryResponse(
        id=item.id,
        knowledge_base_id=kb_id,
        user_id=current_user.id,
        content=item.content,
        metadata=data.metadata or {},
        ttl_seconds=item.ttl_seconds,
        expires_at=item.expires_at.isoformat() if item.expires_at else None,
        created_at=item.created_at.isoformat() if item.created_at else None,
    )


@router.post("/knowledge-bases/{kb_id}/memory/query", response_model=list[MemoryResponse])
def query_memory(
    kb_id: int,
    data: MemoryQuery,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """查询公共记忆（受 KB 读权限约束）"""
    kb = _get_kb(db, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="知识库不存在")
    if not has_kb_access(kb, current_user, db):
        raise HTTPException(status_code=403, detail="无访问权限")

    _validate_metadata_keys(data.metadata_filter)
    vector_filter = {"type": "memory"}
    if data.metadata_filter:
        vector_filter.update(data.metadata_filter)

    docs = similarity_search(kb_id, data.query, k=data.top_k, metadata_filter=vector_filter)

    now = datetime.now(timezone.utc)
    results: list[MemoryResponse] = []
    for d in docs:
        meta = d.metadata or {}
        if meta.get("type") != "memory":
            continue
        expires_at = meta.get("expires_at")
        if expires_at:
            try:
                if datetime.fromisoformat(expires_at) < now:
                    continue
            except Exception:
                pass
        memory_id = meta.get("memory_id")
        if not memory_id:
            continue
        item = db.query(MemoryItem).filter(MemoryItem.id == int(memory_id)).first()
        if not item:
            continue
        if item.knowledge_base_id != kb_id:
            continue
        if item.expires_at and item.expires_at < now:
            continue

        results.append(
            MemoryResponse(
                id=item.id,
                knowledge_base_id=item.knowledge_base_id,
                user_id=item.user_id,
                content=item.content,
                metadata=_parse_metadata(item.metadata_json),
                ttl_seconds=item.ttl_seconds,
                expires_at=item.expires_at.isoformat() if item.expires_at else None,
                created_at=item.created_at.isoformat() if item.created_at else None,
            )
        )
    return results


@router.post("/knowledge-bases/{kb_id}/memory/cleanup", response_model=MemoryCleanupResponse)
def cleanup_memory(
    kb_id: int,
    data: MemoryCleanupRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """清理过期公共记忆（DB + 向量）。需要 KB 写权限。"""
    kb = _get_kb(db, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="知识库不存在")
    if not require_kb_write(kb, current_user, db):
        raise HTTPException(status_code=403, detail="无写入权限")

    now = datetime.now(timezone.utc)
    items = (
        db.query(MemoryItem)
        .filter(MemoryItem.knowledge_base_id == kb_id)
        .filter(MemoryItem.expires_at.isnot(None))
        .filter(MemoryItem.expires_at < now)
        .limit(data.limit)
        .all()
    )

    deleted_rows = 0
    deleted_vectors = 0
    skipped_vectors = 0
    for item in items:
        ok = delete_vectors_by_filter(
            kb_id,
            {"type": "memory", "memory_id": item.id},
        )
        if ok:
            deleted_vectors += 1
        else:
            skipped_vectors += 1
            logger.debug("vector delete not supported for memory_id=%s", item.id)
        db.delete(item)
        deleted_rows += 1

    db.commit()
    return MemoryCleanupResponse(
        deleted_rows=deleted_rows,
        deleted_vectors=deleted_vectors,
        skipped_vectors=skipped_vectors,
    )
