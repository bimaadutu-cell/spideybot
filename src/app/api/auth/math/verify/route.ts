import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/server/api";
import { consumeMathChallenge } from "@/server/auth/math";
import { createMathUser, getSessionUser, logActivity } from "@/server/auth/session";
import { appUrlFromRequest } from "@/server/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ip = clientIp(req) ?? "unknown";
  if (!rateLimit(`math-verify:${ip}`, 12, 60_000)) {
    return NextResponse.json({ error: "Terlalu banyak percobaan. Coba lagi sebentar." }, { status: 429 });
  }

  const current = await getSessionUser();
  if (current) return NextResponse.json({ ok: true, redirect: "/dashboard" });

  const body = (await req.json().catch(() => ({}))) as { challengeId?: string; answer?: string };
  if (!body.challengeId || body.answer === undefined) {
    return NextResponse.json({ error: "Challenge dan jawaban wajib diisi." }, { status: 400 });
  }

  const result = consumeMathChallenge(body.challengeId, body.answer);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason === "expired" ? "Soal sudah kedaluwarsa." : "Jawaban matematika salah." }, { status: 401 });
  }

  const baseUrl = appUrlFromRequest(req);
  await createMathUser({
    userAgent: req.headers.get("user-agent"),
    ip,
    secure: baseUrl.startsWith("https://"),
  });
  const user = await getSessionUser();
  if (user) await logActivity(user.id, "auth.math_login", "Signed in with a one-time random math challenge", ip);
  return NextResponse.json({ ok: true, redirect: "/dashboard" });
}
