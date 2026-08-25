"use client";

import { useRef, useState } from "react";
import { Panel, Empty, useApi, apiSend, bytes, timeAgo } from "@/components/ui";

type Entry = { name: string; type: "dir" | "file"; size: number; modifiedAt: string | null; path: string };

export default function FilesPage() {
  const [path, setPath] = useState("");
  const { data, reload, loading } = useApi<{ path: string; entries: Entry[]; root: string }>(
    `/api/files?path=${encodeURIComponent(path)}`,
    [path],
  );
  const [editing, setEditing] = useState<{ path: string; content: string } | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  const entries = (data?.entries ?? []).filter((e) => e.name.toLowerCase().includes(query.toLowerCase()));

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const openFile = async (entry: Entry) => {
    setError(null);
    try {
      const res = await fetch(`/api/files?mode=read&path=${encodeURIComponent(entry.path)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setEditing({ path: entry.path, content: json.content });
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const upload = async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    form.append("path", path);
    const res = await fetch("/api/files", { method: "POST", body: form });
    if (!res.ok) throw new Error((await res.json()).error ?? "upload failed");
  };

  const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";

  return (
    <div className="space-y-4">
      <Panel
        title="File Manager"
        subtitle={`Sandboxed workspace · ${data?.root ?? ""} · WhatsApp session credentials are never exposed here`}
        right={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn"
              onClick={() => {
                const name = prompt("New file name (e.g. notes.md)");
                if (name) void run(() => apiSend("/api/files", "POST", { action: "create", path: `${path}/${name}`, content: "" }));
              }}
            >
              📄 NEW FILE
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                const name = prompt("New folder name");
                if (name) void run(() => apiSend("/api/files", "POST", { action: "mkdir", path: `${path}/${name}` }));
              }}
            >
              📁 NEW FOLDER
            </button>
            <button type="button" className="btn" onClick={() => uploadRef.current?.click()}>⬆️ UPLOAD</button>
            <input
              ref={uploadRef}
              type="file"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void run(() => upload(file));
                e.target.value = "";
              }}
            />
          </div>
        }
      >
        <div className="flex flex-col gap-2 sm:flex-row">
          <input className="input" placeholder="🔍 Search in this folder…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <button type="button" className="btn sm:w-auto" disabled={!path} onClick={() => setPath(parent)}>⬅️ UP</button>
        </div>
        <p className="mt-2 font-mono text-[11px] text-slate-500">/{path}</p>
        {error && <p className="mt-2 rounded-lg border border-rose-500/40 bg-rose-500/10 p-2 text-xs text-rose-300">{error}</p>}
      </Panel>

      <Panel>
        {loading && <p className="text-xs text-slate-500">Loading…</p>}
        {!loading && entries.length === 0 && <Empty icon="📁" title="This folder is empty" hint="Create a file or upload something." />}
        <div className="space-y-2">
          {entries.map((entry) => (
            <div key={entry.path} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-edge bg-black/30 p-3">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                onClick={() => (entry.type === "dir" ? setPath(entry.path) : openFile(entry))}
              >
                <span className="text-lg">{entry.type === "dir" ? "📁" : "📄"}</span>
                <span className="min-w-0">
                  <span className="block truncate text-sm text-slate-200">{entry.name}</span>
                  <span className="block text-[11px] text-slate-500">
                    {entry.type === "file" ? bytes(entry.size) : "folder"} · {timeAgo(entry.modifiedAt)}
                  </span>
                </span>
              </button>
              <div className="flex flex-wrap gap-1">
                {entry.type === "file" && (
                  <button type="button" className="btn px-2 py-1 text-[11px]" onClick={() => openFile(entry)}>EDIT</button>
                )}
                <button
                  type="button"
                  className="btn px-2 py-1 text-[11px]"
                  onClick={() => {
                    const next = prompt("Rename to", entry.name);
                    if (next) void run(() => apiSend("/api/files", "POST", { action: "rename", path: entry.path, newPath: `${path}/${next}` }));
                  }}
                >
                  RENAME
                </button>
                <button
                  type="button"
                  className="btn btn-danger px-2 py-1 text-[11px]"
                  onClick={() => {
                    if (confirm(`Delete ${entry.name}?`)) void run(() => apiSend(`/api/files?path=${encodeURIComponent(entry.path)}`, "DELETE"));
                  }}
                >
                  DELETE
                </button>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3" onClick={() => setEditing(null)}>
          <div className="panel flex max-h-[85dvh] w-full max-w-3xl flex-col p-4" onClick={(e) => e.stopPropagation()}>
            <p className="mb-2 truncate font-mono text-xs text-slate-400">/{editing.path}</p>
            <textarea
              className="input terminal h-[50dvh] flex-1 resize-none"
              value={editing.content}
              onChange={(e) => setEditing({ ...editing, content: e.target.value })}
            />
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                className="btn btn-primary flex-1"
                onClick={() =>
                  void run(async () => {
                    await apiSend("/api/files", "POST", { action: "write", path: editing.path, content: editing.content });
                    setEditing(null);
                  })
                }
              >
                💾 SAVE
              </button>
              <button type="button" className="btn flex-1" onClick={() => setEditing(null)}>CANCEL</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
