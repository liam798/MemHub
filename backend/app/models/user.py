"""用户模型"""
from sqlalchemy import Column, Integer, String, DateTime, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func, expression

from app.core.database import Base


class User(Base):
    """用户表"""

    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(64), unique=True, index=True, nullable=False)
    email = Column(String(256), unique=True, index=True, nullable=False)
    hashed_password = Column(String(256), nullable=False)
    api_key = Column(String(64), unique=True, index=True, nullable=True)
    is_admin = Column(Boolean, nullable=False, default=False, server_default=expression.false())
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # 关系
    owned_knowledge_bases = relationship(
        "KnowledgeBase", back_populates="owner", foreign_keys="KnowledgeBase.owner_id"
    )
    memberships = relationship("KnowledgeBaseMember", back_populates="user")
    activities = relationship("Activity", back_populates="user")
