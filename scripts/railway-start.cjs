const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const dataDir = path.resolve(process.env.SPIDEY_DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(process.cwd(), ".data"));
for (const dir of [dataDir, path.join(dataDir, "sessions"), path.join(dataDir, "workspace")]) fs.mkdirSync(dir, { recursive: true });

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const env = process.env;

function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: "inherit", env });
    child.on("error", (error) => resolve({ code: 1, error }));
    child.on("exit", (code, signal) => resolve({ code: code ?? 1, signal }));
  });
}

async function start() {
  if (env.DATABASE_URL) {
    let migrated = false;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      console.log(`[Railway] Database migration attempt ${attempt}/3`);
      const result = await run(npm, ["run", "db:push", "--", "--force"]);
      if (result.code === 0) {
        migrated = true;
        break;
      }
      console.warn(`[Railway] Migration attempt ${attempt} failed; retrying when possible.`);
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 3000));
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
