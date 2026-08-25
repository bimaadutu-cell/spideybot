import { getSessionUser } from "@/server/auth/session";
import { subscribe, recentEvents, type SpideyEvent } from "@/server/events/bus";
import { runtimeSnapshot } from "@/server/bot/manager";
import { db } from "@/db";
import { bots } from "@/db/schema";
import { eq } from "drizzle-orm";
import { systemMetrics } from "@/server/monitoring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Realtime stream (Server-Sent Events) — one authenticated stream per user.
 * Events: bot.qr, bot.pairing, bot.connection, bot.status, bot.message,
 * bot.command, bot.log, bot.stats, downloader.status, notification.created,
 * system.metrics.
 */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: NodeJS.Timeout | null = null;
  let metricsTimer: NodeJS.Timeout | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: SpideyEvent | { type: string; [k: string]: unknown }) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          /* stream closed */
        }
      };

      send({ type: "hello", userId: user.id, ts: Date.now() });
      for (const event of recentEvents(user.id, 100)) send(event);

      unsubscribe = subscribe((event) => {
        if (event.userId !== null && event.userId !== user.id) return;
        send(event);
      });

      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`));
        } catch {
          /* ignore */
        }
      }, 20_000);

      metricsTimer = setInterval(async () => {
        try {
          const metrics = await systemMetrics();
          const rows = await db.select({ id: bots.id }).from(bots).where(eq(bots.userId, user.id));
          send({
            type: "system.metrics",
            userId: user.id,
            ts: Date.now(),
            payload: {
              metrics,
              bots: rows.map((b) => ({ id: b.id, ...runtimeSnapshot(b.id) })),
            },
          });
        } catch {
          /* ignore */
        }
      }, 4000);

      req.signal.addEventListener("abort", () => {
        unsubscribe?.();
        if (heartbeat) clearInterval(heartbeat);
        if (metricsTimer) clearInterval(metricsTimer);
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      });
    },
    cancel() {
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
      if (metricsTimer) clearInterval(metricsTimer);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
