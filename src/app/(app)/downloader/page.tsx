"use client";

import { useState } from "react";
import { useRealtime } from "@/components/RealtimeProvider";
import { Panel, Empty, useApi, apiSend, timeAgo } from "@/components/ui";

type Provider = {
  key: string;
  label: string;
  platform: string;
  status: string;
  lastResponseMs: number | null;
  lastCheckAt: string | null;
  successCount: number;
  failureCount: number;
  successRate: number | null;
  lastError: string | null;
  metadataOnly: boolean;
};

type History = {
  id: number;
  platform: string;
  url: string;
  provider: string | null;
  status: string;
  title: string | null;
  mediaUrl: string | null;
  durationMs: number | null;
  error: string | null;
  createdAt: string;
};

type Result = {
  ok: boolean;
  platform: string;
  durationMs: number;
  attempts: { provider: string; ok: boolean; ms: number; error?: string }[];
  result?: {
    provider: string;
    title?: string;
    author?: string;
    thumbnail?: string;
    media: { type: string; url: string; quality?: string }[];
  };
  error?: string;
};

export default function DownloaderPage() {
  const [url, setUrl] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const providers = useApi<{ providers: Provider[] }>("/api/downloader/providers");
  const history = useApi<{ history: History[] }>("/api/downloader");
  const { events } = useRealtime();

  const statusEvents = events.filter((e) => e.type === "downloader.status").slice(-6).reverse();

  const run = async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/downloader", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const json = (await res.json()) as Result & { error?: string };
      if (!res.ok || json.ok === false) {
        setError(json.error ?? "Download failed");
        setResult(json);
      } else {
        setResult(json);
      }
      await history.reload();
      await providers.reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunning(false);
    }
  };

  const checkHealth = async () => {
    await apiSend("/api/downloader/providers", "POST");
    await providers.reload();
  };

  const dot = (status: string) =>
    status === "online" ? "🟢" : status === "degraded" ? "🟡" : status === "unconfigured" ? "⚪" : "🔴";

  return (
    <div className="space-y-4">
      <Panel title="Spidey Downloader Engine" subtitle="URL → platform detector → provider router → fallback chain → media">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            className="input"
            placeholder="https://www.tiktok.com/@user/video/... · instagram.com/reel/... · youtube.com/watch?v=..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button type="button" className="btn btn-primary sm:w-auto" disabled={running || !url} onClick={run}>
            {running ? "Resolving…" : "📥 DOWNLOAD"}
          </button>
        </div>

        {statusEvents.length > 0 && (
          <div className="terminal mt-3 space-y-1 rounded-xl bg-black/50 p-3 text-[11px]">
            {statusEvents.map((e, i) => (
              <div key={e.id ?? i} className="text-slate-400">
                <span className="text-slate-600">{new Date(e.ts).toLocaleTimeString()} </span>
                {e.message}
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="mt-3 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200">
            <p className="font-semibold">Download failed — no fake media is ever returned.</p>
            <p className="mt-1 break-words">{error}</p>
          </div>
        )}

        {result?.result && (
          <div className="mt-4 rounded-xl border border-edge bg-black/40 p-4">
            <div className="flex flex-wrap items-start gap-4">
              {result.result.thumbnail && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={result.result.thumbnail} alt="" className="h-28 w-28 rounded-lg object-cover" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-white">{result.result.title ?? "Untitled media"}</p>
                <p className="text-xs text-slate-500">
                  {result.result.author ? `${result.result.author} · ` : ""}provider {result.result.provider} ·{" "}
                  {result.durationMs} ms
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {result.result.media.map((m, i) => (
                    <a key={i} href={m.url} target="_blank" rel="noreferrer" className="btn btn-web">
                      {m.type === "video" ? "🎬" : m.type === "audio" ? "🎵" : "🖼"} {m.quality ?? m.type}
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {result?.attempts?.length ? (
          <div className="mt-3 text-[11px] text-slate-500">
            Fallback chain:{" "}
            {result.attempts.map((a, i) => (
              <span key={i}>
                {i > 0 && " → "}
                <span className={a.ok ? "text-emerald-400" : "text-rose-400"}>
                  {a.provider} ({a.ms}ms{a.error ? `: ${a.error.slice(0, 60)}` : ""})
                </span>
              </span>
            ))}
          </div>
        ) : null}
      </Panel>

      <Panel
        title="Provider health"
        subtitle="Live checks against the real provider endpoints"
        right={<button type="button" className="btn" onClick={checkHealth}>❤️ RUN HEALTH CHECK</button>}
      >
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {providers.data?.providers.map((p) => (
            <div key={p.key} className="rounded-xl border border-edge bg-black/30 p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-white">
                  {dot(p.status)} {p.label}
                </p>
                <span className="chip">{p.platform}</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-slate-400">
                <span>Response</span><span className="text-right">{p.lastResponseMs ?? "-"} ms</span>
                <span>Success rate</span><span className="text-right">{p.successRate === null ? "-" : `${p.successRate}%`}</span>
                <span>Checked</span><span className="text-right">{timeAgo(p.lastCheckAt)}</span>
                <span>Status</span><span className="text-right uppercase">{p.status}</span>
              </div>
              {p.metadataOnly && <p className="mt-1 text-[10px] text-slate-500">metadata only</p>}
              {p.lastError && <p className="mt-1 break-words text-[10px] text-amber-300/80">{p.lastError.slice(0, 120)}</p>}
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Download history" subtitle="Persisted in downloader_history">
        {!history.data?.history.length ? (
          <Empty icon="📥" title="No downloads yet" />
        ) : (
          <div className="space-y-2">
            {history.data.history.map((h) => (
              <div key={h.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-edge bg-black/30 p-3 text-xs">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-slate-200">{h.title ?? h.url}</p>
                  <p className="truncate text-[11px] text-slate-500">
                    {h.platform} · {h.provider ?? "no provider"} · {h.durationMs ?? 0}ms · {timeAgo(h.createdAt)}
                  </p>
                  {h.error && <p className="truncate text-[11px] text-rose-400">{h.error}</p>}
                </div>
                <div className="flex gap-2">
                  <span className={`chip ${h.status === "success" ? "border-emerald-500/40 text-emerald-300" : "border-rose-500/40 text-rose-300"}`}>
                    {h.status}
                  </span>
                  {h.mediaUrl && (
                    <a href={h.mediaUrl} target="_blank" rel="noreferrer" className="btn px-2 py-1 text-[11px]">OPEN</a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
