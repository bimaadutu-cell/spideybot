import { db } from "@/db";
import { logs } from "@/db/schema";
import { desc, eq, and, sql } from "drizzle-orm";
import { withUser, json } from "@/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withUser(async (user) => {
    const url = new URL(req.url);
    const channel = url.searchParams.get("channel");
    const botId = url.searchParams.get("botId");
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 200), 500);
    const filters = [eq(logs.userId, user.id)];
    if (channel && channel !== "ALL") filters.push(eq(logs.channel, channel));
    if (botId) filters.push(eq(logs.botId, botId));
    const rows = await db
      .select()
      .from(logs)
      .where(and(...filters))
      .orderBy(desc(logs.createdAt))
      .limit(limit);
    return json({ logs: rows.reverse() });
  });
}

export async function DELETE() {
  return withUser(async (user) => {
    await db.delete(logs).where(eq(logs.userId, user.id));
    return json({ ok: true });
  });
}

export async function POST(req: Request) {
  // Export as a downloadable text log
  return withUser(async (user) => {
    const body = (await req.json().catch(() => ({}))) as { botId?: string };
    const filters = [eq(logs.userId, user.id)];
    if (body.botId) filters.push(eq(logs.botId, body.botId));
    const rows = await db
      .select()
      .from(logs)
      .where(and(...filters))
      .orderBy(sql`${logs.createdAt} asc`)
      .limit(5000);
    const text = rows
      .map((r) => `${r.createdAt.toISOString()} [${r.channel}] [${r.level}] ${r.botId ?? "-"} ${r.message}`)
      .join("\n");
    return new Response(text, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "content-disposition": `attachment; filename="spideybot-${Date.now()}.log"`,
      },
    });
  });
}
