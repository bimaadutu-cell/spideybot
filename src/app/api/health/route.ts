import { NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { appUrlFromRequest, DATA_DIR, logStartupConfig } from "@/server/config";
import fs from "node:fs";
import { registry } from "@/server/bot/manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function GET(req: Request) {
  logStartupConfig();
  let database = false;
  try {
    await withTimeout(db.execute(sql`select 1`), 5_000);
    database = true;
  } catch {
    database = false;
  }
  const baseUrl = appUrlFromRequest(req);
  const dataDirWritable = (() => {
    try {
      fs.accessSync(DATA_DIR, fs.constants.W_OK);
      return true;
    } catch {
      return false;
    }
  })();
  const bots = [...registry().values()];
  return NextResponse.json({
    status: database && dataDirWritable ? "ok" : "degraded",
    service: "SPIDEYBOT",
    engine: "@whiskeysockets/baileys@6.7.22",
    database,
    baseUrl,
    storage: { dataDir: DATA_DIR, writable: dataDirWritable, railwayVolume: Boolean(process.env.RAILWAY_VOLUME_MOUNT_PATH) },
    auth: { ready: database, mode: "random-math", sessionCookie: "httpOnly-signed" },
    bots: { total: bots.length, connected: bots.filter((b) => b.status === "connected").length },
    uptimeSec: Math.round(process.uptime()),
    ts: new Date().toISOString(),
  });
}
