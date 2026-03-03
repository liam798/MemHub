"""RAG 管道：分块、检索、生成"""
import logging

import httpx
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.documents import Document

from app.core.config import settings
from app.rag.vector_store import (
    add_documents_to_kb,
)

logger = logging.getLogger(__name__)


TEXT_SPLITTER = RecursiveCharacterTextSplitter(
    chunk_size=500,
    chunk_overlap=50,
    length_function=len,
)


def chunk_and_embed(kb_id: int, content: str, metadata: dict | None = None) -> int:
    """
    将文本分块并存入向量库，返回块数量
    """
    chunks = TEXT_SPLITTER.split_text(content)
    docs = [
        Document(page_content=c, metadata=metadata or {"knowledge_base_id": kb_id})
        for c in chunks
    ]
    if docs:
        add_documents_to_kb(kb_id, docs)
    return len(docs)


def _filter_expired_docs(docs: list[Document]) -> list[Document]:
    """过滤过期的 memory 文档"""
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    filtered: list[Document] = []
    for d in docs:
        meta = d.metadata or {}
        if meta.get("type") == "memory" and meta.get("expires_at"):
            try:
                if datetime.fromisoformat(meta["expires_at"]) < now:
                    continue
            except Exception:
                pass
        filtered.append(d)
    return filtered


def format_docs(docs: list[Document]) -> str:
    """将检索到的文档格式化为上下文"""
    return "\n\n---\n\n".join(d.page_content for d in docs)


def _build_rag_messages(rule_context: str | None, context: str, question: str) -> list[tuple[str, str]]:
    """构建 RAG 消息：若有规则则优先注入原文。"""
    system_parts = ["你是一个基于知识库的问答助手。"]
    if rule_context and rule_context.strip():
        system_parts.append("以下规则请优先遵守：\n" + rule_context.strip())
    system_parts.append("请根据检索到的上下文回答用户问题。如果上下文中没有相关信息，请如实说明。回答要准确、简洁。")
    return [
        ("system", "\n\n".join(system_parts)),
        ("human", "上下文：\n{context}\n\n问题：{question}"),
    ]


def _rag_prompt_with_rules(rule_context: str | None) -> ChatPromptTemplate:
    return ChatPromptTemplate.from_messages(
        _build_rag_messages(rule_context, "{context}", "{question}")
    )


def _safe_top_k(top_k: int) -> int:
    max_k = max(1, settings.RAG_TOP_K_MAX)
    if top_k < 1:
        return 1
    if top_k > max_k:
        return max_k
    return top_k


def _build_sources(docs: list[Document]) -> list[dict]:
    return [
        {
            "content": d.page_content[:200] + "..." if len(d.page_content) > 200 else d.page_content,
            "knowledge_base_id": d.metadata.get("_kb_id") if d.metadata else None,
        }
        for d in docs
    ]


def _fallback_answer_from_docs(docs: list[Document], question: str) -> str:
    snippets: list[str] = []
    for idx, doc in enumerate(docs[:3], start=1):
        text = " ".join(doc.page_content.split())
        if len(text) > 140:
            text = text[:140] + "..."
        snippets.append(f"{idx}. {text}")
    joined = "\n".join(snippets) if snippets else "暂无可用片段。"
    return (
        f"当前暂时无法调用大模型生成最终答案，但已检索到与问题“{question}”相关的片段：\n"
        f"{joined}"
    )


def _generate_answer(context: str, question: str, rule_context: str | None = None) -> str:
    if not settings.OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY 未配置")
    from app.rag.vector_store import _openai_httpx_clients
    sync_client, _ = _openai_httpx_clients()
    timeout_sec = getattr(settings, "OPENAI_REQUEST_TIMEOUT", 60)
    llm = ChatOpenAI(
        model=settings.RAG_LLM_MODEL,
        openai_api_key=settings.OPENAI_API_KEY,
        temperature=0,
        timeout=timeout_sec,
        max_retries=2,
        http_client=sync_client,
    )
    prompt = _rag_prompt_with_rules(rule_context)
    chain = prompt | llm | StrOutputParser()
    return chain.invoke({"context": context, "question": question})


def query_kbs(
    kb_ids: list[int],
    question: str,
    top_k: int = 5,
    rule_context: str | None = None,
) -> tuple[str, list[dict]]:
    """
    多知识库问答：仅使用知识库内 MD/规则原文，不做向量检索。
    """
    context = (rule_context or "").strip()
    if not context:
        return "知识库中暂无文档内容，请先上传或新建文档。", []
    try:
        answer = _generate_answer(context, question, rule_context=rule_context)
    except Exception as exc:
        logger.warning("query_kbs llm degraded: %s", exc)
        answer = "暂时无法生成回答，请检查 OpenAI 配置或稍后重试。"
    return answer, []


def query_kb(
    kb_id: int,
    question: str,
    top_k: int = 5,
    rule_context: str | None = None,
) -> tuple[str, list[dict]]:
    """
    知识库问答：仅使用知识库内 MD/规则原文，不做向量检索。
    """
    context = (rule_context or "").strip()
    if not context:
        return "知识库中暂无文档内容，请先上传或新建文档。", []
    try:
        answer = _generate_answer(context, question, rule_context=rule_context)
    except Exception as exc:
        logger.warning("query_kb llm degraded: %s", exc)
        answer = "暂时无法生成回答，请检查 OpenAI 配置或稍后重试。"
    return answer, []
