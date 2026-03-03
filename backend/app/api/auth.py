"""认证 API"""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import verify_password, generate_api_key
from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.user import UserCreate, UserLogin, UserResponse, Token, ApiKeyResponse
from app.services.auth import register_user, create_token_for_user

router = APIRouter(prefix="/auth", tags=["认证"])


@router.post("/register", response_model=UserResponse)
def register(data: UserCreate, db: Session = Depends(get_db)):
    """用户注册"""
    if db.query(User).filter(User.username == data.username).first():
        raise HTTPException(status_code=400, detail="用户名已存在")
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=400, detail="邮箱已被注册")
    user = register_user(db, data.username, data.email, data.password)
    return UserResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        created_at=user.created_at.isoformat() if user.created_at else None,
    )


@router.post("/login", response_model=Token)
def login(data: UserLogin, db: Session = Depends(get_db)):
    """用户登录（JSON），支持用户名或邮箱"""
    user = (
        db.query(User)
        .filter((User.username == data.username) | (User.email == data.username))
        .first()
    )
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名/邮箱或密码错误",
        )
    token = create_token_for_user(user)
    return Token(access_token=token)


@router.post("/token", response_model=Token)
def token(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """OAuth2 兼容的 token 端点（用于 Swagger 授权），支持用户名或邮箱"""
    user = (
        db.query(User)
        .filter((User.username == form.username) | (User.email == form.username))
        .first()
    )
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名/邮箱或密码错误",
        )
    token_str = create_token_for_user(user)
    return Token(access_token=token_str)


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """获取当前用户信息"""
    return UserResponse(
        id=current_user.id,
        username=current_user.username,
        email=current_user.email,
        created_at=current_user.created_at.isoformat() if current_user.created_at else None,
    )


@router.get("/api-key", response_model=ApiKeyResponse)
def get_or_create_api_key(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """获取或创建 API Key（供 Agent 使用，需 JWT 登录后调用）"""
    if not current_user.api_key:
        current_user.api_key = generate_api_key()
        db.commit()
        db.refresh(current_user)
    return ApiKeyResponse(api_key=current_user.api_key)


@router.post("/api-key/regenerate", response_model=ApiKeyResponse)
def regenerate_api_key(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """重新生成 API Key（旧 Key 将失效）"""
    current_user.api_key = generate_api_key()
    db.commit()
    db.refresh(current_user)
    return ApiKeyResponse(api_key=current_user.api_key)
