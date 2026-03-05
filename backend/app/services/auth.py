"""认证服务"""
from app.core.security import get_password_hash, create_access_token
from app.models.user import User


def register_user(db, username: str, email: str, password: str) -> User:
    """注册新用户"""
    hashed = get_password_hash(password)
    # 第一个注册用户自动设为管理员
    is_first_user = db.query(User.id).first() is None
    user = User(username=username, email=email, hashed_password=hashed, is_admin=is_first_user)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def create_token_for_user(user: User) -> str:
    """为用户创建 JWT"""
    return create_access_token(data={"sub": str(user.id)})
