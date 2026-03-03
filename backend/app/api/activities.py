"""活动/动态 API"""
import json
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, has_kb_access
from app.models.user import User
from app.models.activity import Activity
from app.models.knowledge_base import KnowledgeBase
from app.schemas.activity import ActivityResponse

router = APIRouter(prefix="/activities", tags=["活动"])


def _safe_json_loads(raw: str | None) -> dict | None:
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def _activity_response(
    a: Activity,
    kb_name_map: dict[int, str],
    kb_owner_map: dict[int, str],
) -> ActivityResponse:
    from app.schemas.activity import ACTION_LABELS
    kb_name = kb_name_map.get(a.knowledge_base_id) if a.knowledge_base_id else None
    kb_owner = kb_owner_map.get(a.knowledge_base_id) if a.knowledge_base_id else None
    extra = _safe_json_loads(a.extra)
    return ActivityResponse(
        id=a.id,
        user_id=a.user_id,
        username=a.user.username,
        action=a.action.value,
        action_label=ACTION_LABELS.get(a.action.value, a.action.value),
        knowledge_base_id=a.knowledge_base_id,
        knowledge_base_name=kb_name,
        knowledge_base_owner=kb_owner,
        extra=extra,
        created_at=a.created_at.isoformat() if a.created_at else "",
    )


@router.get("", response_model=list[ActivityResponse])
def list_activities(
    scope: Annotated[Literal["all", "mine"], Query(description="all=全部动态, mine=我的动态")] = "all",
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    current_user: Annotated[User, Depends(get_current_user)] = None,
    db: Annotated[Session, Depends(get_db)] = None,
):
    """活动列表，支持筛选全部/我的动态。已删除或无权限的知识库相关动态不展示。"""
    q = db.query(Activity).order_by(Activity.created_at.desc()).limit(limit * 2)  # 多取一些以便过滤
    if scope == "mine":
        q = q.filter(Activity.user_id == current_user.id)
    activities = q.all()
    # 只保留：关联知识库仍存在且当前用户有权限的动态（已删除或无权限的 KB 不展示，knowledge_base_id 为空的也视为无效）
    candidate_kb_ids = sorted({a.knowledge_base_id for a in activities if a.knowledge_base_id is not None})
    kb_map = {}
    if candidate_kb_ids:
        kb_map = {
            kb.id: kb
            for kb in db.query(KnowledgeBase).filter(KnowledgeBase.id.in_(candidate_kb_ids)).all()
        }
    filtered = []
    for a in activities:
        if a.knowledge_base_id is None:
            continue  # 无关联或关联被删（ON DELETE SET NULL）的不展示
        kb = kb_map.get(a.knowledge_base_id)
        if kb and has_kb_access(kb, current_user, db):
            filtered.append(a)
        if len(filtered) >= limit:
            break
    activities = filtered[:limit]

    kb_ids = sorted({a.knowledge_base_id for a in activities if a.knowledge_base_id is not None})
    kb_name_map: dict[int, str] = {}
    kb_owner_map: dict[int, str] = {}
    if kb_ids:
        kbs = db.query(KnowledgeBase).filter(KnowledgeBase.id.in_(kb_ids)).all()
        owner_ids = sorted({kb.owner_id for kb in kbs})
        owners = db.query(User.id, User.username).filter(User.id.in_(owner_ids)).all() if owner_ids else []
        owner_map = {owner_id: username for owner_id, username in owners}
        kb_name_map = {kb.id: kb.name for kb in kbs}
        kb_owner_map = {kb.id: owner_map.get(kb.owner_id, "") for kb in kbs}

    return [_activity_response(a, kb_name_map, kb_owner_map) for a in activities]
