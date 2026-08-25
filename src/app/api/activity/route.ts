import { db } from "@/db";
import { activityLogs } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { withUser, json } from "@/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return withUser(async (user) => {
    const rows = await db
      .select()
      .from(activityLogs)
      .where(eq(activityLogs.userId, user.id))
      .orderBy(desc(activityLogs.createdAt))
      .limit(100);
    return json({ activity: rows });
  });
}
