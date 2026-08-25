"use client";

import { useEffect, useState, useCallback } from "react";

export function StatusChip({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string; dot: string }> = {
    connected: { label: "Connected", color: "text-cyan-100 border-cyan-300/40 bg-cyan-300/10", dot: "bg-cyan-300" },
    connecting: { label: "Connecting", color: "text-sky-300 border-sky-500/40 bg-sky-500/10", dot: "bg-sky-400" },
    waiting_qr: { label: "Waiting QR", color: "text-white border-white/30 bg-white/10", dot: "bg-white" },
    pairing: { label: "Pairing", color: "text-cyan-100 border-cyan-300/40 bg-cyan-300/10", dot: "bg-cyan-300" },
    reconnecting: { label: "Reconnecting", color: "text-orange-300 border-orange-500/40 bg-orange-500/10", dot: "bg-orange-400" },
    disconnected: { label: "Disconnected", color: "text-slate-300 border-slate-500/40 bg-slate-500/10", dot: "bg-slate-300" },
    offline: { label: "Offline", color: "text-slate-400 border-slate-600/40 bg-slate-500/10", dot: "bg-slate-500" },
  };
  const s = map[status] ?? map.offline;
  return (
    <span className={`chip ${s.color}`}>
      <span className={`h-2 w-2 rounded-full ${s.dot} ${status === "connected" ? "live-dot" : ""}`} />
      {s.label}
    </span>
  );
}

export function Panel({
  title,
  subtitle,
  right,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel p-4 sm:p-5 ${className}`}>
      {(title || right) && (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-slate-200">{title}</h2>}
            {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
          </div>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

export function StatCard({
  label,
  value,
  hint,
  accent = "web",
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: "web" | "red" | "neon" | "green";
}) {
  const accents: Record<string, string> = {
    web: "from-[#2f6bff]/25 to-transparent",
    red: "from-[#22d3ee]/25 to-transparent",
    neon: "from-[#67e8f9]/25 to-transparent",
    green: "from-emerald-500/25 to-transparent",
  };
  return (
    <div className="panel relative overflow-hidden p-4">
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${accents[accent]}`} />
      <div className="relative">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">{label}</p>
        <p className="mt-2 text-2xl font-black text-white sm:text-3xl">{value}</p>
        {hint && <p className="mt-1 text-[11px] text-slate-500">{hint}</p>}
      </div>
    </div>
  );
}

export function Empty({ icon = "🕸️", title, hint }: { icon?: string; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-edge/70 px-4 py-10 text-center">
      <div className="text-4xl">{icon}</div>
      <p className="mt-3 text-sm font-semibold text-slate-300">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`btn w-full justify-between ${checked ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-100" : ""}`}
    >
      <span>{label}</span>
      <span
        className={`relative h-5 w-9 shrink-0 rounded-full transition ${checked ? "bg-cyan-300/80" : "bg-slate-600"}`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${checked ? "left-4.5" : "left-0.5"}`}
          style={{ left: checked ? "1.15rem" : "0.125rem" }}
        />
      </span>
    </button>
  );
}

export function useApi<T>(url: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(url));
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!url) return;
    setLoading(true);
    try {
      const res = await fetch(url, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`);
      setData(json as T);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ...deps]);

  return { data, loading, error, reload, setData };
}

export async function apiSend<T = unknown>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`);
  return json as T;
}

export function bytes(n: number | null | undefined) {
  if (!n && n !== 0) return "-";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = n;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

export function timeAgo(date: string | number | Date | null | undefined) {
  if (!date) return "-";
  const ts = new Date(date).getTime();
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
