export type Note = {
  id: number;
  title: string | null;
  content: string;
  created_at?: string;
  updated_at?: string;
  share_id?: string | null;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  listNotes: () => request<Note[]>("/api/notes"),
  createNote: (payload: { title?: string | null; content: string }) =>
    request<Note>("/api/notes", { method: "POST", body: JSON.stringify(payload) }),
  getNote: (id: number) => request<Note>(`/api/notes/${id}`),
  patchNote: (id: number, payload: { title?: string | null; content?: string }) =>
    request<Note>(`/api/notes/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteNote: (id: number) => request<void>(`/api/notes/${id}`, { method: "DELETE" }),
  shareNote: (id: number) =>
    request<{ share_id: string }>(`/api/notes/${id}/share`, { method: "POST" }),
  getShared: (shareId: string) => request<Note>(`/api/share/${shareId}`),
};
