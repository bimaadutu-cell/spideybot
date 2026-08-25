import { db } from "@/db";
import { notifications } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { withUser, json } from "@/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return withUser(async (user) => {
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, user.id))
      .orderBy(desc(notifications.createdAt))
      .limit(60);
    return json({ notifications: rows, unread: rows.filter((r) => !r.read).length });
  });
}

export async function POST(req: Request) {
  return withUser(async (user) => {
    const body = (await req.json().catch(() => ({}))) as { id?: number; all?: boolean };
    if (body.all) {
      await db.update(notifications).set({ read: true }).where(eq(notifications.userId, user.id));
    } else if (body.id) {
      await db
        .update(notifications)
        .set({ read: true })
        .where(and(eq(notifications.userId, user.id), eq(notifications.id, body.id)));
    }
    return json({ ok: true });
  });
}

export async function DELETE() {
  return withUser(async (user) => {
    await db.delete(notifications).where(eq(notifications.userId, user.id));
    return json({ ok: true });
  });
}
