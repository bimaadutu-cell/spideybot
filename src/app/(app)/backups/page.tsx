"use client";

import { useState } from "react";
import { Panel, Empty, useApi, apiSend, bytes, timeAgo } from "@/components/ui";

type Backup = { id: string; label: string; sizeBytes: number; createdAt: string };

export default function BackupsPage() {
  const { data, reload } = useApi<{ backups: Backup[] }>("/api/backups");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const create = async () => {
    setBusy("create");
    try {
      const label = prompt("Backup label", `Backup ${new Date().toLocaleString()}`) ?? undefined;
      await apiSend("/api/backups", "POST", { label });
      setMsg("Backup created from your live bot configuration.");
      await reload();
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const restore = async (id: string) => {
    if (!confirm("Restore this backup? Existing bots with the same id will be updated.")) return;
    setBusy(id);
    try {
      const res = await apiSend<{ restoredBots: number }>("/api/backups", "PUT", { id });
      setMsg(`Restored ${res.restoredBots} bots.`);
      await reload();
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this backup?")) return;
    setBusy(id);
    try {
      await apiSend(`/api/backups?id=${id}`, "DELETE");
      await reload();
    } finally {
      setBusy(null);
    }
  };

  return (
    <Panel
      title="Backups"
      subtitle="Snapshot of bots, bot settings, command toggles and group settings stored in PostgreSQL"
      right={
        <button type="button" className="btn btn-primary" disabled={busy !== null} onClick={create}>
          {busy === "create" ? "Creating…" : "💾 CREATE BACKUP"}
        </button>
      }
    >
      {msg && <p className="mb-3 rounded-lg border border-edge bg-black/40 p-2 text-xs text-slate-300">{msg}</p>}
      {!data?.backups.length ? (
        <Empty icon="💾" title="No backups yet" hint="Create one to snapshot your current configuration." />
      ) : (
        <div className="space-y-2">
          {data.backups.map((b) => (
            <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-edge bg-black/30 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm text-slate-200">{b.label}</p>
                <p className="text-[11px] text-slate-500">{bytes(b.sizeBytes)} · {timeAgo(b.createdAt)} · {b.id}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn px-3 py-1.5 text-[11px]" disabled={busy !== null} onClick={() => restore(b.id)}>
                  ♻️ RESTORE
                </button>
                <a className="btn px-3 py-1.5 text-[11px]" href={`/api/backups/${b.id}/download`}>⬇️ DOWNLOAD</a>
                <button type="button" className="btn btn-danger px-3 py-1.5 text-[11px]" disabled={busy !== null} onClick={() => remove(b.id)}>
                  🗑 DELETE
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
