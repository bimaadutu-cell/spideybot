import { fail, fetchWithTimeout, pingHost, type DownloadProvider, type MediaItem, type Platform } from "../types";

/**
 * Cobalt (https://github.com/imputnet/cobalt) is a self-hostable media
 * resolver that supports TikTok, Instagram and YouTube through the same
 * API shape. Point COBALT_API_URL at any instance you run or trust
 * (self-hosted is recommended — public instances rate-limit hard).
 * Without the env var the adapter reports "Not configured" instead of
 * pretending to work, and the engine simply moves on to the next provider.
 */
export function makeCobalt(platform: Platform, priority: number): DownloadProvider {
  return {
    key: `cobalt-${platform}`,
    label: "Cobalt",
    platform,
    priority,
    async download(url) {
      const api = process.env.COBALT_API_URL?.replace(/\/+$/, "");
      if (!api) return fail(`cobalt-${platform}`, "Not configured — set COBALT_API_URL to a cobalt instance");
      try {
        const headers: Record<string, string> = {
          "content-type": "application/json",
          accept: "application/json",
        };
        if (process.env.COBALT_API_KEY) headers.authorization = `Api-Key ${process.env.COBALT_API_KEY}`;
        const res = await fetchWithTimeout(api, {
          method: "POST",
          headers,
          body: JSON.stringify({ url, videoQuality: "720", filenameStyle: "basic" }),
          timeoutMs: 40_000,
        });
        const json = (await res.json().catch(() => null)) as {
          status?: string;
          url?: string;
          error?: { code?: string };
          picker?: { url: string; type?: string }[];
        } | null;
        if (!res.ok || !json) return fail(`cobalt-${platform}`, `HTTP ${res.status}`);
        if (json.status === "error") return fail(`cobalt-${platform}`, json.error?.code ?? "provider error");
        const media: MediaItem[] = [];
        if (json.url) media.push({ type: "video", url: json.url, ext: "mp4" });
        if (json.picker?.length)
          for (const p of json.picker) media.push({ type: p.type === "photo" ? "image" : "video", url: p.url });
        if (!media.length) return fail(`cobalt-${platform}`, "no media returned");
        return { ok: true, provider: `cobalt-${platform}`, platform, media };
      } catch (err) {
        return fail(`cobalt-${platform}`, (err as Error).message);
      }
    },
    async health() {
      const api = process.env.COBALT_API_URL;
      if (!api) return { ok: false, ms: 0, error: "Not configured (COBALT_API_URL)" };
      return pingHost(api);
    },
  };
}
