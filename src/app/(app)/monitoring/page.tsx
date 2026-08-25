"use client";

import { useEffect, useState } from "react";
import { useRealtime, type Metrics } from "@/components/RealtimeProvider";
import { Panel, StatCard, StatusChip, useApi, bytes } from "@/components/ui";

type Payload = {
  metrics: Metrics;
  bots: { id: string; name: string; status: string; stats: { messages: number; commands: number; downloads: number }; uptimeMs: number }[];
  commandsLastHour: number;
  downloadsLastHour: number;
};

export default function MonitoringPage() {
  const { data, reload } = useApi<Payload>("/api/monitoring");
  const { metrics: live, runtimes, connected } = useRealtime();
  const [history, setHistory] = useState<{ ts: number; cpu: number; mem: number }[]>([]);

  const metrics = live ?? data?.metrics ?? null;

  useEffect(() => {
    if (!metrics) return;
    setHistory((h) => [...h.slice(-59), { ts: metrics.ts, cpu: metrics.cpu.usagePercent, mem: metrics.memory.usedPercent }]);
  }, [metrics]);

  useEffect(() => {
    const t = setInterval(() => void reload(), 60_000);
    return () => clearInterval(t);
  }, [reload]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="CPU" value={`${metrics?.cpu.usagePercent ?? 0}%`} hint={`${metrics?.cpu.cores ?? 0} cores`} accent="red" />
        <StatCard label="RAM" value={`${metrics?.memory.usedPercent ?? 0}%`} hint={bytes(metrics?.memory.totalBytes)} accent="web" />
        <StatCard label="Event loop" value={`${metrics?.eventLoop.meanMs ?? 0} ms`} hint={`p99 ${metrics?.eventLoop.p99Ms ?? 0} ms`} accent="neon" />
        <StatCard label="Storage" value={metrics?.storage ? `${metrics.storage.usedPercent.toFixed(0)}%` : "n/a"} hint={metrics?.storage ? `${bytes(metrics.storage.freeBytes)} free` : ""} accent="green" />
      </div>

      <Panel title="Live graph" subtitle={connected ? "4 second push interval" : "waiting for stream"}>
        <div className="flex h-40 items-end gap-[2px] overflow-hidden rounded-xl border border-edge bg-black/40 p-2">
          {history.map((h, i) => (
            <div key={i} className="flex h-full flex-1 flex-col justify-end gap-[1px]">
              <div className="w-full rounded-t bg-[#ff2e4d]/70" style={{ height: `${Math.max(2, h.cpu)}%` }} />
              <div className="w-full rounded-t bg-[#2f6bff]/70" style={{ height: `${Math.max(2, h.mem * 0.5)}%` }} />
            </div>
          ))}
          {history.length === 0 && <p className="text-xs text-slate-600">Collecting samples…</p>}
        </div>
        <p className="mt-2 text-[11px] text-slate-500">🔴 CPU % · 🔵 RAM % (scaled)</p>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Host" subtitle="Real values from the Node.js process">
          <dl className="grid grid-cols-2 gap-2 text-xs text-slate-400">
            <dt className="text-slate-600">Hostname</dt><dd className="truncate text-right">{metrics?.hostname}</dd>
            <dt className="text-slate-600">Platform</dt><dd className="truncate text-right">{metrics?.platform}</dd>
            <dt className="text-slate-600">Node</dt><dd className="text-right">{metrics?.nodeVersion}</dd>
            <dt className="text-slate-600">CPU model</dt><dd className="truncate text-right">{metrics?.cpu.model}</dd>
            <dt className="text-slate-600">Load avg</dt><dd className="text-right">{metrics?.cpu.loadAvg.join(" / ")}</dd>
            <dt className="text-slate-600">Process RSS</dt><dd className="text-right">{bytes(metrics?.memory.processRssBytes)}</dd>
            <dt className="text-slate-600">Heap used</dt><dd className="text-right">{bytes(metrics?.memory.heapUsedBytes)}</dd>
            <dt className="text-slate-600">Uptime</dt><dd className="text-right">{Math.round((metrics?.processUptimeSec ?? 0) / 60)} min</dd>
            <dt className="text-slate-600">Network</dt>
            <dd className="truncate text-right">{metrics?.network.interfaces.map((i) => i.address).join(", ") || "-"}</dd>
          </dl>
        </Panel>

        <Panel title="Bot runtime" subtitle={`${data?.commandsLastHour ?? 0} commands · ${data?.downloadsLastHour ?? 0} downloads in the last hour`}>
          {!data?.bots.length && <p className="text-xs text-slate-500">No bots yet.</p>}
          <div className="space-y-2">
            {data?.bots.map((b) => {
              const rt = runtimes[b.id];
              return (
                <div key={b.id} className="flex items-center justify-between gap-3 rounded-xl border border-edge bg-black/30 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{b.name}</p>
                    <p className="text-[11px] text-slate-500">
                      {(rt?.stats.messages ?? b.stats.messages)} msg · {(rt?.stats.commands ?? b.stats.commands)} cmd ·{" "}
                      {(rt?.stats.downloads ?? b.stats.downloads)} dl · up {Math.round((rt?.uptimeMs ?? b.uptimeMs) / 60000)}m
                    </p>
                  </div>
                  <StatusChip status={rt?.status ?? b.status} />
                </div>
              );
            })}
          </div>
        </Panel>
      </div>
    </div>
  );
}
