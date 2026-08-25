"use client";

import Link from "next/link";
import { useState } from "react";
import { useRealtime } from "@/components/RealtimeProvider";
import { Panel, StatusChip, Empty, useApi, apiSend, timeAgo } from "@/components/ui";

type Bot = {
  id: string;
  name: string;
  description: string | null;
  prefix: string;
  status: string;
  phoneNumber: string | null;
  engine: string;
  createdAt: string;
  lastConnectedAt: string | null;
  runtime: { status: string; jid: string | null; stats: { messages: number; commands: number } };
};

export default function BotsPage() {
  const { data, loading, reload } = useApi<{ bots: Bot[] }>("/api/bots");
  const { runtimes } = useRealtime();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const act = async (id: string, action: string) => {
    setBusy(`${id}:${action}`);
    setError(null);
    try {
      await apiSend(`/api/bots/${id}/actions`, "POST", { action });
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: string, name: string) => {
    if (!confirm(`Delete ${name}? The WhatsApp auth state will be removed too.`)) return;
    setBusy(`${id}:delete`);
    try {
      await apiSend(`/api/bots/${id}`, "DELETE");
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <Panel
        title="My Bots"
        subtitle="Every bot runs its own Baileys 6.7.18 socket and auth state"
        right={
          <div className="flex gap-2">
            <button type="button" className="btn" onClick={() => void reload()}>🔄 REFRESH</button>
            <Link href="/bots/new" className="btn btn-primary">➕ CREATE SPIDEYBOT</Link>
          </div>
        }
      >
        {error && <p className="mb-3 rounded-lg border border-rose-500/40 bg-rose-500/10 p-2 text-xs text-rose-300">{error}</p>}
        {loading && <p className="text-xs text-slate-500">Loading bots…</p>}
        {!loading && !data?.bots.length && (
          <Empty icon="🤖" title="No bots yet" hint="Create your first SpideyBot to start automating WhatsApp." />
        )}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data?.bots.map((bot) => {
            const status = runtimes[bot.id]?.status ?? bot.runtime.status ?? bot.status;
            const stats = runtimes[bot.id]?.stats ?? bot.runtime.stats;
            return (
              <div key={bot.id} className="panel flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-base font-bold text-white">{bot.name}</p>
                    <p className="truncate text-[11px] text-slate-500">{bot.description || "no description"}</p>
                  </div>
                  <StatusChip status={status} />
                </div>

                <dl className="grid grid-cols-2 gap-2 text-[11px] text-slate-400">
                  <div><dt className="text-slate-600">Prefix</dt><dd className="font-mono text-slate-200">{bot.prefix}</dd></div>
                  <div><dt className="text-slate-600">Number</dt><dd className="truncate">{bot.phoneNumber ?? "-"}</dd></div>
                  <div><dt className="text-slate-600">Messages</dt><dd>{stats?.messages ?? 0}</dd></div>
                  <div><dt className="text-slate-600">Commands</dt><dd>{stats?.commands ?? 0}</dd></div>
                  <div className="col-span-2"><dt className="text-slate-600">Engine</dt><dd className="truncate font-mono text-[10px]">{bot.engine}</dd></div>
                  <div className="col-span-2"><dt className="text-slate-600">Last connected</dt><dd>{timeAgo(bot.lastConnectedAt)}</dd></div>
                </dl>

                <div className="mt-auto grid grid-cols-2 gap-2">
                  <button type="button" className="btn btn-web" disabled={busy !== null} onClick={() => act(bot.id, "start")}>
                    {busy === `${bot.id}:start` ? "…" : "▶️ START"}
                  </button>
                  <button type="button" className="btn" disabled={busy !== null} onClick={() => act(bot.id, "stop")}>
                    {busy === `${bot.id}:stop` ? "…" : "⏹ STOP"}
                  </button>
                  <button type="button" className="btn" disabled={busy !== null} onClick={() => act(bot.id, "restart")}>
                    {busy === `${bot.id}:restart` ? "…" : "♻️ RESTART"}
                  </button>
                  <Link href={`/connection?bot=${bot.id}`} className="btn">📱 CONNECT</Link>
                  <Link href={`/settings?bot=${bot.id}`} className="btn">⚙️ CONFIG</Link>
                  <button type="button" className="btn btn-danger" disabled={busy !== null} onClick={() => remove(bot.id, bot.name)}>
                    🗑 DELETE
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
