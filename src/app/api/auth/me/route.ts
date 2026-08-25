import { NextResponse } from "next/server";
import { getSessionUser } from "@/server/auth/session";
import { db } from "@/db";
import { accounts } from "@/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ user: null }, { status: 401 });
  const linked = await db
    .select({ provider: accounts.provider, username: accounts.providerUsername, createdAt: accounts.createdAt })
    .from(accounts)
    .where(eq(accounts.userId, user.id));
  return NextResponse.json({ user, accounts: linked });
}
