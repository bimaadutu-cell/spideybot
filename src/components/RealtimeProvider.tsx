"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

export type RealtimeEvent = {
  id?: string;
  type: string;
  userId?: number | null;
  botId?: string | null;
  channel?: string;
  level?: string;
  message?: string;
  payload?: unknown;
  ts: number;
};

export type BotRuntime = {
  id: string;
  status: string;
  qr: { dataUrl: string; expiresAt: number } | null;
  pairing: { code: string; phone: string; expiresAt: number } | null;
  lastError: string | null;
  jid: string | null;
  uptimeMs: number;
  reconnects: number;
  stats: { messages: number; commands: number; downloads: number };
};

export type Metrics = {
  cpu: { usagePercent: number; cores: number; model: string; loadAvg: number[] };
  memory: { usedPercent: number; totalBytes: number; freeBytes: number; processRssBytes: number; heapUsedBytes: number };
  eventLoop: { meanMs: number; p99Ms: number; maxMs: number };
  storage: { totalBytes: number; freeBytes: number; usedPercent: number } | null;
  network: { interfaces: { name: string; address: string }[] };
  hostname: string;
  platform: string;
  nodeVersion: string;
  processUptimeSec: number;
  ts: number;
};

type Ctx = {
  connected: boolean;
  events: RealtimeEvent[];
  logs: RealtimeEvent[];
  runtimes: Record<string, BotRuntime>;
  metrics: Metrics | null;
  notificationsTick: number;
  clearLogs: () => void;
};

const RealtimeContext = createContext<Ctx>({
  connected: false,
  events: [],
  logs: [],
  runtimes: {},
  metrics: null,
  notificationsTick: 0,
  clearLogs: () => {},
});

export function useRealtime() {
  return useContext(RealtimeContext);
}

export default function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<RealtimeEvent[]>([]);
  const [logs, setLogs] = useState<RealtimeEvent[]>([]);
  const [runtimes, setRuntimes] = useState<Record<string, BotRuntime>>({});
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [notificationsTick, setTick] = useState(0);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource("/api/realtime");
    sourceRef.current = es;
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (raw) => {
      try {
        const event = JSON.parse(raw.data) as RealtimeEvent;
        if (event.type === "hello") {
          setConnected(true);
          return;
        }
        if (event.type === "system.metrics") {
          const payload = event.payload as { metrics: Metrics; bots: BotRuntime[] };
          setMetrics(payload.metrics);
          setRuntimes((prev) => {
            const next = { ...prev };
            for (const bot of payload.bots) next[bot.id] = bot;
            return next;
          });
          return;
        }
        if (event.type === "notification.created") setTick((t) => t + 1);
        if (event.type === "bot.qr" && event.botId) {
          const payload = event.payload as { dataUrl: string; expiresAt: number };
          setRuntimes((prev) => ({
            ...prev,
            [event.botId!]: {
              ...(prev[event.botId!] ?? emptyRuntime(event.botId!)),
              status: "waiting_qr",
              qr: payload,
            },
          }));
        }
        if (event.type === "bot.pairing" && event.botId) {
          const payload = event.payload as { code: string; phone: string; expiresAt: number };
          setRuntimes((prev) => ({
            ...prev,
            [event.botId!]: {
              ...(prev[event.botId!] ?? emptyRuntime(event.botId!)),
              status: "pairing",
              pairing: payload,
            },
          }));
        }
        if (event.type === "bot.status" && event.botId) {
          const payload = event.payload as { status: string; jid: string | null; lastError: string | null };
          setRuntimes((prev) => ({
            ...prev,
            [event.botId!]: {
              ...(prev[event.botId!] ?? emptyRuntime(event.botId!)),
              status: payload.status,
              jid: payload.jid,
              lastError: payload.lastError,
              qr: payload.status === "connected" ? null : (prev[event.botId!]?.qr ?? null),
            },
          }));
        }
        setEvents((prev) => [...prev.slice(-400), event]);
        if (event.type === "bot.log" || event.type === "bot.command" || event.type === "downloader.status") {
          setLogs((prev) => [...prev.slice(-600), event]);
        }
      } catch {
        /* ignore malformed frames */
      }
    };
    return () => {
      es.close();
      sourceRef.current = null;
    };
  }, []);

  const clearLogs = useCallback(() => setLogs([]), []);

  const value = useMemo(
    () => ({ connected, events, logs, runtimes, metrics, notificationsTick, clearLogs }),
    [connected, events, logs, runtimes, metrics, notificationsTick, clearLogs],
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

function emptyRuntime(id: string): BotRuntime {
  return {
    id,
    status: "offline",
    qr: null,
    pairing: null,
    lastError: null,
    jid: null,
    uptimeMs: 0,
    reconnects: 0,
    stats: { messages: 0, commands: 0, downloads: 0 },
  };
}
