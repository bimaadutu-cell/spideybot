import { fail, fetchWithTimeout, pingHost, type DownloadProvider, type MediaItem } from "../types";

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
