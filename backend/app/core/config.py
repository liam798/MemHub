"""应用配置"""
from functools import cached_property
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """应用配置"""

    APP_NAME: str = "MemHub"
    DEBUG: bool = False
    API_V1_PREFIX: str = "/api"
    ALLOWED_ORIGINS: str = "*"

    # 数据库
    DATABASE_URL: str = "postgresql://postgres:password@localhost:5432/memhub"
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20
    DB_POOL_TIMEOUT_SECONDS: int = 30
    DB_POOL_RECYCLE_SECONDS: int = 1800

    # JWT
    SECRET_KEY: str = "change-me-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # OpenAI（大模型与向量化）
    OPENAI_API_KEY: str = ""
    RAG_LLM_MODEL: str = "gpt-4o-mini"
    RAG_EMBEDDING_MODEL: str = "text-embedding-3-small"
    RAG_TOP_K_MAX: int = 20
    # 单次 OpenAI 请求超时（秒），避免无代理时挂死
    OPENAI_REQUEST_TIMEOUT: int = 60

    # 应用
    REQUEST_TIMEOUT_SECONDS: int = 180
    MAX_UPLOAD_FILE_SIZE_MB: int = 25
    ALLOW_DESTRUCTIVE_MIGRATIONS: bool = False
    # Agent Skill 文件路径，为空则使用项目根目录 SKILL.md
    SKILL_MD_PATH: str = ""

    @cached_property
    def cors_origins(self) -> list[str]:
        v = (self.ALLOWED_ORIGINS or "").strip()
        if not v:
            return ["*"]
        return [x.strip() for x in v.split(",") if x.strip()] or ["*"]

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
