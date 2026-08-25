import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { headers } from "next/headers";

export const DATA_DIR = process.env.SPIDEY_DATA_DIR
  ? path.resolve(process.env.SPIDEY_DATA_DIR)
  : process.env.RAILWAY_VOLUME_MOUNT_PATH
    ? path.resolve(process.env.RAILWAY_VOLUME_MOUNT_PATH)
    : path.join(process.cwd(), ".data");

export const SESSIONS_DIR = path.join(DATA_DIR, "sessions");
export const WORKSPACE_DIR = path.join(DATA_DIR, "workspace");

export function ensureDirs() {
  for (const dir of [DATA_DIR, SESSIONS_DIR, WORKSPACE_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Session secret. Prefer the explicit SESSION_SECRET env var. When it is not
 * provided we generate one and persist it on disk so sessions survive restarts.
 * The generated fallback is reported as "generated" by the health endpoint so
 * operators know it should be set explicitly for production.
 */
let cachedSecret: string | null = null;
export function sessionSecret(): string {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (cachedSecret) return cachedSecret;
  ensureDirs();
  const file = path.join(DATA_DIR, ".session-secret");
  try {
    if (fs.existsSync(file)) {
      cachedSecret = fs.readFileSync(file, "utf8").trim();
    } else {
      cachedSecret = crypto.randomBytes(48).toString("hex");
      fs.writeFileSync(file, cachedSecret, { mode: 0o600 });
    }
  } catch {
    cachedSecret = crypto.randomBytes(48).toString("hex");
  }
  return cachedSecret;
}

export function sessionSecretIsExplicit() {
  return Boolean(process.env.SESSION_SECRET);
}

function normalizeBase(url: string) {
  return url.replace(/\/+$/, "");
}

/**
 * Resolve the public base URL of this deployment.
 * Order: APP_URL env -> forwarded headers (sandbox/proxy) -> host header.
 * Never hardcodes localhost or any specific domain.
 */
function isLocalHostname(host: string | null | undefined) {
  return Boolean(host && /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:\d+)?$/.test(host));
}

/**
 * Public deployments (sandbox previews, production domains) always terminate TLS
 * in front of the app, and some proxies still forward `x-forwarded-proto: http`.
 * OAuth providers require the exact https callback, so anything that is not a
 * loopback host is treated as https.
 */
function protoFor(host: string | null | undefined, forwarded: string | null | undefined) {
  if (isLocalHostname(host)) return forwarded === "https" ? "https" : "http";
  return "https";
}

export async function resolveAppUrl(): Promise<string> {
  if (process.env.APP_URL) return normalizeBase(process.env.APP_URL);
  try {
    const h = await headers();
    const forwardedHost = h.get("x-forwarded-host") ?? h.get("host");
    if (forwardedHost) {
      return normalizeBase(`${protoFor(forwardedHost, h.get("x-forwarded-proto"))}://${forwardedHost}`);
    }
  } catch {
    /* outside a request scope */
  }
  return "";
}

export function appUrlFromRequest(req: Request): string {
  if (process.env.APP_URL) return normalizeBase(process.env.APP_URL);
  const h = req.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) return normalizeBase(`${protoFor(host, h.get("x-forwarded-proto"))}://${host}`);
  return normalizeBase(new URL(req.url).origin);
}

export type ProviderConfig = {
  provider: "google" | "github";
  configured: boolean;
  clientIdPresent: boolean;
  clientSecretPresent: boolean;
  callbackConfigured: boolean;
  callbackUrl: string;
  callbackSource: "env" | "derived";
  missing: string[];
};

export function googleConfig(baseUrl: string): ProviderConfig {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const envCallback = process.env.GOOGLE_CALLBACK_URL?.trim();
  const callbackUrl = envCallback || (baseUrl ? `${baseUrl}/api/auth/google/callback` : "");
  const missing: string[] = [];
  if (!clientId) missing.push("GOOGLE_CLIENT_ID");
  if (!clientSecret) missing.push("GOOGLE_CLIENT_SECRET");
  if (!callbackUrl) missing.push("GOOGLE_CALLBACK_URL");
  return {
    provider: "google",
    configured: Boolean(clientId && clientSecret && callbackUrl),
    clientIdPresent: Boolean(clientId),
    clientSecretPresent: Boolean(clientSecret),
    callbackConfigured: Boolean(callbackUrl),
    callbackUrl,
    callbackSource: envCallback ? "env" : "derived",
    missing,
  };
}

export function githubConfig(baseUrl: string): ProviderConfig {
  const clientId = process.env.GITHUB_CLIENT_ID?.trim();
  const clientSecret = process.env.GITHUB_CLIENT_SECRET?.trim();
  const envCallback = process.env.GITHUB_CALLBACK_URL?.trim();
  const callbackUrl = envCallback || (baseUrl ? `${baseUrl}/api/auth/github/callback` : "");
  const missing: string[] = [];
  if (!clientId) missing.push("GITHUB_CLIENT_ID");
  if (!clientSecret) missing.push("GITHUB_CLIENT_SECRET");
  if (!callbackUrl) missing.push("GITHUB_CALLBACK_URL");
  return {
    provider: "github",
    configured: Boolean(clientId && clientSecret && callbackUrl),
    clientIdPresent: Boolean(clientId),
    clientSecretPresent: Boolean(clientSecret),
    callbackConfigured: Boolean(callbackUrl),
    callbackUrl,
    callbackSource: envCallback ? "env" : "derived",
    missing,
  };
}

export type AuthHealth = {
  ready: boolean;
  appUrl: string;
  appUrlSource: "env" | "derived";
  environment: string;
  google: ProviderConfig;
  github: ProviderConfig;
  session: boolean;
  sessionSecretSource: "env" | "generated";
  database: boolean;
  missing: string[];
};

export function buildAuthHealth(baseUrl: string): AuthHealth {
  const google = googleConfig(baseUrl);
  const github = githubConfig(baseUrl);
  const database = Boolean(process.env.DATABASE_URL);
  const missing = [...new Set([...google.missing, ...github.missing])];
  if (!database) missing.push("DATABASE_URL");
  if (!baseUrl) missing.push("APP_URL");
  return {
    ready: (google.configured || github.configured) && database && Boolean(baseUrl),
    appUrl: baseUrl,
    appUrlSource: process.env.APP_URL ? "env" : "derived",
    environment: process.env.NODE_ENV ?? "development",
    google,
    github,
    session: true,
    sessionSecretSource: sessionSecretIsExplicit() ? "env" : "generated",
    database,
    missing,
  };
}

/** Startup banner – prints configuration state without leaking secrets. */
let banner = false;
export function logStartupConfig() {
  if (banner) return;
  banner = true;
  const base = process.env.APP_URL ?? "(derived per-request)";
  const health = buildAuthHealth(process.env.APP_URL ?? "");
  const line = (ok: boolean, label: string) => `  ${ok ? "✓" : "✗"} ${label}`;
  const out = [
    "",
    "🕷️  SPIDEYBOT — configuration check",
    `  APP_URL: ${base}`,
    line(health.database, "DATABASE_URL"),
    line(health.google.clientIdPresent, "GOOGLE_CLIENT_ID"),
    line(health.google.clientSecretPresent, "GOOGLE_CLIENT_SECRET"),
    line(health.google.callbackConfigured, "GOOGLE_CALLBACK_URL"),
    line(health.github.clientIdPresent, "GITHUB_CLIENT_ID"),
    line(health.github.clientSecretPresent, "GITHUB_CLIENT_SECRET"),
    line(health.github.callbackConfigured, "GITHUB_CALLBACK_URL"),
    line(sessionSecretIsExplicit(), "SESSION_SECRET (explicit)"),
    health.google.configured || health.github.configured
      ? "  ➜ AUTH SYSTEM READY"
      : "  ➜ AUTH CONFIGURATION INCOMPLETE (set the variables above; no secret values are ever printed)",
    "",
  ].join("\n");
  console.log(out);
}
