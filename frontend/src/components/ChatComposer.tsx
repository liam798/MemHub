import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { KnowledgeBase } from "../api/knowledgeBase";

interface ChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (question: string, kbIds: number[]) => void | Promise<void>;
  selectedKbIds: number[];
  onSelectedKbIdsChange: (ids: number[]) => void;
  knowledgeBases: {
    joined: KnowledgeBase[];
    public: KnowledgeBase[];
  };
  loading?: boolean;
  placeholder?: string;
}

function dedupePublic(joined: KnowledgeBase[], publicList: KnowledgeBase[]) {
  const joinedIds = new Set(joined.map((kb) => kb.id));
  return publicList.filter((kb) => !joinedIds.has(kb.id));
}

export default function ChatComposer({
  value,
  onChange,
  onSubmit,
  selectedKbIds,
  onSelectedKbIdsChange,
  knowledgeBases,
  loading = false,
  placeholder = "输入你的问题...",
}: ChatComposerProps) {
  const [focused, setFocused] = useState(false);
  const [kbSelectOpen, setKbSelectOpen] = useState(false);
  const [kbSelectSearch, setKbSelectSearch] = useState("");
  const [kbDropdownStyle, setKbDropdownStyle] = useState({ top: 0, left: 0 });
  const kbTriggerRef = useRef<HTMLButtonElement>(null);
  const kbSelectRef = useRef<HTMLDivElement>(null);

  const publicOnly = useMemo(
    () => dedupePublic(knowledgeBases.joined, knowledgeBases.public),
    [knowledgeBases.joined, knowledgeBases.public],
  );

  const normalizedSearch = kbSelectSearch.trim().toLowerCase();

  const joinedFiltered = useMemo(() => {
    if (!normalizedSearch) return knowledgeBases.joined;
    return knowledgeBases.joined.filter((kb) =>
      `${kb.owner_username || ""}/${kb.name}`.toLowerCase().includes(normalizedSearch) ||
      (kb.description || "").toLowerCase().includes(normalizedSearch),
    );
  }, [knowledgeBases.joined, normalizedSearch]);

  const publicFiltered = useMemo(() => {
    if (!normalizedSearch) return publicOnly;
    return publicOnly.filter((kb) =>
      `${kb.owner_username || ""}/${kb.name}`.toLowerCase().includes(normalizedSearch) ||
      (kb.description || "").toLowerCase().includes(normalizedSearch),
    );
  }, [publicOnly, normalizedSearch]);

  const hasResults = joinedFiltered.length > 0 || publicFiltered.length > 0;

  const updateDropdownPos = () => {
    if (kbTriggerRef.current) {
      const rect = kbTriggerRef.current.getBoundingClientRect();
      setKbDropdownStyle({ top: rect.bottom + 4, left: rect.left });
    }
  };

  useLayoutEffect(() => {
    if (!kbSelectOpen) return;
    updateDropdownPos();
    const updateOnScroll = () => updateDropdownPos();
    window.addEventListener("scroll", updateOnScroll, true);
    window.addEventListener("resize", updateOnScroll);
    return () => {
      window.removeEventListener("scroll", updateOnScroll, true);
      window.removeEventListener("resize", updateOnScroll);
    };
  }, [kbSelectOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!kbSelectOpen) return;
      const target = event.target as Node;
      if (kbSelectRef.current?.contains(target)) return;
      const portal = document.getElementById("kb-select-portal");
      if (portal?.contains(target)) return;
      setKbSelectOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [kbSelectOpen]);

  const toggleKb = (id: number) => {
    if (selectedKbIds.includes(id)) {
      onSelectedKbIdsChange(selectedKbIds.filter((item) => item !== id));
    } else {
      onSelectedKbIdsChange([...selectedKbIds, id]);
    }
  };

  const describeSelection = () => {
    if (selectedKbIds.length === 0) return "全部知识库";
    if (selectedKbIds.length === 1) {
      const combined = [...knowledgeBases.joined, ...knowledgeBases.public];
      const target = combined.find((kb) => kb.id === selectedKbIds[0]);
      if (!target) return "已选 1 个";
      return target.owner_username ? `${target.owner_username}/${target.name}` : target.name;
    }
    return `已选 ${selectedKbIds.length} 个`;
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || loading) return;
    onSubmit(trimmed, selectedKbIds);
  };

  const submitDisabled = loading || !value.trim();

  return (
    <form
      onSubmit={handleSubmit}
      className={`border rounded-xl overflow-hidden flex flex-col transition-all bg-transparent ${
        focused ? "ring-1 ring-primary-500 border-primary-500" : "border-slate-300"
      }`}
    >
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            const trimmed = value.trim();
            if (trimmed && !submitDisabled) {
              onSubmit(trimmed, selectedKbIds);
            }
          }
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        className="w-full px-4 py-3 text-sm resize-none focus:outline-none focus:ring-0 border-0 placeholder:text-slate-500 bg-transparent"
        rows={4}
        disabled={loading}
      />
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="relative" ref={kbSelectRef}>
          <button
            ref={kbTriggerRef}
            type="button"
            onClick={() => setKbSelectOpen((open) => !open)}
            className="inline-flex items-center gap-2 pl-3 pr-2 py-1.5 border border-slate-200 rounded-lg text-sm bg-white text-slate-600 hover:border-slate-300 min-w-[140px]"
          >
            <span className="w-4 h-4 shrink-0 text-slate-500 flex items-center justify-center">
              <svg className="w-full h-full" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                <path d="M12 6v12" />
                <path d="M10 18l2-3 2 3" />
              </svg>
            </span>
            <span className="flex-1 min-w-0 truncate text-left">{describeSelection()}</span>
            <svg className="w-4 h-4 shrink-0 ml-auto text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {kbSelectOpen &&
            createPortal(
              <div
                id="kb-select-portal"
                className="fixed w-72 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden z-[100]"
                style={{ top: kbDropdownStyle.top, left: kbDropdownStyle.left }}
              >
                <div className="p-3 border-b border-slate-100">
                  <h3 className="text-sm font-medium text-slate-800 mb-2">选择知识库</h3>
                  <div className="relative">
                    <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      type="text"
                      value={kbSelectSearch}
                      onChange={(event) => setKbSelectSearch(event.target.value)}
                      placeholder="搜索"
                      className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {!hasResults ? (
                    <div className="py-6 text-center text-sm text-slate-500">无匹配结果</div>
                  ) : (
                    <>
                      {joinedFiltered.length > 0 && (
                        <div className="py-1">
                          {joinedFiltered.map((kb) => {
                            const checked = selectedKbIds.includes(kb.id);
                            return (
                              <label
                                key={kb.id}
                                className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-slate-50 border-l-2 ${
                                  checked ? "bg-slate-50 border-primary-500" : "border-transparent"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleKb(kb.id)}
                                  className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                                />
                                <span className="w-5 h-5 min-w-5 flex items-center justify-center shrink-0 text-slate-500">
                                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                                    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                                    <path d="M12 6v12" />
                                    <path d="M10 18l2-3 2 3" />
                                  </svg>
                                </span>
                                <span className="text-sm text-slate-700 truncate">
                                  {kb.owner_username ? `${kb.owner_username}/${kb.name}` : kb.name}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                      {publicFiltered.length > 0 && (
                        <div className="py-1 border-t border-slate-100">
                          <div className="px-3 py-1.5 text-xs font-medium text-slate-500">公开知识库</div>
                          {publicFiltered.map((kb) => {
                            const checked = selectedKbIds.includes(kb.id);
                            return (
                              <label
                                key={kb.id}
                                className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-slate-50 border-l-2 ${
                                  checked ? "bg-slate-50 border-primary-500" : "border-transparent"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleKb(kb.id)}
                                  className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                                />
                                <span className="w-5 h-5 min-w-5 flex items-center justify-center shrink-0 text-slate-500">
                                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                                    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                                    <path d="M12 6v12" />
                                    <path d="M10 18l2-3 2 3" />
                                  </svg>
                                </span>
                                <span className="text-sm text-slate-700 truncate">
                                  {kb.owner_username ? `${kb.owner_username}/${kb.name}` : kb.name}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>,
              document.body,
            )}
        </div>
        <button
          type="submit"
          disabled={submitDisabled}
          className="p-2.5 text-primary-600 hover:bg-primary-50 rounded-lg disabled:opacity-50"
          title="Enter 发送、Shift+Enter 换行"
        >
          <svg className="w-6 h-6 rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </div>
    </form>
  );
}
