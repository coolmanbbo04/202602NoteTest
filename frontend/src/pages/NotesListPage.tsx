import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import type { Note } from "../api";

type SortMode = "updated_desc" | "created_desc" | "title_asc";

function formatTime(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

function normalize(s: string) {
  return (s || "").toLowerCase();
}

function firstLine(s: string) {
  const t = (s || "").replace(/\r\n/g, "\n").split("\n")[0] ?? "";
  return t.trim();
}

function previewText(s: string, max = 90) {
  const t = (s || "").replace(/\s+/g, " ").trim();
  if (!t) return "（空内容）";
  return t.length > max ? t.slice(0, max) + "…" : t;
}

// very small, safe highlighter (no HTML injection): split + <mark>
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const lower = text.toLowerCase();
  const ql = q.toLowerCase();
  const parts: React.ReactNode[] = [];

  let i = 0;
  while (true) {
    const idx = lower.indexOf(ql, i);
    if (idx === -1) {
      parts.push(text.slice(i));
      break;
    }
    if (idx > i) parts.push(text.slice(i, idx));
    parts.push(<mark key={idx} style={{ padding: "0 2px" }}>{text.slice(idx, idx + q.length)}</mark>);
    i = idx + q.length;
  }
  return <>{parts}</>;
}

const PIN_KEY = "notepad:pins:v1";
function loadPins(): Record<number, true> {
  try {
    return JSON.parse(localStorage.getItem(PIN_KEY) || "{}");
  } catch {
    return {};
  }
}
function savePins(pins: Record<number, true>) {
  localStorage.setItem(PIN_KEY, JSON.stringify(pins));
}

export default function NotesListPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const navigate = useNavigate();

  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("updated_desc");
  const [pins, setPins] = useState<Record<number, true>>(() => loadPins());
  const searchRef = useRef<HTMLInputElement | null>(null);

  async function refresh() {
    setLoading(true);
    setErr(null);
    try {
      const data = await api.listNotes();
      setNotes(data);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  // "/" 聚焦搜索（像很多笔记/控制台工具那样）
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "/" && !(e.ctrlKey || e.metaKey || e.altKey)) {
        const el = document.activeElement as HTMLElement | null;
        const typing =
          el?.tagName === "INPUT" || el?.tagName === "TEXTAREA" || (el as any)?.isContentEditable;
        if (typing) return;
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  async function create() {
    const created = await api.createNote({ title: null, content: "New note..." });
    navigate(`/notes/${created.id}`);
  }

  function togglePin(id: number) {
    setPins((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = true;
      savePins(next);
      return next;
    });
  }

  const filteredSorted = useMemo(() => {
    const q = normalize(query.trim());
    const filtered = !q
      ? notes
      : notes.filter((n) => {
          const title = n.title ?? "";
          const content = n.content ?? "";
          return normalize(title).includes(q) || normalize(content).includes(q);
        });

    const withComputed = filtered.map((n) => {
      const updated = new Date(n.updated_at || 0).getTime();
      const created = new Date(n.created_at || 0).getTime();
      const displayTitle = (n.title?.trim() ? n.title!.trim() : firstLine(n.content || "")) || "（无标题）";
      return { n, updated, created, displayTitle };
    });

    withComputed.sort((a, b) => {
      if (sortMode === "title_asc") return a.displayTitle.localeCompare(b.displayTitle, "zh-Hans-CN");
      if (sortMode === "created_desc") return (b.created || 0) - (a.created || 0);
      return (b.updated || b.created || 0) - (a.updated || a.created || 0);
    });

    // Pin 永远置顶（不影响组内排序）
    withComputed.sort((a, b) => {
      const pa = pins[a.n.id] ? 1 : 0;
      const pb = pins[b.n.id] ? 1 : 0;
      return pb - pa;
    });

    return withComputed;
  }, [notes, query, sortMode, pins]);

  const countText = useMemo(() => {
    if (loading) return "加载中…";
    const total = notes.length;
    const shown = filteredSorted.length;
    return query.trim() ? `显示 ${shown}/${total}` : `${total} 条便签`;
  }, [loading, notes.length, filteredSorted.length, query]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={create}>+ 新建</button>
        <button onClick={refresh} disabled={loading}>刷新</button>

        <input
          ref={searchRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索标题或内容（按 / 聚焦）"
          style={{ padding: 8, border: "1px solid #e6e6e6", borderRadius: 10, minWidth: 260 }}
        />

        <select
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as SortMode)}
          style={{ padding: 8, border: "1px solid #e6e6e6", borderRadius: 10 }}
        >
          <option value="updated_desc">最近更新</option>
          <option value="created_desc">最近创建</option>
          <option value="title_asc">标题 A-Z</option>
        </select>

        <span style={{ fontSize: 12, opacity: 0.7 }}>{countText}</span>
      </div>

      {err && <div style={{ color: "crimson" }}>错误：{err}</div>}

      {loading ? (
        <div>加载中…</div>
      ) : filteredSorted.length === 0 ? (
        <div style={{ opacity: 0.8 }}>{query.trim() ? "没有匹配结果。" : "暂无便签，点“新建”开始。"}</div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {filteredSorted.map(({ n, displayTitle }) => {
            const time = formatTime(n.updated_at || n.created_at);
            const shared = Boolean(n.share_id);
            const pinned = Boolean(pins[n.id]);
            const preview = previewText(n.content);

            return (
              <Link
                key={n.id}
                to={`/notes/${n.id}`}
                style={{
                  textDecoration: "none",
                  color: "inherit",
                  border: "1px solid #e6e6e6",
                  borderRadius: 10,
                  padding: 12,
                  display: "grid",
                  gap: 6,
                }}
              >
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ fontWeight: 650, display: "flex", gap: 8, alignItems: "baseline" }}>
                    <span style={{ opacity: pinned ? 1 : 0.6 }}>{pinned ? "📌" : ""}</span>
                    <span>
                      <Highlight text={displayTitle} query={query} />
                    </span>
                  </div>

                  <div style={{ fontSize: 12, opacity: 0.65, whiteSpace: "nowrap" }}>{time}</div>
                </div>

                <div style={{ fontSize: 13, opacity: 0.8 }}>
                  <Highlight text={preview} query={query} />
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, opacity: 0.65, alignItems: "center" }}>
                  <span>#{n.id}</span>

                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <span>{shared ? "已分享" : ""}</span>
                    <button
                      onClick={(e) => { e.preventDefault(); togglePin(n.id); }}
                      style={{ padding: "4px 8px" }}
                      title="置顶/取消置顶（仅本机）"
                    >
                      {pinned ? "取消置顶" : "置顶"}
                    </button>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
