"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRealtime } from "@/components/RealtimeProvider";
import { Panel, StatCard, StatusChip, Empty, useApi, timeAgo } from "@/components/ui";

type Stats = {
  bots: number;
  onlineBots: number;
  messages: number;
  commands: number;
  groups: number;
  downloads: number;
  downloadsSucceeded: number;
  downloadsLast24h: number;
  botStates: { id: string; name: string; status: string; stats: { messages: number; commands: number } }[];
};

type Me = { user: { name: string; username: string } | null };

export default function DashboardPage() {
  const { data, reload } = useApi<Stats>("/api/stats");
  const { data: me } = useApi<Me>("/api/auth/me");
  const { runtimes, events, metrics, connected } = useRealtime();

  useEffect(() => {
    const t = setInterval(() => void reload(), 30_000);
    return () => clearInterval(t);
  }, [reload]);

  const online = data
    ? data.botStates.filter((b) => (runtimes[b.id]?.status ?? b.status) === "connected").length
    : 0;

  return (
    <div className="space-y-4">
      <div className="panel relative overflow-hidden p-5 sm:p-7">
        <div className="pointer-events-none absolute -right-16 -top-16 text-[10rem] opacity-10">🕷️</div>
        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#ff5c74]">SPIDEYBOT CONTROL</p>
        <h1 className="mt-2 text-2xl font-black text-white sm:text-3xl">
          Welcome back, {me?.user?.name ?? "operator"} 🕷️
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          Real Baileys 6.7.18 engine · real OAuth sessions · real downloader providers. Every number below comes from
          the live runtime and the PostgreSQL database.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/bots/new" className="btn btn-primary">➕ CREATE SPIDEYBOT</Link>
          <Link href="/connection" className="btn">📱 CONNECTION CENTER</Link>
          <Link href="/terminal" className="btn">🖥 LIVE TERMINAL</Link>
          <Link href="/downloader" className="btn">📥 DOWNLOADER</Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Bots" value={data?.bots ?? 0} accent="red" />
        <StatCard label="Online Bots" value={online} accent="green" hint={connected ? "live stream" : "stream offline"} />
        <StatCard label="Messages" value={data?.messages ?? 0} accent="web" hint="since process start" />
        <StatCard label="Commands" value={data?.commands ?? 0} accent="neon" hint="all time" />
        <StatCard label="Groups" value={data?.groups ?? 0} accent="web" />
        <StatCard
          label="Downloads"
          value={data?.downloads ?? 0}
          accent="red"
          hint={`${data?.downloadsSucceeded ?? 0} ok · ${data?.downloadsLast24h ?? 0} in 24h`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Bot fleet" subtitle="Runtime state straight from the Baileys sockets" className="lg:col-span-2">
          {!data?.botStates.length ? (
            <Empty
              icon="🤖"
              title="No SpideyBot created yet"
              hint="Use the Create Bot wizard to deploy your first WhatsApp automation."
            />
          ) : (
            <div className="space-y-2">
              {data.botStates.map((bot) => {
                const rt = runtimes[bot.id];
                return (
                  <Link
                    key={bot.id}
                    href={`/connection?bot=${bot.id}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-edge bg-black/30 p-3 transition hover:border-[#37e6ff]/40"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-white">{bot.name}</p>
                      <p className="truncate text-[11px] text-slate-500">
                        {rt?.jid ?? "not linked"} · {rt?.stats.messages ?? bot.stats.messages} msg ·{" "}
                        {rt?.stats.commands ?? bot.stats.commands} cmd
                      </p>
                    </div>
                    <StatusChip status={rt?.status ?? bot.status} />
                  </Link>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel title="System" subtitle="Live metrics (4s push)">
          {metrics ? (
            <div className="space-y-3 text-xs">
              <Meter label="CPU" value={metrics.cpu.usagePercent} hint={`${metrics.cpu.cores} cores`} />
              <Meter label="RAM" value={metrics.memory.usedPercent} hint={`${(metrics.memory.processRssBytes / 1048576).toFixed(0)} MB rss`} />
              {metrics.storage && <Meter label="Storage" value={metrics.storage.usedPercent} />}
              <div className="flex justify-between text-slate-500">
                <span>Event loop</span>
                <span>{metrics.eventLoop.meanMs} ms mean · p99 {metrics.eventLoop.p99Ms} ms</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Node</span>
                <span>{metrics.nodeVersion}</span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500">Waiting for the realtime stream…</p>
          )}
        </Panel>
      </div>

      <Panel title="Live activity" subtitle="Realtime events pushed by the engine">
        {events.length === 0 ? (
          <Empty icon="📡" title="No events yet" hint="Start a bot to see live Baileys, command and downloader events." />
        ) : (
          <div className="terminal max-h-72 space-y-1 overflow-y-auto rounded-xl bg-black/50 p-3">
            {events
              .slice(-40)
              .reverse()
              .map((e, i) => (
                <div key={e.id ?? i} className="flex gap-2">
                  <span className="text-slate-600">{new Date(e.ts).toLocaleTimeString()}</span>
                  <span className="text-[#37e6ff]">{e.channel ?? e.type}</span>
                  <span className="text-slate-300">{e.message ?? JSON.stringify(e.payload).slice(0, 120)}</span>
                </div>
              ))}
          </div>
        )}
        <p className="mt-2 text-right text-[10px] text-slate-600">updated {timeAgo(Date.now())}</p>
      </Panel>
    </div>
  );
}

function Meter({ label, value, hint }: { label: string; value: number; hint?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  const color = pct > 85 ? "bg-rose-500" : pct > 60 ? "bg-amber-400" : "bg-emerald-400";
  return (
    <div>
      <div className="flex justify-between text-slate-400">
        <span>{label}</span>
        <span>{pct.toFixed(1)}% {hint ? `· ${hint}` : ""}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
