import { Link, Route, Routes } from "react-router-dom";
import NotesListPage from "./pages/NotesListPage";
import NoteEditorPage from "./pages/NoteEditorPage";
import SharePage from "./pages/SharePage";

export default function App() {
  return (
    <div style={{ maxWidth: 900, margin: "24px auto", padding: "0 16px", fontFamily: "system-ui" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>
          <Link to="/" style={{ textDecoration: "none", color: "inherit" }}>Notepad</Link>
        </h2>
        <a href="/api/health" target="_blank" rel="noreferrer" style={{ fontSize: 14 }}>
          API Health
        </a>
      </header>

      <Routes>
        <Route path="/" element={<NotesListPage />} />
        <Route path="/notes/:id" element={<NoteEditorPage />} />
        <Route path="/share/:shareId" element={<SharePage />} />
      </Routes>
    </div>
  );
}
