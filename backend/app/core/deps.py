"""API 依赖：认证、权限校验"""
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.user import User
from app.models.knowledge_base import KnowledgeBase, KnowledgeBaseMember, MemberRole

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token", auto_error=False)


def get_current_user(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> User:
    """获取当前用户：支持 JWT（Authorization: Bearer）或 API Key（X-API-Key）"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=f"请先访问 {settings.FRONTEND_URL} 注册并登录，在面板「用户菜单 → API Key」中查看或生成后提供给 Agent",
        headers={"WWW-Authenticate": "Bearer"},
    )
    # 1. 尝试 API Key
    api_key = request.headers.get("X-API-Key")
    if api_key:
        user = db.query(User).filter(User.api_key == api_key.strip()).first()
        if user:
            return user
        raise credentials_exception
    # 2. 尝试 JWT
    auth = request.headers.get("Authorization")
    if auth and auth.startswith("Bearer "):
        token = auth[7:]
        payload = decode_access_token(token)
        if payload:
            user_id = payload.get("sub")
            if user_id:
                user = db.query(User).filter(User.id == int(user_id)).first()
                if user:
                    return user
    raise credentials_exception


ROLE_ORDER = [MemberRole.READ, MemberRole.WRITE, MemberRole.ADMIN, MemberRole.OWNER]


def _get_member(kb_id: int, user_id: int, db: Session) -> KnowledgeBaseMember | None:
    return (
        db.query(KnowledgeBaseMember)
        .filter(
            KnowledgeBaseMember.knowledge_base_id == kb_id,
            KnowledgeBaseMember.user_id == user_id,
        )
        .first()
    )


def has_kb_access(kb: KnowledgeBase, user: User, db: Session) -> bool:
    """用户是否有知识库访问权限（公开或成员）"""
    if kb.visibility.value == "public":
        return True
    if kb.owner_id == user.id:
        return True
    return _get_member(kb.id, user.id, db) is not None


def has_kb_role_at_least(kb: KnowledgeBase, user: User, db: Session, min_role: MemberRole) -> bool:
    """用户是否至少具有指定角色"""
    if kb.owner_id == user.id:
        return True
    member = _get_member(kb.id, user.id, db)
    if not member:
        return False
    return ROLE_ORDER.index(member.role) >= ROLE_ORDER.index(min_role)


def require_kb_read(kb: KnowledgeBase, user: User, db: Session) -> bool:
    """是否有读权限"""
    return has_kb_access(kb, user, db)


def require_kb_write(kb: KnowledgeBase, user: User, db: Session) -> bool:
    """是否有写权限"""
    return has_kb_role_at_least(kb, user, db, MemberRole.WRITE)


def require_kb_admin(kb: KnowledgeBase, user: User, db: Session) -> bool:
    """是否有管理员权限"""
    return has_kb_role_at_least(kb, user, db, MemberRole.ADMIN)


def require_kb_owner(kb: KnowledgeBase, user: User) -> bool:
    """是否是所有者"""
    return kb.owner_id == user.id
