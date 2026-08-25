import { NextResponse } from "next/server";
import { destroySession, getSessionUser, logActivity } from "@/server/auth/session";
import { clientIp } from "@/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (user) await logActivity(user.id, "auth.logout", "You signed out", clientIp(req));
  await destroySession();
  return NextResponse.json({ ok: true });
}
