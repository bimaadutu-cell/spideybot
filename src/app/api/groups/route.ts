import { db } from "@/db";
import { groups, groupSettings, warnings, bots } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { withUser, json, errorJson } from "@/server/api";
import { assertBotOwnership, getRuntime, syncGroups } from "@/server/bot/manager";
import { getGroupSettings, toggleGroupSetting } from "@/server/commands/groups";
import { logEvent } from "@/server/events/bus";
import { logActivity } from "@/server/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withUser(async (user) => {
    const url = new URL(req.url);
    const botId = url.searchParams.get("botId");
    const botRows = await db.select({ id: bots.id, name: bots.name }).from(bots).where(eq(bots.userId, user.id));
    if (!botId) return json({ bots: botRows, groups: [] });

    await assertBotOwnership(botId, user.id);
    if (url.searchParams.get("sync") === "1") {
      const rt = getRuntime(botId);
      if (rt?.status === "connected") await syncGroups(rt);
    }
    const rows = await db.select().from(groups).where(eq(groups.botId, botId));
    const settings = await db.select().from(groupSettings).where(eq(groupSettings.botId, botId));
    const warns = await db.select().from(warnings).where(eq(warnings.botId, botId));
    return json({
      bots: botRows,
      connected: getRuntime(botId)?.status === "connected",
      groups: rows.map((g) => ({
        ...g,
        settings: settings.find((s) => s.jid === g.jid) ?? null,
        warnings: warns.filter((w) => w.jid === g.jid).length,
      })),
    });
  });
}

export async function POST(req: Request) {
  return withUser(async (user) => {
    const body = (await req.json().catch(() => ({}))) as {
      botId?: string;
      jid?: string;
      key?: "antilink" | "antidelete" | "antitag" | "welcome" | "warningEnabled" | "muted";
      value?: boolean;
      welcomeText?: string;
      warnLimit?: number;
    };
    if (!body.botId || !body.jid) return errorJson("botId and jid are required");
    await assertBotOwnership(body.botId, user.id);
    await getGroupSettings(body.botId, body.jid);

    if (body.key) {
      const updated = await toggleGroupSetting(body.botId, body.jid, body.key, Boolean(body.value));
      // Apply real WhatsApp side-effects for mute
      if (body.key === "muted") {
        const rt = getRuntime(body.botId);
        if (rt?.sock && rt.status === "connected") {
          await rt.sock
            .groupSettingUpdate(body.jid, body.value ? "announcement" : "not_announcement")
            .catch(() => undefined);
        }
      }
      await logEvent({
        userId: user.id,
        botId: body.botId,
        channel: "GROUP",
        message: `${body.key} → ${body.value ? "ON" : "OFF"} for ${body.jid}`,
      });
      await logActivity(user.id, "group.setting", `You turned ${body.key} ${body.value ? "on" : "off"}`);
      return json({ ok: true, settings: updated });
    }

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof body.welcomeText === "string") patch.welcomeText = body.welcomeText;
    if (typeof body.warnLimit === "number") patch.warnLimit = Math.max(1, Math.min(10, body.warnLimit));
    await db
      .update(groupSettings)
      .set(patch)
      .where(and(eq(groupSettings.botId, body.botId), eq(groupSettings.jid, body.jid)));
    const settings = await getGroupSettings(body.botId, body.jid);
    return json({ ok: true, settings });
  });
}
