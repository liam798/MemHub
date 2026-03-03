"""活动/动态模型 - 记录知识库相关操作"""
import enum
from sqlalchemy import Column, Integer, DateTime, ForeignKey, Enum, Text, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class ActivityAction(str, enum.Enum):
    """活动类型"""
    CREATE_KB = "create_kb"       # 创建知识库
    UPLOAD_DOC = "upload_doc"     # 上传文档
    ADD_MEMBER = "add_member"     # 添加成员
    CREATE_NOTE = "create_note"   # 新建文档
    UPDATE_NOTE = "update_note"   # 修改文档
    DELETE_NOTE = "delete_note"   # 删除文档


class Activity(Base):
    """活动表 - 用于动态时间线"""

    __tablename__ = "activities"
    __table_args__ = (
        Index("ix_activities_kb_created_at", "knowledge_base_id", "created_at"),
        Index("ix_activities_user_created_at", "user_id", "created_at"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    action = Column(Enum(ActivityAction, values_callable=lambda x: [e.value for e in x]), nullable=False)
    knowledge_base_id = Column(Integer, ForeignKey("knowledge_bases.id"), nullable=True)
    # 扩展信息：filename, document_id, member_username 等
    extra = Column(Text, nullable=True)  # JSON 字符串
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # 关系
    user = relationship("User", back_populates="activities")
    knowledge_base = relationship("KnowledgeBase", back_populates="activities")
