import { NextResponse } from "next/server";
import { createMathChallenge } from "@/server/auth/math";
import { rateLimit } from "@/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`math-challenge:${ip}`, 30, 60_000)) {
    return NextResponse.json({ error: "Terlalu banyak permintaan. Coba lagi sebentar." }, { status: 429 });
  }
  return NextResponse.json(createMathChallenge(), { headers: { "Cache-Control": "no-store" } });
}
