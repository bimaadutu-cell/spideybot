import { db } from "@/db";
import { bots, commandUsage, downloaderHistory } from "@/db/schema";
import { eq, sql, gte, and } from "drizzle-orm";
import { withUser, json } from "@/server/api";
import { systemMetrics } from "@/server/monitoring";
import { runtimeSnapshot } from "@/server/bot/manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return withUser(async (user) => {
    const metrics = await systemMetrics();
    const botRows = await db.select().from(bots).where(eq(bots.userId, user.id));
    const ids = botRows.map((b) => b.id);
    const since = new Date(Date.now() - 3600_000);

    let commandsLastHour = 0;
    if (ids.length) {
      const rows = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(commandUsage)
        .where(and(sql`${commandUsage.botId} in ${ids}`, gte(commandUsage.createdAt, since)));
      commandsLastHour = rows[0]?.total ?? 0;
    }
    const dlRows = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(downloaderHistory)
      .where(and(eq(downloaderHistory.userId, user.id), gte(downloaderHistory.createdAt, since)));

    return json({
      metrics,
      bots: botRows.map((b) => ({ id: b.id, name: b.name, ...runtimeSnapshot(b.id) })),
      commandsLastHour,
      downloadsLastHour: dlRows[0]?.total ?? 0,
    });
  });
}
