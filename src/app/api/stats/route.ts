import { db } from "@/db";
import { bots, commandUsage, downloaderHistory, groups, notifications } from "@/db/schema";
import { eq, sql, and, gte } from "drizzle-orm";
import { withUser, json } from "@/server/api";
import { runtimeSnapshot } from "@/server/bot/manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return withUser(async (user) => {
    const botRows = await db.select().from(bots).where(eq(bots.userId, user.id));
    const ids = botRows.map((b) => b.id);
    const snapshots = botRows.map((b) => ({ id: b.id, name: b.name, ...runtimeSnapshot(b.id) }));
    const online = snapshots.filter((s) => s.status === "connected").length;
    const messages = snapshots.reduce((acc, s) => acc + s.stats.messages, 0);

    let commandCount = 0;
    let groupCount = 0;
    if (ids.length) {
      const cmd = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(commandUsage)
        .where(sql`${commandUsage.botId} in ${ids}`);
      commandCount = cmd[0]?.total ?? 0;
      const grp = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(groups)
        .where(sql`${groups.botId} in ${ids}`);
      groupCount = grp[0]?.total ?? 0;
    }

    const dl = await db
      .select({
        total: sql<number>`count(*)::int`,
        ok: sql<number>`count(*) filter (where status = 'success')::int`,
      })
      .from(downloaderHistory)
      .where(eq(downloaderHistory.userId, user.id));

    const unread = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, user.id), eq(notifications.read, false)));

    const last24 = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(downloaderHistory)
      .where(
        and(eq(downloaderHistory.userId, user.id), gte(downloaderHistory.createdAt, new Date(Date.now() - 86400_000))),
      );

    return json({
      bots: botRows.length,
      onlineBots: online,
      messages,
      commands: commandCount,
      groups: groupCount,
      downloads: dl[0]?.total ?? 0,
      downloadsSucceeded: dl[0]?.ok ?? 0,
      downloadsLast24h: last24[0]?.total ?? 0,
      unreadNotifications: unread[0]?.total ?? 0,
      botStates: snapshots,
    });
  });
}
