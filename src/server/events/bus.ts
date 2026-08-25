import { EventEmitter } from "node:events";
import { db } from "@/db";
import { logs } from "@/db/schema";

export type SpideyEventType =
  | "bot.qr"
  | "bot.pairing"
  | "bot.connection"
  | "bot.status"
  | "bot.message"
  | "bot.command"
  | "bot.log"
  | "bot.stats"
  | "downloader.status"
  | "notification.created"
  | "system.metrics";

export type SpideyEvent = {
  id: string;
  type: SpideyEventType;
  userId: number | null;
  botId?: string | null;
  channel?: string;
  level?: "info" | "warn" | "error" | "success";
  message?: string;
  payload?: unknown;
  ts: number;
};

type Hub = {
  emitter: EventEmitter;
  buffer: SpideyEvent[];
  seq: number;
};

const globalForHub = globalThis as typeof globalThis & { __spideyHub?: Hub };

function hub(): Hub {
  if (!globalForHub.__spideyHub) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(0);
    globalForHub.__spideyHub = { emitter, buffer: [], seq: 0 };
  }
  return globalForHub.__spideyHub;
}

const MAX_BUFFER = 800;

export function publish(event: Omit<SpideyEvent, "id" | "ts">) {
  const h = hub();
  h.seq += 1;
  const full: SpideyEvent = { ...event, id: `${Date.now()}-${h.seq}`, ts: Date.now() };
  h.buffer.push(full);
  if (h.buffer.length > MAX_BUFFER) h.buffer.splice(0, h.buffer.length - MAX_BUFFER);
  h.emitter.emit("event", full);
  return full;
}

export function subscribe(listener: (e: SpideyEvent) => void) {
  const h = hub();
  h.emitter.on("event", listener);
  return () => h.emitter.off("event", listener);
}

export function recentEvents(userId: number, limit = 200) {
  return hub()
    .buffer.filter((e) => e.userId === null || e.userId === userId)
    .slice(-limit);
}

export type LogChannel = "BAILEYS" | "COMMAND" | "DOWNLOADER" | "GROUP" | "SYSTEM" | "ERROR" | "AUTH";

/** Structured log: goes to the DB, the realtime hub and stdout. */
export async function logEvent(opts: {
  userId: number | null;
  botId?: string | null;
  channel: LogChannel;
  level?: "info" | "warn" | "error" | "success";
  message: string;
  meta?: Record<string, unknown>;
  persist?: boolean;
}) {
  const level = opts.level ?? "info";
  publish({
    type: "bot.log",
    userId: opts.userId,
    botId: opts.botId ?? null,
    channel: opts.channel,
    level,
    message: opts.message,
    payload: opts.meta ?? null,
  });
  const stamp = `[${opts.channel}]${opts.botId ? `[${opts.botId.slice(0, 8)}]` : ""}`;
  if (level === "error") console.error(stamp, opts.message);
  else console.log(stamp, opts.message);

  if (opts.persist !== false) {
    try {
      await db.insert(logs).values({
        userId: opts.userId,
        botId: opts.botId ?? null,
        channel: opts.channel,
        level,
        message: opts.message,
        meta: opts.meta ?? null,
      });
    } catch (err) {
      console.error("[SYSTEM] failed to persist log", (err as Error).message);
    }
  }
}
