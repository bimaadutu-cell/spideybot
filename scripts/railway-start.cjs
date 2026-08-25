const { spawn } = require("node:child_process");

if (!process.env.DATABASE_URL) {
  console.error("[Railway] DATABASE_URL is required before starting SpideyBot.");
  process.exit(1);
}

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const migration = spawn(npm, ["run", "db:push", "--", "--force"], {
  stdio: "inherit",
  env: process.env,
});

migration.on("error", (err) => {
  console.error("[Railway] Database migration could not start:", err.message);
  process.exit(1);
});

migration.on("exit", (code, signal) => {
  if (code !== 0) {
    console.error(`[Railway] Database migration failed (code=${code ?? "null"}, signal=${signal ?? "none"}).`);
    process.exit(code ?? 1);
  }
  const app = spawn(npm, ["run", "start:app"], { stdio: "inherit", env: process.env });
  app.on("error", (err) => {
    console.error("[Railway] Next.js could not start:", err.message);
    process.exit(1);
  });
  app.on("exit", (appCode, appSignal) => process.exit(appCode ?? (appSignal ? 1 : 0)));
});
