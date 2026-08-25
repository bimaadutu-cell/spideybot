const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const dataDir = path.resolve(process.env.SPIDEY_DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(process.cwd(), ".data"));
for (const dir of [dataDir, path.join(dataDir, "sessions"), path.join(dataDir, "workspace")]) fs.mkdirSync(dir, { recursive: true });

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const env = process.env;

// timeoutMs bounds each attempt so an unreachable/slow database can never
// block the whole start script past Railway's healthcheck window. Without
// this, a bad DATABASE_URL (wrong host, no DB attached, etc.) can make
// "drizzle-kit migrate" hang almost indefinitely on the TCP/SSL handshake,
// which means Next.js never even starts listening and the deploy is marked
// as a healthcheck failure even though the build/deploy itself was fine.
function run(command, args, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: "inherit", env });
    let settled = false;
    const timer = timeoutMs
      ? setTimeout(() => {
          if (settled) return;
          settled = true;
          child.kill("SIGKILL");
          resolve({ code: 1, timedOut: true });
        }, timeoutMs)
      : null;
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({ code: 1, error });
    });
    child.on("exit", (code, signal) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({ code: code ?? 1, signal });
    });
  });
}

const MIGRATION_ATTEMPT_TIMEOUT_MS = 20_000; // 20s per attempt, 3 attempts max ~ 60s total

async function start() {
  if (env.DATABASE_URL) {
    let migrated = false;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      console.log(`[Railway] Database migration attempt ${attempt}/3`);
      const result = await run(npm, ["run", "db:migrate"], MIGRATION_ATTEMPT_TIMEOUT_MS);
      if (result.code === 0) {
        migrated = true;
        break;
      }
      if (result.timedOut) {
        console.warn(`[Railway] Migration attempt ${attempt} timed out after ${MIGRATION_ATTEMPT_TIMEOUT_MS}ms; check DATABASE_URL host/credentials.`);
      } else {
        console.warn(`[Railway] Migration attempt ${attempt} failed; retrying when possible.`);
      }
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    if (!migrated) console.warn("[Railway] Migration could not complete. Starting app so /api/health can report the database problem.");
  } else {
    console.warn("[Railway] DATABASE_URL is not configured. Starting app in degraded mode.");
  }

  const app = spawn(npm, ["run", "start:app"], { stdio: "inherit", env });
  app.on("error", (error) => {
    console.error("[Railway] Next.js could not start:", error.message);
    process.exit(1);
  });
  app.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
}

void start();
