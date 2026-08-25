import { NextResponse } from "next/server";
import { appUrlFromRequest, DATA_DIR, sessionSecretIsExplicit, logStartupConfig } from "@/server/config";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import fs from "node:fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  logStartupConfig();
  let database = false;
  try {
    await db.execute(sql`select 1`);
    database = true;
  } catch {
    database = false;
  }
  let storageWritable = false;
  try { fs.accessSync(DATA_DIR, fs.constants.W_OK); storageWritable = true; } catch { storageWritable = false; }
  return NextResponse.json({
    ready: database && storageWritable,
    mode: "random-math",
    appUrl: appUrlFromRequest(req),
    environment: process.env.NODE_ENV ?? "development",
    session: true,
    sessionSecretSource: sessionSecretIsExplicit() ? "env" : "generated",
    database,
    storage: { dataDir: DATA_DIR, writable: storageWritable, railwayVolume: Boolean(process.env.RAILWAY_VOLUME_MOUNT_PATH) },
  }, { headers: { "Cache-Control": "no-store" } });
}
