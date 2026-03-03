"""活动相关模式"""
from pydantic import BaseModel

ACTION_LABELS = {
    "create_kb": "创建了知识库",
    "upload_doc": "上传了文档",
    "add_member": "添加了成员",
    "create_note": "新建了文档",
}


class ActivityResponse(BaseModel):
    id: int
    user_id: int
    username: str
    action: str
    action_label: str
    knowledge_base_id: int | None
    knowledge_base_name: str | None
    knowledge_base_owner: str | None = None  # 知识库所有者，用于显示 owner/kb 格式
    extra: dict | None
    created_at: str
