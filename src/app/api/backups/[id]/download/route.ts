import { db } from "@/db";
import { backups } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser } from "@/server/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const rows = await db.select().from(backups).where(eq(backups.id, id)).limit(1);
  const backup = rows[0];
  if (!backup || backup.userId !== user.id) return new Response("Not found", { status: 404 });
  return new Response(JSON.stringify(backup.payload, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="${backup.id}.json"`,
    },
  });
}
