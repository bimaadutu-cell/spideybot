import crypto from "node:crypto";
import { cookies } from "next/headers";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { users, accounts, sessions, activityLogs, notifications } from "@/db/schema";
import { sessionSecret } from "@/server/config";

export const SESSION_COOKIE = "spidey_session";
export const STATE_COOKIE = "spidey_oauth_state";
const SESSION_TTL_DAYS = 14;

export type SessionUser = {
  id: number;
  name: string;
  username: string;
  email: string | null;
  avatar: string | null;
  role: string;
  createdAt: Date;
  lastLoginAt: Date | null;
};

/* --------------------------- signing helpers --------------------------- */

export function sign(value: string) {
  const mac = crypto.createHmac("sha256", sessionSecret()).update(value).digest("base64url");
  return `${value}.${mac}`;
}

export function unsign(signed: string): string | null {
  const idx = signed.lastIndexOf(".");
  if (idx < 0) return null;
  const value = signed.slice(0, idx);
  const mac = signed.slice(idx + 1);
  const expected = crypto.createHmac("sha256", sessionSecret()).update(value).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return value;
}

export function randomId(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

/* ------------------------------ oauth state ---------------------------- */

export type OAuthStatePayload = {
  provider: "google" | "github";
  state: string;
  verifier: string;
  redirect: string;
  createdAt: number;
};

export async function setOAuthState(payload: OAuthStatePayload, secure: boolean) {
  const raw = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const jar = await cookies();
  jar.set(STATE_COOKIE, sign(raw), {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
}

export async function consumeOAuthState(): Promise<OAuthStatePayload | null> {
  const jar = await cookies();
  const cookie = jar.get(STATE_COOKIE)?.value;
  jar.delete(STATE_COOKIE);
  if (!cookie) return null;
  const raw = unsign(cookie);
  if (!raw) return null;
  try {
    const payload = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as OAuthStatePayload;
    if (Date.now() - payload.createdAt > 10 * 60 * 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

/* ------------------------------- sessions ------------------------------ */

export async function createMathUser(opts: { userAgent?: string | null; ip?: string | null; secure: boolean }) {
  const now = new Date();
  const localEmail = "operator@spideybot.local";
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, localEmail)).limit(1);
  const userId = existing[0]?.id ?? (await db
    .insert(users)
    .values({ name: "Spidey Operator", username: "operator", email: localEmail, avatar: null, role: "user", lastLoginAt: now })
    .returning({ id: users.id }))[0]?.id;
  if (!userId) throw new Error("Could not create local user");
  await db.update(users).set({ lastLoginAt: now, updatedAt: now }).where(eq(users.id, userId));
  const session = await createSession({ userId, provider: "math", ...opts });
  return { userId, sessionId: session.id, expiresAt: session.expiresAt };
}

export async function createSession(opts: {
  userId: number;
  provider: string;
  userAgent?: string | null;
  ip?: string | null;
  secure: boolean;
}) {
  const id = randomId(36);
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86400_000);
  await db.insert(sessions).values({
    id,
    userId: opts.userId,
    provider: opts.provider,
    userAgent: opts.userAgent ?? null,
    ip: opts.ip ?? null,
    expiresAt,
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, sign(id), {
    httpOnly: true,
    secure: opts.secure,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  return { id, expiresAt };
}

export async function destroySession() {
  const jar = await cookies();
  const cookie = jar.get(SESSION_COOKIE)?.value;
  jar.delete(SESSION_COOKIE);
  if (!cookie) return;
  const id = unsign(cookie);
  if (!id) return;
  await db.delete(sessions).where(eq(sessions.id, id));
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const cookie = jar.get(SESSION_COOKIE)?.value;
  if (!cookie) return null;
  const id = unsign(cookie);
  if (!id) return null;
  const rows = await db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      id: users.id,
      name: users.name,
      username: users.username,
      email: users.email,
      avatar: users.avatar,
      role: users.role,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.expiresAt.getTime() < Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    email: row.email,
    avatar: row.avatar,
    role: row.role,
    createdAt: row.createdAt,
    lastLoginAt: row.lastLoginAt,
  };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("UNAUTHORIZED");
  }
}

/* --------------------------- account linking --------------------------- */

export type ProviderProfile = {
  provider: "google" | "github";
  providerAccountId: string;
  name: string;
  username: string;
  email: string | null;
  avatar: string | null;
  emailVerified: boolean;
  scope?: string;
};

export async function upsertUserFromProvider(profile: ProviderProfile) {
  const existingAccount = await db
    .select()
    .from(accounts)
    .where(
      and(eq(accounts.provider, profile.provider), eq(accounts.providerAccountId, profile.providerAccountId)),
    )
    .limit(1);

  if (existingAccount[0]) {
    const userId = existingAccount[0].userId;
    await db
      .update(users)
      .set({
        name: profile.name,
        avatar: profile.avatar,
        lastLoginAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
    return { userId, linked: false, created: false };
  }

  // Safe account linking: only when the provider verified the e-mail address.
  if (profile.email && profile.emailVerified) {
    const existingUser = await db.select().from(users).where(eq(users.email, profile.email)).limit(1);
    if (existingUser[0]) {
      await db.insert(accounts).values({
        userId: existingUser[0].id,
        provider: profile.provider,
        providerAccountId: profile.providerAccountId,
        providerUsername: profile.username,
        providerEmail: profile.email,
        scope: profile.scope ?? null,
      });
      await db
        .update(users)
        .set({ lastLoginAt: new Date(), updatedAt: new Date(), avatar: profile.avatar })
        .where(eq(users.id, existingUser[0].id));
      return { userId: existingUser[0].id, linked: true, created: false };
    }
  }

  const inserted = await db
    .insert(users)
    .values({
      name: profile.name,
      username: profile.username,
      email: profile.email,
      avatar: profile.avatar,
      lastLoginAt: new Date(),
    })
    .returning({ id: users.id });
  const userId = inserted[0].id;
  await db.insert(accounts).values({
    userId,
    provider: profile.provider,
    providerAccountId: profile.providerAccountId,
    providerUsername: profile.username,
    providerEmail: profile.email,
    scope: profile.scope ?? null,
  });
  return { userId, linked: false, created: true };
}

/* ------------------------------- auditing ------------------------------ */

export async function logActivity(userId: number, action: string, description: string, ip?: string | null) {
  await db.insert(activityLogs).values({ userId, action, description, ip: ip ?? null });
}

export async function notify(userId: number, type: string, title: string, body?: string) {
  const rows = await db
    .insert(notifications)
    .values({ userId, type, title, body: body ?? null })
    .returning();
  return rows[0];
}
