import { db } from "@/db";
import { bots, botSettings, commandUsage, groups } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { withUser, json } from "@/server/api";
import { assertBotOwnership, runtimeSnapshot, deleteBotRuntime } from "@/server/bot/manager";
import { logActivity } from "@/server/auth/session";
import { logEvent } from "@/server/events/bus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withUser(async (user) => {
    const bot = await assertBotOwnership(id, user.id);
    const settings = await db.select().from(botSettings).where(eq(botSettings.botId, id)).limit(1);
    const usage = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(commandUsage)
      .where(eq(commandUsage.botId, id));
    const groupRows = await db.select().from(groups).where(eq(groups.botId, id));
    return json({
      bot,
      settings: settings[0] ?? null,
      runtime: runtimeSnapshot(id),
      stats: { commands: usage[0]?.total ?? 0, groups: groupRows.length },
    });
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withUser(async (user) => {
    await assertBotOwnership(id, user.id);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const botPatch: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of ["name", "description", "prefix", "ownerNumber", "connectionMode", "autoReconnect"]) {
      if (key in body) botPatch[key] = body[key];
    }
    if (typeof botPatch.ownerNumber === "string") {
      botPatch.ownerNumber = (botPatch.ownerNumber as string).replace(/[^0-9]/g, "") || null;
    }
    if (Object.keys(botPatch).length > 1) {
      await db.update(bots).set(botPatch).where(and(eq(bots.id, id), eq(bots.userId, user.id)));
    }

    const settingsPatch: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of [
      "selfMode",
      "groupsOnly",
      "autoRead",
      "autoTyping",
      "antiCall",
      "downloaderEnabled",
      "gamesEnabled",
      "rateLimitPerMinute",
    ]) {
      if (key in body) settingsPatch[key] = body[key];
    }
    if (Object.keys(settingsPatch).length > 1) {
      await db
        .insert(botSettings)
        .values({ botId: id, ...settingsPatch })
        .onConflictDoUpdate({ target: botSettings.botId, set: settingsPatch });
    }

    await logEvent({ userId: user.id, botId: id, channel: "SYSTEM", message: "Bot configuration updated" });
    const updated = await db.select().from(bots).where(eq(bots.id, id)).limit(1);
    const settings = await db.select().from(botSettings).where(eq(botSettings.botId, id)).limit(1);
    return json({ bot: updated[0], settings: settings[0] ?? null });
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withUser(async (user) => {
    const bot = await assertBotOwnership(id, user.id);
    await deleteBotRuntime(id);
    await db.delete(bots).where(and(eq(bots.id, id), eq(bots.userId, user.id)));
    await logActivity(user.id, "bot.delete", `You deleted ${bot.name}`);
    await logEvent({ userId: user.id, channel: "SYSTEM", message: `Bot ${bot.name} deleted` });
    return json({ ok: true });
  });
}
