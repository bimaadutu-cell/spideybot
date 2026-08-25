"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRealtime } from "@/components/RealtimeProvider";
import { Panel, useApi } from "@/components/ui";

type LogRow = {
  id: number;
  channel: string;
  level: string;
  message: string;
  botId: string | null;
  createdAt: string;
};

const CHANNELS = ["ALL", "BAILEYS", "COMMAND", "DOWNLOADER", "GROUP", "SYSTEM", "ERROR", "AUTH"];

export default function TerminalPage() {
  const [channel, setChannel] = useState("ALL");
  const [autoScroll, setAutoScroll] = useState(true);
  const { data, reload } = useApi<{ logs: LogRow[] }>(`/api/logs?channel=${channel}&limit=250`, [channel]);
  const { logs: liveLogs, connected, clearLogs } = useRealtime();
  const boxRef = useRef<HTMLDivElement>(null);

  const merged = useMemo(() => {
    const persisted = (data?.logs ?? []).map((l) => ({
      ts: new Date(l.createdAt).getTime(),
      channel: l.channel,
      level: l.level,
      message: l.message,
      botId: l.botId,
    }));
    const live = liveLogs
      .filter((l) => channel === "ALL" || (l.channel ?? "SYSTEM") === channel)
      .map((l) => ({
        ts: l.ts,
        channel: l.channel ?? l.type.toUpperCase(),
        level: l.level ?? "info",
        message: l.message ?? "",
        botId: l.botId ?? null,
      }));
    return [...persisted, ...live].sort((a, b) => a.ts - b.ts).slice(-600);
  }, [data, liveLogs, channel]);

  useEffect(() => {
    if (autoScroll && boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [merged, autoScroll]);

  const download = async () => {
    const res = await fetch("/api/logs", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `spideybot-${Date.now()}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearAll = async () => {
    clearLogs();
    await fetch("/api/logs", { method: "DELETE" });
    await reload();
  };

  const color = (level: string) =>
    level === "error" ? "text-rose-400" : level === "warn" ? "text-amber-300" : level === "success" ? "text-emerald-400" : "text-slate-300";

  return (
    <Panel
      title="Live Terminal"
      subtitle={connected ? "Streaming over the realtime channel" : "Realtime stream disconnected — showing persisted logs"}
      right={
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn" onClick={clearAll}>🧹 CLEAR</button>
          <button type="button" className={`btn ${autoScroll ? "btn-web" : ""}`} onClick={() => setAutoScroll((s) => !s)}>
            {autoScroll ? "⬇️ AUTO SCROLL ON" : "⬇️ AUTO SCROLL OFF"}
          </button>
          <button type="button" className="btn" onClick={download}>💾 DOWNLOAD LOG</button>
        </div>
      }
    >
      <div className="mb-3 flex flex-wrap gap-2">
        {CHANNELS.map((c) => (
          <button key={c} type="button" className={`btn px-3 py-1.5 text-[11px] ${channel === c ? "btn-web" : ""}`} onClick={() => setChannel(c)}>
            {c}
          </button>
        ))}
      </div>
      <div ref={boxRef} className="terminal h-[60dvh] overflow-y-auto rounded-xl border border-edge bg-black/70 p-3">
        {merged.length === 0 && <p className="text-slate-600">No log entries yet. Start a bot to produce engine output.</p>}
        {merged.map((l, i) => (
          <div key={i} className="flex flex-wrap gap-2">
            <span className="text-slate-600">{new Date(l.ts).toLocaleTimeString()}</span>
            <span className="text-[#37e6ff]">[{l.channel}]</span>
            {l.botId && <span className="text-slate-600">[{l.botId.slice(0, 10)}]</span>}
            <span className={`${color(l.level)} min-w-0 break-words`}>{l.message}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}
