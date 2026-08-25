import { NextResponse } from "next/server";
import { getSessionUser, type SessionUser } from "@/server/auth/session";

export function json(data: unknown, init?: number | ResponseInit) {
  return NextResponse.json(data as object, typeof init === "number" ? { status: init } : init);
}

export function errorJson(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

function friendlyDatabaseError(err: unknown) {
  const value = err as { message?: string; code?: string; cause?: { code?: string; message?: string } };
  const code = value.code ?? value.cause?.code;
  if (code === "42P01") return "Tabel database belum ada. Jalankan npm run db:push di Railway lalu redeploy.";
  if (code === "42703") return "Schema database belum sinkron dengan aplikasi. Jalankan npm run db:push di Railway lalu redeploy.";
  if (code === "23503") return "Data terkait belum tersedia di database. Jalankan migrasi Railway dan coba lagi.";
  if (code === "23505") return "Data sudah ada. Muat ulang halaman lalu coba lagi.";
  if (value.message?.includes("Failed query")) return "Database Railway gagal memproses permintaan. Pastikan DATABASE_URL benar dan jalankan npm run db:push.";
  return value.message || "Internal error";
}

export async function withUser<T>(fn: (user: SessionUser) => Promise<T>) {
  try {
    const user = await getSessionUser();
    if (!user) return errorJson("Unauthorized", 401);
    const result = await fn(user);
    if (result instanceof Response) return result;
    return NextResponse.json(result as object);
  } catch (err) {
    const message = friendlyDatabaseError(err);
    console.error("[API]", (err as Error).message || err);
    return errorJson(message, message === "Bot not found" ? 404 : 500);
  }
}

const buckets = new Map<string, { count: number; resetAt: number }>();
export function rateLimit(key: string, limit: number, windowMs = 60_000) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= limit;
}

export function clientIp(req: Request) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null
  );
}
