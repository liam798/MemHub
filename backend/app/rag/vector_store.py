"""向量存储 - 基于 LangChain PGVector"""
import os
from functools import lru_cache

import httpx
from langchain_community.vectorstores import PGVector
from langchain_openai import OpenAIEmbeddings
from langchain_core.documents import Document

from app.core.config import settings


def get_collection_name(kb_id: int) -> str:
    """知识库对应的向量集合名称"""
    return f"kb_{kb_id}"


def _openai_httpx_clients():
    """创建用于 OpenAI 的 httpx 客户端。优先用环境代理；若为 SOCKS 且未装 socksio 则仅用 HTTP(S) 代理。"""
    read_sec = float(getattr(settings, "OPENAI_REQUEST_TIMEOUT", 60))
    # 连接 15s 超时避免代理无响应；httpx 要求设齐四类或给 default
    timeout = httpx.Timeout(connect=15.0, read=read_sec, write=read_sec, pool=30.0)
    try:
        sync_client = httpx.Client(trust_env=True, timeout=timeout)
        async_client = httpx.AsyncClient(trust_env=True, timeout=timeout)
        return sync_client, async_client
    except ImportError as e:
        if "socksio" not in str(e).lower():
            raise
    proxy_url = os.environ.get("HTTPS_PROXY") or os.environ.get("HTTP_PROXY") or ""
    if proxy_url.strip().lower().startswith("http"):
        sync_client = httpx.Client(proxy=proxy_url.strip(), trust_env=False, timeout=timeout)
        async_client = httpx.AsyncClient(proxy=proxy_url.strip(), trust_env=False, timeout=timeout)
    else:
        sync_client = httpx.Client(trust_env=False, timeout=timeout)
        async_client = httpx.AsyncClient(trust_env=False, timeout=timeout)
    return sync_client, async_client


@lru_cache(maxsize=1)
def get_embeddings():
    """获取 Embedding 模型。使用环境代理（或仅 HTTP 代理）；设置超时避免挂死。"""
    if not settings.OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY 未配置，无法执行向量化检索")
    sync_client, async_client = _openai_httpx_clients()
    return OpenAIEmbeddings(
        model=settings.RAG_EMBEDDING_MODEL,
        openai_api_key=settings.OPENAI_API_KEY,
        http_client=sync_client,
        http_async_client=async_client,
    )


@lru_cache(maxsize=256)
def _get_cached_vector_store(kb_id: int):
    """获取指定知识库的向量存储"""
    base_kw = {
        "connection_string": settings.DATABASE_URL,
        "embedding_function": get_embeddings(),
        "collection_name": get_collection_name(kb_id),
    }
    try:
        return PGVector(**base_kw, use_jsonb=True)
    except TypeError:
        return PGVector(**base_kw)


def get_vector_store(kb_id: int):
    return _get_cached_vector_store(kb_id)


def add_documents_to_kb(kb_id: int, documents: list[Document]) -> None:
    """向知识库添加文档块"""
    store = get_vector_store(kb_id)
    store.add_documents(documents)


def similarity_search(
    kb_id: int,
    query: str,
    k: int = 5,
    metadata_filter: dict | None = None,
) -> list[Document]:
    """相似度搜索"""
    store = get_vector_store(kb_id)
    if metadata_filter:
        try:
            return store.similarity_search(query, k=k, filter=metadata_filter)
        except TypeError:
            pass
    return store.similarity_search(query, k=k)


def similarity_search_with_score(
    kb_id: int,
    query: str,
    k: int = 5,
    metadata_filter: dict | None = None,
) -> list[tuple[Document, float]]:
    """相似度搜索（带分数，用于跨知识库合并排序）"""
    store = get_vector_store(kb_id)
    if metadata_filter:
        try:
            return store.similarity_search_with_score(query, k=k, filter=metadata_filter)
        except TypeError:
            pass
    return store.similarity_search_with_score(query, k=k)


def delete_vectors_by_filter(kb_id: int, metadata_filter: dict) -> bool:
    """按元数据过滤删除向量（若底层不支持则返回 False）"""
    store = get_vector_store(kb_id)
    # 尝试常见 delete 接口签名
    try:
        store.delete(filter=metadata_filter)
        return True
    except TypeError:
        pass
    try:
        store.delete(where=metadata_filter)
        return True
    except TypeError:
        return False


def delete_kb_vectors(kb_id: int) -> None:
    """删除知识库所有向量（删除知识库时调用）"""
    store = get_vector_store(kb_id)
    store.delete_collection()
    _get_cached_vector_store.cache_clear()
