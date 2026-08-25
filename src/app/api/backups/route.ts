import crypto from "node:crypto";
import { db } from "@/db";
import { backups, bots, botSettings, commandSettings, groupSettings } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { withUser, json, errorJson } from "@/server/api";
import { logActivity } from "@/server/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BackupPayload = {
  version: 1;
  createdAt: string;
  bots: unknown[];
  botSettings: unknown[];
  commandSettings: unknown[];
  groupSettings: unknown[];
};

export async function GET() {
  return withUser(async (user) => {
    const rows = await db
      .select({
        id: backups.id,
        label: backups.label,
        sizeBytes: backups.sizeBytes,
        createdAt: backups.createdAt,
      })
      .from(backups)
      .where(eq(backups.userId, user.id))
      .orderBy(desc(backups.createdAt));
    return json({ backups: rows });
  });
}

export async function POST(req: Request) {
  return withUser(async (user) => {
    const body = (await req.json().catch(() => ({}))) as { label?: string };
    const botRows = await db.select().from(bots).where(eq(bots.userId, user.id));
    const ids = botRows.map((b) => b.id);
    const settings = ids.length
      ? await db.select().from(botSettings).where(sql`${botSettings.botId} in ${ids}`)
      : [];
    const cmdSettings = ids.length
      ? await db.select().from(commandSettings).where(sql`${commandSettings.botId} in ${ids}`)
      : [];
    const grpSettings = ids.length
      ? await db.select().from(groupSettings).where(sql`${groupSettings.botId} in ${ids}`)
      : [];

    const payload: BackupPayload = {
      version: 1,
      createdAt: new Date().toISOString(),
      bots: botRows,
      botSettings: settings,
      commandSettings: cmdSettings,
      groupSettings: grpSettings,
    };
    const size = Buffer.byteLength(JSON.stringify(payload));
    const id = `bkp_${crypto.randomBytes(6).toString("hex")}`;
    await db.insert(backups).values({
      id,
      userId: user.id,
      label: body.label?.trim() || `Backup ${new Date().toISOString().slice(0, 19).replace("T", " ")}`,
      sizeBytes: size,
      payload,
    });
    await logActivity(user.id, "backup.create", `You created a backup (${botRows.length} bots)`);
    return json({ ok: true, id, sizeBytes: size }, 201);
  });
}

export async function PUT(req: Request) {
  // Restore
  return withUser(async (user) => {
    const body = (await req.json().catch(() => ({}))) as { id?: string };
    if (!body.id) return errorJson("Backup id required");
    const rows = await db.select().from(backups).where(eq(backups.id, body.id)).limit(1);
    const backup = rows[0];
    if (!backup || backup.userId !== user.id) return errorJson("Backup not found", 404);
    const payload = backup.payload as BackupPayload;

    let restored = 0;
    for (const raw of payload.bots as Record<string, unknown>[]) {
      await db
        .insert(bots)
        .values({
          id: String(raw.id),
          userId: user.id,
          name: String(raw.name),
          description: (raw.description as string) ?? null,
          prefix: String(raw.prefix ?? "."),
          ownerNumber: (raw.ownerNumber as string) ?? null,
          connectionMode: String(raw.connectionMode ?? "qr"),
          autoReconnect: Boolean(raw.autoReconnect ?? true),
          status: "offline",
        })
        .onConflictDoUpdate({
          target: bots.id,
          set: {
            name: String(raw.name),
            description: (raw.description as string) ?? null,
            prefix: String(raw.prefix ?? "."),
            ownerNumber: (raw.ownerNumber as string) ?? null,
            updatedAt: new Date(),
          },
        });
      restored += 1;
    }
    for (const raw of (payload.commandSettings ?? []) as Record<string, unknown>[]) {
      await db
        .insert(commandSettings)
        .values({
          botId: String(raw.botId),
          commandName: String(raw.commandName),
          enabled: Boolean(raw.enabled),
        })
        .onConflictDoUpdate({
          target: [commandSettings.botId, commandSettings.commandName],
          set: { enabled: Boolean(raw.enabled), updatedAt: new Date() },
        });
    }
    await logActivity(user.id, "backup.restore", `You restored backup ${backup.label}`);
    return json({ ok: true, restoredBots: restored });
  });
}

export async function DELETE(req: Request) {
  return withUser(async (user) => {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return errorJson("id query param required");
    const rows = await db.select().from(backups).where(eq(backups.id, id)).limit(1);
    if (!rows[0] || rows[0].userId !== user.id) return errorJson("Backup not found", 404);
    await db.delete(backups).where(eq(backups.id, id));
    return json({ ok: true });
  });
}
