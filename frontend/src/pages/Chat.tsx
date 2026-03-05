import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import ChatComposer from "../components/ChatComposer";
import { kbApi, KnowledgeBase } from "../api/knowledgeBase";
import { ragApi, QueryResponse } from "../api/rag";

type MessageRole = "user" | "assistant" | "error";

interface Message {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  sources?: QueryResponse["sources"];
}

interface Session {
  id: string;
  title: string;
  kbIds: number[];
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

interface LocationState {
  question?: string;
  kbIds?: number[];
}

const makeId = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const reorderSessions = (sessions: Session[]) =>
  [...sessions].sort((a, b) => (a.updatedAt > b.updatedAt ? -1 : 1));

export default function Chat() {
  const location = useLocation();
  const navigate = useNavigate();
  const [listJoined, setListJoined] = useState<KnowledgeBase[]>([]);
  const [listPublic, setListPublic] = useState<KnowledgeBase[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [selectedKbIds, setSelectedKbIds] = useState<number[]>([]);
  const [composerQuestion, setComposerQuestion] = useState("");
  const [composerLoading, setComposerLoading] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const initialStateRef = useRef<LocationState | null>(location.state as LocationState | null);

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? null,
    [sessions, activeSessionId],
  );

  useEffect(() => {
    const loadKnowledgeBases = async () => {
      try {
        const [joinedRes, publicRes] = await Promise.all([
          kbApi.list({ scope: "joined" }),
          kbApi.list({ scope: "public" }),
        ]);
        setListJoined(joinedRes.data);
        setListPublic(publicRes.data);
      } catch (error) {
        console.error("加载知识库失败", error);
      }
    };
    loadKnowledgeBases();
  }, []);

  const createSession = (initialTitle: string, kbIds: number[]) => {
    const now = new Date().toISOString();
    const id = makeId();
    const session: Session = {
      id,
      title: initialTitle || "新的对话",
      kbIds,
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    setSessions((prev) => reorderSessions([session, ...prev]));
    setActiveSessionId(id);
    setSelectedKbIds(kbIds);
    return id;
  };

  const appendMessage = (sessionId: string, message: Message) => {
    setSessions((prev) =>
      reorderSessions(
        prev.map((session) =>
          session.id === sessionId
            ? {
                ...session,
                messages: [...session.messages, message],
                updatedAt: message.createdAt,
              }
            : session,
        ),
      ),
    );
  };

  const ensureSessionTitle = (sessionId: string, fallbackTitle: string, kbIds: number[]) => {
    setSessions((prev) =>
      prev.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              title: session.messages.length === 0 ? fallbackTitle : session.title,
              kbIds,
            }
          : session,
      ),
    );
  };

  const runQuery = async (sessionId: string, question: string, kbIds: number[]) => {
    setComposerLoading(true);
    setComposerError(null);
    try {
      const { data } = await ragApi.batchQuery(question, kbIds);
      const answerMessage: Message = {
        id: makeId(),
        role: "assistant",
        content: data.answer,
        sources: data.sources,
        createdAt: new Date().toISOString(),
      };
      appendMessage(sessionId, answerMessage);
    } catch (error) {
      const message =
        (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        (error instanceof Error ? error.message : "提问失败");
      const errorMessage: Message = {
        id: makeId(),
        role: "error",
        content: message,
        createdAt: new Date().toISOString(),
      };
      appendMessage(sessionId, errorMessage);
      setComposerError(message);
    } finally {
      setComposerLoading(false);
      setSessions((prev) =>
        prev.map((session) =>
          session.id === sessionId ? { ...session, kbIds } : session,
        ),
      );
    }
  };

  const sendMessage = async (question: string, kbIds: number[]) => {
    const trimmed = question.trim();
    if (!trimmed) return;
    const ids = kbIds;

    let sessionId = activeSessionId;
    if (!sessionId) {
      sessionId = createSession(trimmed, ids);
    }

    ensureSessionTitle(sessionId!, trimmed, ids);
    const userMessage: Message = {
      id: makeId(),
      role: "user",
      content: trimmed,
      createdAt: new Date().toISOString(),
    };
    appendMessage(sessionId!, userMessage);
    setComposerQuestion("");

    await runQuery(sessionId!, trimmed, ids);
  };

  useEffect(() => {
    if (!initialStateRef.current?.question) return;
    const { question, kbIds = [] } = initialStateRef.current;
    initialStateRef.current = null;
    setSelectedKbIds(kbIds);
    void sendMessage(question, kbIds);
    navigate(".", { replace: true, state: null });
  }, []);

  useEffect(() => {
    if (activeSession) {
      setSelectedKbIds(activeSession.kbIds);
    }
  }, [activeSessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeSession?.messages.length]);

  const handleSelectSession = (sessionId: string) => {
    setActiveSessionId(sessionId);
    const next = sessions.find((session) => session.id === sessionId);
    setSelectedKbIds(next?.kbIds ?? []);
  };

  const handleNewSession = () => {
    setActiveSessionId(null);
    setSelectedKbIds([]);
    setComposerQuestion("");
    setComposerError(null);
  };

  const [sessionSearch, setSessionSearch] = useState("");

  const filteredSessions = useMemo(() => {
    const keyword = sessionSearch.trim().toLowerCase();
    if (!keyword) return sessions;
    return sessions.filter((session) => {
      if (session.title.toLowerCase().includes(keyword)) return true;
      return session.messages.some((message) => message.content.toLowerCase().includes(keyword));
    });
  }, [sessions, sessionSearch]);

  const getKbLabel = (id: number) => {
    const kb = listJoined.concat(listPublic).find((item) => item.id === id);
    if (!kb) return `#${id}`;
    return kb.owner_username ? `${kb.owner_username}/${kb.name}` : kb.name;
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem)] bg-slate-50">
      <aside className="w-72 shrink-0 border-r border-slate-200 bg-white flex flex-col">
        <div className="px-4 pt-6 pb-4 border-b border-slate-100">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-800 text-base">会话</h2>
            <button
              type="button"
              onClick={handleNewSession}
              className="px-2.5 py-1.5 text-sm rounded-lg bg-primary-600 text-white hover:bg-primary-700"
            >
              新建
            </button>
          </div>
        </div>
        <div className="px-4 py-3 border-b border-slate-100">
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={sessionSearch}
              onChange={(event) => setSessionSearch(event.target.value)}
              placeholder="搜索会话或内容..."
              className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredSessions.length === 0 ? (
            <div className="px-4 py-6 text-sm text-slate-500">暂无会话，开始提问吧。</div>
          ) : (
            <ul className="py-2">
              {filteredSessions.map((session) => (
                <li key={session.id}>
                  <button
                    type="button"
                    onClick={() => handleSelectSession(session.id)}
                    className={`w-full text-left px-4 py-3 flex flex-col gap-1 border-l-2 ${
                      session.id === activeSessionId
                        ? "bg-primary-50 border-primary-500 text-primary-700"
                        : "border-transparent hover:bg-slate-50 text-slate-700"
                    }`}
                  >
                    <span className="text-sm font-medium truncate">{session.title}</span>
                    <span className="text-xs text-slate-500 truncate">
                      {new Date(session.updatedAt).toLocaleString()}
                    </span>
                    {session.kbIds.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {session.kbIds.slice(0, 3).map((id) => (
                          <span
                            key={id}
                            className="inline-flex items-center rounded-full bg-slate-100 text-slate-600 px-2 py-0.5 text-[11px]"
                          >
                            {getKbLabel(id)}
                          </span>
                        ))}
                        {session.kbIds.length > 3 && (
                          <span className="text-[11px] text-slate-400">+{session.kbIds.length - 3}</span>
                        )}
                      </div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <main className="flex-1 flex flex-col">
        <div className="flex-1 overflow-y-auto px-8 py-8">
          <div className="max-w-3xl mx-auto space-y-6">
            {activeSession ? (
              activeSession.messages.map((message) => {
                const isUser = message.role === "user";
                const isAssistant = message.role === "assistant";
                const bubbleClass = isUser
                  ? "bg-slate-900 text-white shadow-lg"
                  : isAssistant
                    ? "bg-white/90 border border-primary-100 text-slate-800 shadow-sm"
                    : "bg-amber-50 border border-amber-200 text-amber-900";
                const avatarLabel = isUser ? "我" : isAssistant ? "AI" : "!";
                const avatarClass = isUser
                  ? "bg-slate-900 text-white"
                  : isAssistant
                    ? "bg-primary-100 text-primary-700"
                    : "bg-amber-200 text-amber-900";
                return (
                  <div key={message.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                    {!isUser && (
                      <span className={`mr-3 flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${avatarClass}`}>
                        {avatarLabel}
                      </span>
                    )}
                    <div className="flex max-w-xl flex-col gap-2">
                      <div className={`rounded-2xl px-4 py-3 text-sm leading-6 ${bubbleClass}`}>
                        <p className="whitespace-pre-wrap">{message.content}</p>
                        {isAssistant && message.sources && message.sources.length > 0 && (
                          <div className="mt-3 border-t border-primary-100 pt-3 space-y-2">
                            <div className="text-xs font-medium text-primary-700">引用片段</div>
                            <div className="space-y-2">
                              {message.sources.map((source, index) => (
                                <div
                                  key={index}
                                  className="rounded-lg border border-primary-100 bg-primary-50/60 px-3 py-2 text-xs text-primary-700"
                                >
                                  {source.content}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      <span className="text-xs text-slate-400">
                        {new Date(message.createdAt).toLocaleString()}
                      </span>
                    </div>
                    {isUser && (
                      <span className={`ml-3 flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${avatarClass}`}>
                        {avatarLabel}
                      </span>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="h-[60vh] flex flex-col items-center justify-center gap-3 text-slate-500">
                <div className="rounded-full bg-white shadow px-6 py-3 text-sm font-medium text-slate-600">
                  快速开始：在底部输入问题，或从左侧选取历史会话。
                </div>
                <p className="text-xs text-slate-400">Tip：会自动记录引用的知识库片段，方便复盘。</p>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="border-t border-white/70 bg-white/90 backdrop-blur px-8 py-5 shadow-inner">
          {composerError && (
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              {composerError}
            </div>
          )}
          <div className="max-w-3xl mx-auto">
            <ChatComposer
              value={composerQuestion}
              onChange={setComposerQuestion}
              onSubmit={(question, ids) => sendMessage(question, ids.length > 0 ? ids : selectedKbIds)}
              selectedKbIds={selectedKbIds}
              onSelectedKbIdsChange={(ids) => {
                setSelectedKbIds(ids);
                if (activeSessionId) {
                  setSessions((prev) =>
                    prev.map((session) =>
                      session.id === activeSessionId ? { ...session, kbIds: ids } : session,
                    ),
                  );
                }
              }}
              knowledgeBases={{ joined: listJoined, public: listPublic }}
              loading={composerLoading}
              placeholder="输入问题，Enter 发送 · Shift+Enter 换行"
            />
          </div>
        </div>
      </main>
    </div>
  );
}
