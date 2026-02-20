import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import type { Note } from "../api";
import { useDebouncedEffect } from "../hooks/useDebouncedEffect";
import { useSpeechToText } from "../hooks/useSpeechToText";

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

function isSame(a: { title: string | null; content: string }, b: { title: string | null; content: string }) {
  return (a.title ?? null) === (b.title ?? null) && (a.content ?? "") === (b.content ?? "");
}

function firstLineTitleFromContent(content: string) {
  const line = (content || "").replace(/\r\n/g, "\n").split("\n")[0]?.trim() || "";
  if (!line) return null;
  return line.length > 60 ? line.slice(0, 60) : line;
}

function draftKey(id: number) {
  return `notepad:draft:v1:${id}`;
}

type Draft = {
  ts: number;
  title: string | null;
  content: string;
  baseUpdatedAt: string | null; // server updated_at at time of load
};

export default function NoteEditorPage() {
  const params = useParams();
  const id = useMemo(() => Number(params.id), [params.id]);
  const navigate = useNavigate();

  const [note, setNote] = useState<Note | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [err, setErr] = useState<string | null>(null);

  const [shareId, setShareId] = useState<string | null>(null);
  const lastSavedRef = useRef<{ title: string | null; content: string } | null>(null);
  const savingRef = useRef(false);
  const baseUpdatedAtRef = useRef<string | null>(null);

  const titleRef = useRef<HTMLInputElement | null>(null);
  const contentRef = useRef<HTMLTextAreaElement | null>(null);

  // 🎙️ 语音输入
  const speech = useSpeechToText({ lang: "zh-CN" });
  useEffect(() => {
    speech.setOnFinalText((t) => {
      setContent((prev) => (prev ? prev + " " + t : t));
      setSaveState((s) => (s === "saving" ? "saving" : "dirty"));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load note + restore draft if any
  useEffect(() => {
    (async () => {
      setErr(null);
      setSaveState("idle");
      try {
        const n = await api.getNote(id);
        setNote(n);

        const serverTitle = n.title ?? "";
        const serverContent = n.content ?? "";
        setTitle(serverTitle);
        setContent(serverContent);
        setShareId(n.share_id ?? null);

        lastSavedRef.current = { title: n.title ?? null, content: serverContent };
        baseUpdatedAtRef.current = n.updated_at ?? null;

        // restore local draft
        try {
          const raw = localStorage.getItem(draftKey(id));
          if (raw) {
            const d = JSON.parse(raw) as Draft;
            const draftDiffers =
              (d.title ?? null) !== (n.title ?? null) || (d.content ?? "") !== (serverContent ?? "");
            if (draftDiffers) {
              const ok = confirm("检测到本地未同步草稿，是否恢复？（取消则丢弃草稿）");
              if (ok) {
                setTitle(d.title ?? "");
                setContent(d.content ?? "");
                setSaveState("dirty");
              } else {
                localStorage.removeItem(draftKey(id));
              }
            } else {
              // same as server, clear it
              localStorage.removeItem(draftKey(id));
            }
          }
        } catch {
          // ignore
        }

        // autofocus: title if empty else content
        setTimeout(() => {
          if ((n.title ?? "").trim() === "") titleRef.current?.focus();
          else contentRef.current?.focus();
        }, 0);
      } catch (e: any) {
        setErr(e?.message || String(e));
      }
    })();
  }, [id]);

  // mark dirty
  useEffect(() => {
    if (!lastSavedRef.current) return;
    const cur = { title: title === "" ? null : title, content };
    if (!isSame(cur, lastSavedRef.current)) {
      setSaveState((s) => (s === "saving" ? "saving" : "dirty"));
    }
  }, [title, content]);

  // offline draft persist (even if save fails)
  useEffect(() => {
    if (!note) return;
    const cur: Draft = {
      ts: Date.now(),
      title: title === "" ? null : title,
      content,
      baseUpdatedAt: baseUpdatedAtRef.current ?? null,
    };
    try {
      localStorage.setItem(draftKey(id), JSON.stringify(cur));
    } catch {
      // ignore storage errors
    }
  }, [id, note, title, content]);

  async function checkConflict(): Promise<"ok" | "cancel" | "overwrite" | "duplicate"> {
    // If we have a baseUpdatedAt, check if server changed since load
    try {
      const latest = await api.getNote(id);
      const base = baseUpdatedAtRef.current;
      const latestUpdated = latest.updated_at ?? null;

      if (base && latestUpdated && base !== latestUpdated) {
        const choice = prompt(
          "检测到该便签在别处已更新（可能是另一个标签页/设备）。\n输入：\n  o = 覆盖保存\n  d = 复制为新便签\n  c = 取消",
          "c"
        );
        if (!choice) return "cancel";
        const x = choice.trim().toLowerCase();
        if (x === "o") return "overwrite";
        if (x === "d") return "duplicate";
        return "cancel";
      }
      return "ok";
    } catch {
      // If offline or server error, don't block saving attempts
      return "ok";
    }
  }

  async function doSave() {
    if (!note) return;
    if (savingRef.current) return;
    if (!lastSavedRef.current) return;

    // Auto title: if input title empty and server title empty/null, use first line of content
    const inferred = firstLineTitleFromContent(content);
    const effectiveTitle =
      title === "" && (lastSavedRef.current.title ?? null) === null ? (inferred ?? null) : (title === "" ? null : title);

    const payload = { title: effectiveTitle, content };
    if (isSame(payload, lastSavedRef.current)) return;

    // conflict detect (only when we are online-ish)
    if (navigator.onLine) {
      const c = await checkConflict();
      if (c === "cancel") return;
      if (c === "duplicate") {
        const created = await api.createNote({
          title: payload.title,
          content: payload.content,
        });
        localStorage.removeItem(draftKey(id));
        navigate(`/notes/${created.id}`);
        return;
      }
      // overwrite: just continue (best-effort)
    }

    savingRef.current = true;
    setSaveState("saving");
    setErr(null);

    try {
      const updated = await api.patchNote(id, payload);
      setNote(updated);
      setShareId(updated.share_id ?? shareId ?? null);

      lastSavedRef.current = { title: updated.title ?? null, content: updated.content ?? "" };
      baseUpdatedAtRef.current = updated.updated_at ?? baseUpdatedAtRef.current ?? null;

      setSaveState("saved");
      // Clear draft because server is synced
      localStorage.removeItem(draftKey(id));

      setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 800);
    } catch (e: any) {
      setSaveState("error");
      setErr(e?.message || String(e));
      // keep draft in localStorage
    } finally {
      savingRef.current = false;
    }
  }

  // auto-save debounce
  useDebouncedEffect(() => {
    if (!note) return;
    if (saveState !== "dirty") return;
    void doSave();
  }, [title, content, saveState, note], 600);

  // Try sync when back online
  useEffect(() => {
    function onOnline() {
      if (saveState === "dirty") void doSave();
    }
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [saveState]);

  // before unload warning
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (saveState === "dirty" || saveState === "saving") {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [saveState]);

  // Keyboard shortcuts: Ctrl+S / Esc
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isMac = /mac/i.test(navigator.platform);
      const mod = isMac ? e.metaKey : e.ctrlKey;

      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void doSave();
      }
      if (e.key === "Escape") {
        // If speech listening, stop first; else go back
        if (speech.listening) {
          e.preventDefault();
          speech.stop();
          return;
        }
        navigate("/");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, speech.listening, note, title, content, saveState]);

  async function saveNow() {
    await doSave();
  }

  async function remove() {
    if (!confirm("确定删除这条便签吗？")) return;
    await api.deleteNote(id);
    localStorage.removeItem(draftKey(id));
    navigate("/");
  }

  const shareUrl = shareId ? `${location.origin}/share/${shareId}` : null;

  async function share() {
    await doSave();
    const res = await api.shareNote(id);
    setShareId(res.share_id);
    const url = `${location.origin}/share/${res.share_id}`;
    await navigator.clipboard.writeText(url);
    alert(`分享链接已复制：\n${url}`);
  }

  async function copyShare() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    alert("已复制分享链接");
  }

  function saveText() {
    if (!navigator.onLine) return "离线（草稿已保存）";
    switch (saveState) {
      case "dirty":
        return "未保存";
      case "saving":
        return "正在保存…";
      case "saved":
        return "已保存";
      case "error":
        return "保存失败（草稿已保存）";
      default:
        return " ";
    }
  }

  function onTitleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      contentRef.current?.focus();
    }
  }

  function onContentKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Tab") {
      e.preventDefault();
      const el = e.currentTarget;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const insert = "  "; // two spaces
      const next = content.slice(0, start) + insert + content.slice(end);
      setContent(next);
      // restore caret
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = start + insert.length;
      });
    }
  }

  if (err && !note) return <div style={{ color: "crimson" }}>加载失败：{err}</div>;
  if (!note) return <div>加载中…</div>;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={() => navigate("/")}>← 返回</button>
        <button onClick={saveNow} disabled={saveState === "saving"}>
          保存（Ctrl+S）
        </button>

        {speech.supported ? (
          <button onClick={speech.listening ? speech.stop : speech.start} disabled={saveState === "saving"}>
            {speech.listening ? "停止语音" : "语音输入"}
          </button>
        ) : (
          <span style={{ fontSize: 12, opacity: 0.65 }}>当前浏览器不支持语音输入</span>
        )}

        <button onClick={share} disabled={saveState === "saving"}>
          生成分享链接
        </button>

        <button onClick={remove} style={{ marginLeft: "auto" }}>
          删除
        </button>

        <span style={{ fontSize: 12, opacity: 0.75, minWidth: 150, textAlign: "right" }}>
          {saveText()}
        </span>
      </div>

      {saveState === "error" && err ? (
        <div style={{ color: "crimson", fontSize: 13 }}>{err}</div>
      ) : null}

      {speech.listening ? (
        <div style={{ fontSize: 12, opacity: 0.75 }}>
          监听中…{speech.interim ? <span>（{speech.interim}）</span> : null}
        </div>
      ) : null}

      {speech.error ? (
        <div style={{ fontSize: 12, color: "crimson" }}>语音输入错误：{speech.error}</div>
      ) : null}

      {shareUrl ? (
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            border: "1px dashed #ddd",
            padding: 10,
            borderRadius: 10,
          }}
        >
          <div
            style={{
              fontSize: 12,
              opacity: 0.75,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            分享链接：
            <a href={shareUrl} target="_blank" rel="noreferrer">
              {shareUrl}
            </a>
          </div>
          <button onClick={copyShare} style={{ marginLeft: "auto" }}>
            复制
          </button>
        </div>
      ) : null}

      <input
        ref={titleRef}
        value={title}
        placeholder="标题（可选，回车跳到正文）"
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={onTitleKeyDown}
        style={{
          padding: 10,
          fontSize: 16,
          border: "1px solid #e6e6e6",
          borderRadius: 10,
        }}
      />

      <textarea
        ref={contentRef}
        value={content}
        placeholder="开始记录…（会自动保存，可用语音输入；Esc 返回）"
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={onContentKeyDown}
        style={{
          padding: 12,
          fontSize: 14,
          minHeight: 360,
          resize: "vertical",
          border: "1px solid #e6e6e6",
          borderRadius: 10,
          lineHeight: 1.5,
        }}
      />
    </div>
  );
}
