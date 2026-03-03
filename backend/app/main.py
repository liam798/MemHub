"""MemHub 主应用"""
import asyncio
import logging
import time
import uuid
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings

SKILL_PLACEHOLDER = "__MEMHUB_ORIGIN__"
from app.core.database import check_db_health
from app.api.auth import router as auth_router
from app.api.users import router as users_router
from app.api.knowledge_bases import router as kb_router
from app.api.rag import router as rag_router
from app.api.activities import router as activities_router
from app.api.memory import router as memory_router

logger = logging.getLogger(__name__)

app = FastAPI(title=settings.APP_NAME)

_cors_origins = settings.cors_origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials="*" not in _cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix=settings.API_V1_PREFIX)
app.include_router(users_router, prefix=settings.API_V1_PREFIX)
app.include_router(kb_router, prefix=settings.API_V1_PREFIX)
app.include_router(rag_router, prefix=settings.API_V1_PREFIX)
app.include_router(activities_router, prefix=settings.API_V1_PREFIX)
app.include_router(memory_router, prefix=settings.API_V1_PREFIX)


@app.middleware("http")
async def request_context_middleware(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex
    request.state.request_id = request_id
    start = time.perf_counter()

    try:
        response = await asyncio.wait_for(
            call_next(request),
            timeout=settings.REQUEST_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        logger.warning(
            "request timeout request_id=%s method=%s path=%s",
            request_id,
            request.method,
            request.url.path,
        )
        response = JSONResponse(
            status_code=504,
            content={"detail": "请求超时，请稍后重试", "request_id": request_id},
        )
    except Exception:
        logger.exception(
            "unhandled error request_id=%s method=%s path=%s",
            request_id,
            request.method,
            request.url.path,
        )
        response = JSONResponse(
            status_code=500,
            content={"detail": "服务器内部错误", "request_id": request_id},
        )

    duration_ms = int((time.perf_counter() - start) * 1000)
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Process-Time-Ms"] = str(duration_ms)
    return response


def _skill_md_path() -> Path:
    if settings.SKILL_MD_PATH:
        return Path(settings.SKILL_MD_PATH)
    # 默认：项目根目录 SKILL.md（backend/app/main.py -> 上级两级为 backend，再上级为项目根）
    root = Path(__file__).resolve().parent.parent.parent
    return root / "SKILL.md"


@app.get("/skill.md")
async def skill_md(request: Request) -> Response:
    """返回 Agent Skill 文档，按当前请求的域名/IP 动态替换占位符。"""
    path = _skill_md_path()
    if not path.exists():
        return Response(content="SKILL.md not found", status_code=404)
    body = path.read_text(encoding="utf-8")
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or "localhost"
    proto = request.headers.get("x-forwarded-proto")
    if proto is None:
        proto = "https" if request.url.scheme == "https" else "http"
    origin = f"{proto}://{host}"
    body = body.replace(SKILL_PLACEHOLDER, origin)
    return Response(
        content=body,
        media_type="text/markdown; charset=utf-8",
        headers={"Cache-Control": "public, max-age=0"},
    )


@app.get("/")
def root():
    return {"message": "MemHub API", "docs": "/docs"}


@app.get("/health/live")
def health_live():
    return {"status": "ok"}


@app.get("/health/ready")
def health_ready():
    healthy, reason = check_db_health()
    if not healthy:
        return JSONResponse(
            status_code=503,
            content={"status": "degraded", "database": reason},
        )
    return {"status": "ok", "database": "ok"}
