"""RAG 问答 API"""
import logging
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.core.database import get_db

logger = logging.getLogger(__name__)
from app.core.deps import get_current_user, has_kb_access
from app.models.user import User
from app.models.knowledge_base import KnowledgeBase, KnowledgeBaseMember, Visibility
from app.models.document import Document, CONTENT_TYPE_RULE
from app.schemas.rag import QueryRequest, QueryResponse, BatchQueryRequest
from app.rag.pipeline import query_kb, query_kbs

router = APIRouter(tags=["RAG 问答"])


def _get_rule_context(db: Session, kb_ids: list[int]) -> str:
    """拉取所选知识库下所有规则文档的原文，拼接后供 RAG 注入系统提示。"""
    if not kb_ids:
        return ""
    rows = (
        db.query(Document.filename, Document.content)
        .filter(
            Document.knowledge_base_id.in_(kb_ids),
            Document.content_type == CONTENT_TYPE_RULE,
            Document.content.isnot(None),
            Document.content != "",
        )
        .order_by(Document.knowledge_base_id, Document.created_at)
        .all()
    )
    parts = []
    for filename, content in rows:
        if content and content.strip():
            parts.append(f"【{filename}】\n{content.strip()}")
    return "\n\n".join(parts) if parts else ""


def _get_kb(db: Session, kb_id: int) -> KnowledgeBase | None:
    return db.query(KnowledgeBase).filter(KnowledgeBase.id == kb_id).first()


def _get_accessible_kb_ids(db: Session, user: User) -> list[int]:
    """获取用户可访问的知识库 ID 列表（拥有的 + 成员的 + 公开的）"""
    rows = (
        db.query(KnowledgeBase.id)
        .outerjoin(
            KnowledgeBaseMember,
            and_(
                KnowledgeBaseMember.knowledge_base_id == KnowledgeBase.id,
                KnowledgeBaseMember.user_id == user.id,
            ),
        )
        .filter(
            or_(
                KnowledgeBase.owner_id == user.id,
                KnowledgeBaseMember.user_id == user.id,
                KnowledgeBase.visibility == Visibility.PUBLIC,
            )
        )
        .distinct()
        .all()
    )
    return [kb_id for (kb_id,) in rows]


@router.post("/knowledge-bases/query", response_model=QueryResponse)
def batch_query(
    data: BatchQueryRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """多知识库 RAG 问答，kb_ids 为空时表示全部可访问知识库"""
    accessible_kb_ids = set(_get_accessible_kb_ids(db, current_user))
    kb_ids = data.kb_ids if data.kb_ids else sorted(accessible_kb_ids)
    unauthorized = [kb_id for kb_id in kb_ids if kb_id not in accessible_kb_ids]
    if unauthorized:
        raise HTTPException(
            status_code=403,
            detail=f"无权限访问知识库: {','.join(str(i) for i in unauthorized)}",
        )
    if not kb_ids:
        raise HTTPException(status_code=400, detail="暂无可用知识库，请先创建或加入知识库")
    rule_context = _get_rule_context(db, kb_ids)
    try:
        answer, sources = query_kbs(kb_ids, data.question, data.top_k, rule_context=rule_context)
    except (TimeoutError, httpx.TimeoutException, httpx.ConnectError) as e:
        logger.warning("RAG OpenAI 请求失败: %s", e)
        raise HTTPException(
            status_code=504,
            detail="OpenAI 请求超时或网络不可达，请检查本机代理（HTTP_PROXY/HTTPS_PROXY）或稍后重试",
        ) from e
    except Exception as e:
        if "timeout" in str(e).lower() or "connection" in str(e).lower():
            logger.warning("RAG 请求失败(超时/连接): %s", e)
            raise HTTPException(
                status_code=504,
                detail="OpenAI 请求超时或网络不可达，请检查代理或稍后重试",
            ) from e
        raise
    return QueryResponse(answer=answer, sources=sources)


@router.post("/knowledge-bases/{kb_id}/query", response_model=QueryResponse)
def query(
    kb_id: int,
    data: QueryRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """基于知识库的 RAG 问答"""
    kb = _get_kb(db, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="知识库不存在")
    if not has_kb_access(kb, current_user, db):
        raise HTTPException(status_code=403, detail="无访问权限")

    rule_context = _get_rule_context(db, [kb_id])
    try:
        answer, sources = query_kb(kb_id, data.question, data.top_k, rule_context=rule_context)
    except (TimeoutError, httpx.TimeoutException, httpx.ConnectError) as e:
        logger.warning("RAG OpenAI 请求失败: %s", e)
        raise HTTPException(
            status_code=504,
            detail="OpenAI 请求超时或网络不可达，请检查本机代理（HTTP_PROXY/HTTPS_PROXY）或稍后重试",
        ) from e
    except Exception as e:
        if "timeout" in str(e).lower() or "connection" in str(e).lower():
            logger.warning("RAG 请求失败(超时/连接): %s", e)
            raise HTTPException(
                status_code=504,
                detail="OpenAI 请求超时或网络不可达，请检查代理或稍后重试",
            ) from e
        raise
    return QueryResponse(answer=answer, sources=sources)
