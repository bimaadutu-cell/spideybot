import { withUser, json } from "@/server/api";
import { appUrlFromRequest, buildAuthHealth, sessionSecretIsExplicit } from "@/server/config";
import { hasFfmpeg, hasSharp } from "@/server/commands/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MASK = "••••••••••";

function present(key: string) {
  return Boolean(process.env[key]);
}

/** Public (non-secret) values may be shown; secrets are only reported as present/absent. */
export async function GET(req: Request) {
  return withUser(async () => {
    const baseUrl = appUrlFromRequest(req);
    const health = buildAuthHealth(baseUrl);
    const dbUrl = process.env.DATABASE_URL ?? "";
    const maskedDb = dbUrl
      ? dbUrl.replace(/\/\/([^:]+):([^@]+)@/, (_m, u) => `//${u}:${MASK}@`)
      : "not configured";

    return json({
      variables: [
        { key: "APP_URL", value: baseUrl || "not configured", secret: false, source: health.appUrlSource },
        { key: "DATABASE_URL", value: maskedDb, secret: true, present: present("DATABASE_URL") },
        {
          key: "GOOGLE_CLIENT_ID",
          value: process.env.GOOGLE_CLIENT_ID ? `${process.env.GOOGLE_CLIENT_ID.slice(0, 12)}…` : "not configured",
          secret: false,
          present: present("GOOGLE_CLIENT_ID"),
        },
        { key: "GOOGLE_CLIENT_SECRET", value: MASK, secret: true, present: present("GOOGLE_CLIENT_SECRET") },
        {
          key: "GOOGLE_CALLBACK_URL",
          value: health.google.callbackUrl || "not configured",
          secret: false,
          source: health.google.callbackSource,
        },
        {
          key: "GITHUB_CLIENT_ID",
          value: process.env.GITHUB_CLIENT_ID ? `${process.env.GITHUB_CLIENT_ID.slice(0, 12)}…` : "not configured",
          secret: false,
          present: present("GITHUB_CLIENT_ID"),
        },
        { key: "GITHUB_CLIENT_SECRET", value: MASK, secret: true, present: present("GITHUB_CLIENT_SECRET") },
        {
          key: "GITHUB_CALLBACK_URL",
          value: health.github.callbackUrl || "not configured",
          secret: false,
          source: health.github.callbackSource,
        },
        {
          key: "SESSION_SECRET",
          value: MASK,
          secret: true,
          present: sessionSecretIsExplicit(),
          source: health.sessionSecretSource,
        },
        { key: "COBALT_API_URL", value: process.env.COBALT_API_URL ?? "not configured", secret: false },
        { key: "REMOVEBG_API_KEY", value: MASK, secret: true, present: present("REMOVEBG_API_KEY") },
      ],
      runtime: {
        nodeEnv: process.env.NODE_ENV ?? "development",
        baileys: "@whiskeysockets/baileys@6.7.22",
        ffmpeg: await hasFfmpeg(),
        sharp: await hasSharp(),
      },
      auth: health,
    });
  });
}
