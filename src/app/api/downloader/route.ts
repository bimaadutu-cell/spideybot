import { db } from "@/db";
import { downloaderHistory } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { withUser, json, errorJson, rateLimit } from "@/server/api";
import { runDownload } from "@/server/downloader/engine";
import { logActivity } from "@/server/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET() {
  return withUser(async (user) => {
    const history = await db
      .select()
      .from(downloaderHistory)
      .where(eq(downloaderHistory.userId, user.id))
      .orderBy(desc(downloaderHistory.createdAt))
      .limit(40);
    return json({ history });
  });
}

export async function POST(req: Request) {
  return withUser(async (user) => {
    const body = (await req.json().catch(() => ({}))) as { url?: string };
    if (!body.url) return errorJson("url is required");
    if (!rateLimit(`download:${user.id}`, 12)) return errorJson("Rate limit: max 12 downloads per minute", 429);
    const result = await runDownload({ url: body.url, userId: user.id });
    await logActivity(user.id, "downloader.run", `You requested a download: ${body.url.slice(0, 120)}`);
    if (!result.ok) return json({ ok: false, error: result.error, attempts: result.attempts }, 502);
    return json(result);
  });
}
