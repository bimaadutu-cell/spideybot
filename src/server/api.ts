import { NextResponse } from "next/server";
import { getSessionUser, type SessionUser } from "@/server/auth/session";

export function json(data: unknown, init?: number | ResponseInit) {
  return NextResponse.json(data as object, typeof init === "number" ? { status: init } : init);
}

export function errorJson(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export async function withUser<T>(fn: (user: SessionUser) => Promise<T>) {
  const user = await getSessionUser();
  if (!user) return errorJson("Unauthorized", 401);
  try {
    const result = await fn(user);
    if (result instanceof Response) return result;
    return NextResponse.json(result as object);
  } catch (err) {
    const message = (err as Error).message || "Internal error";
    console.error("[API]", message);
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
