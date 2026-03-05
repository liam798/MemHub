"""用户 API - 用于搜索用户以添加成员"""
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.user import UserResponse

router = APIRouter(prefix="/users", tags=["用户"])


@router.get("/search", response_model=list[UserResponse])
def search_users(
    q: Annotated[str, Query(min_length=1)] = "",
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """搜索用户（用于添加知识库成员）"""
    if not q.strip():
        return []
    pattern = f"%{q.strip()}%"
    users = (
        db.query(User)
        .filter(or_(User.username.ilike(pattern), User.email.ilike(pattern)))
        .limit(20)
        .all()
    )
    return [
        UserResponse(
            id=u.id,
            username=u.username,
            email=u.email,
            is_admin=u.is_admin,
            created_at=u.created_at.isoformat() if u.created_at else None,
        )
        for u in users
    ]
