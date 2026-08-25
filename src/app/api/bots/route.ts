import crypto from "node:crypto";
import { db } from "@/db";
import { bots, botSettings } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { withUser, json, errorJson } from "@/server/api";
import { runtimeSnapshot, startBot } from "@/server/bot/manager";
import { logActivity, notify } from "@/server/auth/session";
import { logEvent } from "@/server/events/bus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return withUser(async (user) => {
    const rows = await db.select().from(bots).where(eq(bots.userId, user.id)).orderBy(desc(bots.createdAt));
    return json({
      bots: rows.map((bot) => ({ ...bot, runtime: runtimeSnapshot(bot.id) })),
    });
  });
}

export async function POST(req: Request) {
  return withUser(async (user) => {
    const body = (await req.json().catch(() => ({}))) as {
      name?: string;
      description?: string;
      prefix?: string;
      ownerNumber?: string;
      connectionMode?: string;
      autoReconnect?: boolean;
      features?: Record<string, boolean>;
      deploy?: boolean;
    };
    const name = body.name?.trim();
    if (!name || name.length < 2) return errorJson("Bot name must be at least 2 characters");
    const prefix = (body.prefix?.trim() || ".").slice(0, 3);
    const id = `bot_${crypto.randomBytes(8).toString("hex")}`;

    const inserted = await db
      .insert(bots)
      .values({
        id,
        userId: user.id,
        name,
        description: body.description?.trim() || null,
        prefix,
        ownerNumber: body.ownerNumber?.replace(/[^0-9]/g, "") || null,
        connectionMode: body.connectionMode === "pairing" ? "pairing" : "qr",
        autoReconnect: body.autoReconnect ?? true,
      })
      .returning();

    await db.insert(botSettings).values({
      botId: id,
      downloaderEnabled: body.features?.downloader ?? true,
      gamesEnabled: body.features?.games ?? true,
      autoRead: body.features?.autoRead ?? false,
      autoTyping: body.features?.autoTyping ?? false,
      antiCall: body.features?.antiCall ?? false,
      selfMode: body.features?.selfMode ?? false,
      groupsOnly: body.features?.groupsOnly ?? false,
    });

    await logActivity(user.id, "bot.create", `You created ${name}`);
    await notify(user.id, "bot.created", `${name} created`, "Open the Connection Center to link WhatsApp.");
    await logEvent({ userId: user.id, botId: id, channel: "SYSTEM", message: `Bot ${name} created` }).catch((err) => {
      console.warn("[Bot] event log skipped:", (err as Error).message);
    });

    if (body.deploy) {
      startBot(id).catch(async (err) => {
        await logEvent({
          userId: user.id,
          botId: id,
          channel: "ERROR",
          level: "error",
          message: `Auto-deploy failed: ${(err as Error).message}`,
        });
      });
    }

    return json({ bot: { ...inserted[0], runtime: runtimeSnapshot(id) } }, 201);
  });
}
