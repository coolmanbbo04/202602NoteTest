import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";

type Note = {
  id: string;
  title?: string | null;
  content: string;
};


export default function SharePage() {
  const { shareId } = useParams();
  const [note, setNote] = useState<Note | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const n = await api.getShared(String(shareId));
        setNote(n);
      } catch (e: any) {
        setErr(e?.message || String(e));
      }
    })();
  }, [shareId]);

  return (
    <div>
      <div style={{ marginBottom: 12, fontSize: 14 }}>
        <Link to="/">← 回到列表</Link>
      </div>

      {err ? (
        <div style={{ color: "crimson" }}>无法打开分享：{err}</div>
      ) : !note ? (
        <div>加载中…</div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          <h3 style={{ margin: 0 }}>{note.title?.trim() ? note.title : "（无标题）"}</h3>
          <pre style={{ whiteSpace: "pre-wrap", background: "#f6f6f6", padding: 12, borderRadius: 8 }}>
            {note.content}
          </pre>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            这是只读分享页面。
          </div>
        </div>
      )}
    </div>
  );
}



