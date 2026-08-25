export type Platform = "tiktok" | "instagram" | "youtube";

export type MediaItem = {
  type: "video" | "image" | "audio";
  url: string;
  quality?: string;
  ext?: string;
  sizeBytes?: number;
};

export type ProviderSuccess = {
  ok: true;
  provider: string;
  platform: Platform;
  title?: string;
  author?: string;
  thumbnail?: string;
  durationSec?: number;
  media: MediaItem[];
};

export type ProviderFailure = { ok: false; provider: string; error: string };
export type ProviderResult = ProviderSuccess | ProviderFailure;

export type HealthResult = { ok: boolean; ms: number; error?: string };

export type DownloadProvider = {
  key: string;
  label: string;
  platform: Platform;
  priority: number;
  /** Some providers can only return metadata (no downloadable media stream). */
  metadataOnly?: boolean;
  download(url: string): Promise<ProviderResult>;
  health(): Promise<HealthResult>;
};

export const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = 20_000, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...rest,
      signal: controller.signal,
      headers: { "user-agent": UA, ...(rest.headers as Record<string, string> | undefined) },
      cache: "no-store",
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function pingHost(url: string, timeoutMs = 10_000): Promise<HealthResult> {
  const started = Date.now();
  try {
    const res = await fetchWithTimeout(url, { method: "GET", timeoutMs });
    const ms = Date.now() - started;
    if (!res.ok && res.status >= 500) return { ok: false, ms, error: `HTTP ${res.status}` };
    return { ok: true, ms };
  } catch (err) {
    return { ok: false, ms: Date.now() - started, error: (err as Error).message };
  }
}

export function fail(provider: string, error: string): ProviderFailure {
  return { ok: false, provider, error };
}

/** Blocks private / loopback hosts to avoid SSRF through user supplied URLs. */
export function assertPublicUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("Invalid URL");
  }
  if (!/^https?:$/.test(parsed.protocol)) throw new Error("Only http/https URLs are supported");
  const host = parsed.hostname.toLowerCase();
  const blocked =
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "0.0.0.0" ||
    host === "[::1]" ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host);
  if (blocked) throw new Error("Private network URLs are not allowed");
  return parsed;
}
