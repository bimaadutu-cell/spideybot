import { db } from "@/db";
import { downloaderHistory, downloaderProviders } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { publish, logEvent } from "@/server/events/bus";
import { assertPublicUrl, type DownloadProvider, type Platform, type ProviderSuccess } from "./types";
import { tikwm } from "./providers/tikwm";
import { tiklydown } from "./providers/tiklydown";
import { snaptik } from "./providers/snaptik";
import { snapinsta } from "./providers/snapinsta";
import { instagramGraph, savevid } from "./providers/instagram";
import { youtubesave, ytOembed } from "./providers/youtube";
import { makeCobalt } from "./providers/cobalt";

const cobaltTiktok = makeCobalt("tiktok", 0);
const cobaltInstagram = makeCobalt("instagram", 0);
const cobaltYoutube = makeCobalt("youtube", 0);

export const PROVIDERS: DownloadProvider[] = [
  cobaltTiktok,
  tikwm,
  tiklydown,
  snaptik,
  cobaltInstagram,
  snapinsta,
  instagramGraph,
  savevid,
  cobaltYoutube,
  youtubesave,
  ytOembed,
];

export function detectPlatform(rawUrl: string): Platform | null {
  const url = rawUrl.trim().toLowerCase();
  if (/tiktok\.com|vt\.tiktok|vm\.tiktok|douyin\.com/.test(url)) return "tiktok";
  if (/instagram\.com|instagr\.am|ig\.me/.test(url)) return "instagram";
  if (/youtube\.com|youtu\.be|youtube-nocookie\.com/.test(url)) return "youtube";
  return null;
}

export function providersFor(platform: Platform) {
  return PROVIDERS.filter((p) => p.platform === platform).sort((a, b) => a.priority - b.priority);
}

export type EngineAttempt = { provider: string; ok: boolean; ms: number; error?: string };
export type EngineResult =
  | { ok: true; platform: Platform; result: ProviderSuccess; attempts: EngineAttempt[]; durationMs: number }
  | { ok: false; platform: Platform | null; error: string; attempts: EngineAttempt[]; durationMs: number };

export async function runDownload(opts: {
  url: string;
  userId?: number | null;
  botId?: string | null;
}): Promise<EngineResult> {
  const started = Date.now();
  const attempts: EngineAttempt[] = [];

  let parsedUrl: string;
  try {
    parsedUrl = assertPublicUrl(opts.url.trim()).toString();
  } catch (err) {
    return { ok: false, platform: null, error: (err as Error).message, attempts, durationMs: 0 };
  }

  const platform = detectPlatform(parsedUrl);
  if (!platform) {
    return {
      ok: false,
      platform: null,
      error: "Unsupported platform. Supported: TikTok, Instagram, YouTube.",
      attempts,
      durationMs: Date.now() - started,
    };
  }

  publish({
    type: "downloader.status",
    userId: opts.userId ?? null,
    botId: opts.botId ?? null,
    message: `Resolving ${platform} URL…`,
    payload: { stage: "routing", platform, url: parsedUrl },
  });

  const chain = providersFor(platform);
  let success: ProviderSuccess | null = null;

  for (const provider of chain) {
    const t0 = Date.now();
    publish({
      type: "downloader.status",
      userId: opts.userId ?? null,
      botId: opts.botId ?? null,
      message: `Trying provider ${provider.label}…`,
      payload: { stage: "provider", provider: provider.key },
    });
    let ok = false;
    let error: string | undefined;
    try {
      const res = await provider.download(parsedUrl);
      if (res.ok && (res.media.length > 0 || provider.metadataOnly)) {
        ok = res.media.length > 0;
        if (res.media.length > 0) {
          success = res;
        } else {
          error = "metadata only (no downloadable media)";
        }
      } else if (!res.ok) {
        error = res.error;
      } else {
        error = "empty media list";
      }
    } catch (err) {
      error = (err as Error).message;
    }
    const ms = Date.now() - t0;
    attempts.push({ provider: provider.key, ok, ms, error });
    await recordProviderResult(provider, ok, ms, error);
    if (success) break;
  }

  const durationMs = Date.now() - started;

  if (success) {
    try {
      await db.insert(downloaderHistory).values({
        userId: opts.userId ?? null,
        botId: opts.botId ?? null,
        platform,
        url: parsedUrl,
        provider: success.provider,
        status: "success",
        title: success.title ?? null,
        mediaUrl: success.media[0]?.url ?? null,
        mediaType: success.media[0]?.type ?? null,
        durationMs,
        attempts,
      });
    } catch (err) {
      console.warn("[Downloader] success history skipped:", (err as Error).message);
    }
    await logEvent({
      userId: opts.userId ?? null,
      botId: opts.botId ?? null,
      channel: "DOWNLOADER",
      level: "success",
      message: `${platform} download resolved via ${success.provider} in ${durationMs}ms`,
      meta: { url: parsedUrl, attempts },
    }).catch((err) => console.warn("[Downloader] success event skipped:", (err as Error).message));
    publish({
      type: "downloader.status",
      userId: opts.userId ?? null,
      botId: opts.botId ?? null,
      message: `Resolved via ${success.provider}`,
      payload: { stage: "done", ok: true, provider: success.provider },
    });
    return { ok: true, platform, result: success, attempts, durationMs };
  }

  const error =
    attempts.length > 0
      ? `All ${platform} providers failed: ${attempts.map((a) => `${a.provider} (${a.error ?? "failed"})`).join(" → ")}`
      : `No providers registered for ${platform}`;

  try {
    await db.insert(downloaderHistory).values({
      userId: opts.userId ?? null,
      botId: opts.botId ?? null,
      platform,
      url: parsedUrl,
      provider: null,
      status: "failed",
      durationMs,
      attempts,
      error,
    });
  } catch (err) {
    console.warn("[Downloader] failure history skipped:", (err as Error).message);
  }
  await logEvent({
    userId: opts.userId ?? null,
    botId: opts.botId ?? null,
    channel: "DOWNLOADER",
    level: "error",
    message: error,
    meta: { url: parsedUrl },
  }).catch((err) => console.warn("[Downloader] failure event skipped:", (err as Error).message));
  publish({
    type: "downloader.status",
    userId: opts.userId ?? null,
    botId: opts.botId ?? null,
    message: "Download failed",
    payload: { stage: "done", ok: false, error },
  });
  return { ok: false, platform, error, attempts, durationMs };
}

async function recordProviderResult(provider: DownloadProvider, ok: boolean, ms: number, error?: string) {
  try {
    await ensureProviderRow(provider);
    await db
      .update(downloaderProviders)
      .set({
        status: ok ? "online" : "degraded",
        lastCheckAt: new Date(),
        lastResponseMs: ms,
        lastError: ok ? null : (error ?? null),
        successCount: ok ? sql`${downloaderProviders.successCount} + 1` : downloaderProviders.successCount,
        failureCount: ok ? downloaderProviders.failureCount : sql`${downloaderProviders.failureCount} + 1`,
      })
      .where(eq(downloaderProviders.key, provider.key));
  } catch {
    /* metrics are best-effort */
  }
}

export async function ensureProviderRow(provider: DownloadProvider) {
  const existing = await db
    .select({ id: downloaderProviders.id })
    .from(downloaderProviders)
    .where(eq(downloaderProviders.key, provider.key))
    .limit(1);
  if (!existing[0]) {
    await db
      .insert(downloaderProviders)
      .values({
        key: provider.key,
        label: provider.label,
        platform: provider.platform,
        priority: provider.priority,
      })
      .onConflictDoNothing();
  }
}

export async function checkProviderHealth() {
  const results = await Promise.all(
    PROVIDERS.map(async (p) => {
      const health = await p.health();
      await ensureProviderRow(p);
      const status = health.ok ? "online" : health.error?.includes("Not configured") ? "unconfigured" : "degraded";
      await db
        .update(downloaderProviders)
        .set({
          status,
          lastCheckAt: new Date(),
          lastResponseMs: health.ms,
          lastError: health.error ?? null,
        })
        .where(eq(downloaderProviders.key, p.key));
      return { key: p.key, label: p.label, platform: p.platform, status, ms: health.ms, error: health.error };
    }),
  );
  return results;
}

export async function listProviders() {
  for (const p of PROVIDERS) await ensureProviderRow(p);
  const rows = await db.select().from(downloaderProviders);
  return rows
    .map((row) => {
      const def = PROVIDERS.find((p) => p.key === row.key);
      const total = row.successCount + row.failureCount;
      return {
        ...row,
        metadataOnly: Boolean(def?.metadataOnly),
        successRate: total ? Math.round((row.successCount / total) * 100) : null,
      };
    })
    .sort((a, b) => a.platform.localeCompare(b.platform) || a.priority - b.priority);
}
