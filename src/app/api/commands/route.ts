import { db } from "@/db";
import { commandSettings, commandUsage, bots } from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { withUser, json, errorJson } from "@/server/api";
import { describeCommands, setCommandEnabled, syncRegistryToDatabase } from "@/server/commands/registry";
import { assertBotOwnership } from "@/server/bot/manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withUser(async (user) => {
    const url = new URL(req.url);
    const botId = url.searchParams.get("botId");
    const registry = await syncRegistryToDatabase();

    let disabled: string[] = [];
    let usage: { commandName: string; total: number }[] = [];
    if (botId) {
      await assertBotOwnership(botId, user.id);
      const settings = await db.select().from(commandSettings).where(eq(commandSettings.botId, botId));
      disabled = settings.filter((s) => !s.enabled).map((s) => s.commandName);
      usage = await db
        .select({ commandName: commandUsage.commandName, total: sql<number>`count(*)::int` })
        .from(commandUsage)
        .where(eq(commandUsage.botId, botId))
        .groupBy(commandUsage.commandName);
    }

    const botRows = await db.select({ id: bots.id, name: bots.name }).from(bots).where(eq(bots.userId, user.id));
    const recent = botId
      ? await db
          .select()
          .from(commandUsage)
          .where(eq(commandUsage.botId, botId))
          .orderBy(desc(commandUsage.createdAt))
          .limit(25)
      : [];

    return json({
      commands: registry.map((c) => ({
        ...c,
        enabled: !disabled.includes(c.name),
        uses: usage.find((u) => u.commandName === c.name)?.total ?? 0,
      })),
      bots: botRows,
      recent,
    });
  });
}

export async function POST(req: Request) {
  return withUser(async (user) => {
    const body = (await req.json().catch(() => ({}))) as { botId?: string; command?: string; enabled?: boolean };
    if (!body.botId || !body.command) return errorJson("botId and command are required");
    await assertBotOwnership(body.botId, user.id);
    const known = (await describeCommands()).some((c) => c.name === body.command);
    if (!known) return errorJson("Unknown command", 404);
    await setCommandEnabled(body.botId, body.command, body.enabled ?? true);
    const settings = await db
      .select()
      .from(commandSettings)
      .where(and(eq(commandSettings.botId, body.botId), eq(commandSettings.commandName, body.command)))
      .limit(1);
    return json({ ok: true, setting: settings[0] });
  });
}
