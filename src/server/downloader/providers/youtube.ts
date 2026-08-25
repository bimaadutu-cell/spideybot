import { fail, fetchWithTimeout, pingHost, type DownloadProvider, type MediaItem } from "../types";

/**
 * Cobalt API adapter. Point COBALT_API_URL at any cobalt instance you control
 * (self-hosted is recommended). Without the env var the adapter reports
 * "Not configured" instead of pretending to work.
 */
export const cobalt: DownloadProvider = {
  key: "cobalt",
  label: "Cobalt",
  platform: "youtube",
  priority: 1,
  async download(url) {
    const api = process.env.COBALT_API_URL?.replace(/\/+$/, "");
    if (!api) return fail("cobalt", "Not configured — set COBALT_API_URL to a cobalt instance");
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
      if (!res.ok || !json) return fail("cobalt", `HTTP ${res.status}`);
      if (json.status === "error") return fail("cobalt", json.error?.code ?? "provider error");
      const media: MediaItem[] = [];
      if (json.url) media.push({ type: "video", url: json.url, ext: "mp4" });
      if (json.picker?.length)
        for (const p of json.picker) media.push({ type: p.type === "photo" ? "image" : "video", url: p.url });
      if (!media.length) return fail("cobalt", "no media returned");
      return { ok: true, provider: "cobalt", platform: "youtube", media };
    } catch (err) {
      return fail("cobalt", (err as Error).message);
    }
  },
  async health() {
    const api = process.env.COBALT_API_URL;
    if (!api) return { ok: false, ms: 0, error: "Not configured (COBALT_API_URL)" };
    return pingHost(api);
  },
};

/** YouTubeSave mirror — real POST against their public convert endpoint. */
export const youtubesave: DownloadProvider = {
  key: "youtubesave",
  label: "YouTubeSave",
  platform: "youtube",
  priority: 2,
  async download(url) {
    try {
      const res = await fetchWithTimeout("https://youtubesave.com/api/convert", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json", origin: "https://youtubesave.com" },
        body: JSON.stringify({ url }),
        timeoutMs: 40_000,
      });
      if (!res.ok) return fail("youtubesave", `HTTP ${res.status}`);
      const json = (await res.json().catch(() => null)) as {
        title?: string;
        thumbnail?: string;
        url?: { url?: string; quality?: string; type?: string }[] | string;
      } | null;
      if (!json) return fail("youtubesave", "invalid provider response");
      const media: MediaItem[] = [];
      if (typeof json.url === "string") media.push({ type: "video", url: json.url, ext: "mp4" });
      else if (Array.isArray(json.url))
        for (const entry of json.url)
          if (entry.url)
            media.push({
              type: entry.type === "audio" ? "audio" : "video",
              url: entry.url,
              quality: entry.quality,
            });
      if (!media.length) return fail("youtubesave", "no media returned");
      return {
        ok: true,
        provider: "youtubesave",
        platform: "youtube",
        title: json.title,
        thumbnail: json.thumbnail,
        media,
      };
    } catch (err) {
      return fail("youtubesave", (err as Error).message);
    }
  },
  health: () => pingHost("https://youtubesave.com/"),
};

/** oEmbed metadata provider — always real, but metadata only (no media file). */
export const ytOembed: DownloadProvider = {
  key: "yt-oembed",
  label: "YouTube oEmbed (metadata)",
  platform: "youtube",
  priority: 9,
  metadataOnly: true,
  async download(url) {
    try {
      const res = await fetchWithTimeout(
        `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`,
        { timeoutMs: 15_000 },
      );
      if (!res.ok) return fail("yt-oembed", `HTTP ${res.status}`);
      const json = (await res.json()) as { title?: string; author_name?: string; thumbnail_url?: string };
      return {
        ok: true,
        provider: "yt-oembed",
        platform: "youtube",
        title: json.title,
        author: json.author_name,
        thumbnail: json.thumbnail_url,
        media: [],
      };
    } catch (err) {
      return fail("yt-oembed", (err as Error).message);
    }
  },
  health: () => pingHost("https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=jNQXAC9IVRw"),
};
