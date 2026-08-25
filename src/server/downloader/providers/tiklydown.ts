import { fail, fetchWithTimeout, pingHost, type DownloadProvider, type MediaItem } from "../types";

/** TiklyDown public API — real JSON endpoint used as first TikTok fallback. */
export const tiklydown: DownloadProvider = {
  key: "tiklydown",
  label: "TiklyDown",
  platform: "tiktok",
  priority: 2,
  async download(url) {
    try {
      const endpoint = `https://api.tiklydown.eu.org/api/download?url=${encodeURIComponent(url)}`;
      const res = await fetchWithTimeout(endpoint, { timeoutMs: 25_000, headers: { accept: "application/json" } });
      if (!res.ok) return fail("tiklydown", `HTTP ${res.status}`);
      const json = (await res.json()) as {
        title?: string;
        author?: { name?: string; unique_id?: string };
        video?: { noWatermark?: string; watermark?: string; cover?: string; duration?: number };
        music?: { play_url?: string };
        images?: { url: string }[];
      };
      const media: MediaItem[] = [];
      if (json.video?.noWatermark)
        media.push({ type: "video", url: json.video.noWatermark, quality: "no watermark", ext: "mp4" });
      if (json.video?.watermark)
        media.push({ type: "video", url: json.video.watermark, quality: "watermark", ext: "mp4" });
      if (json.images?.length) for (const i of json.images) media.push({ type: "image", url: i.url, ext: "jpg" });
      if (json.music?.play_url) media.push({ type: "audio", url: json.music.play_url, ext: "mp3" });
      if (!media.length) return fail("tiklydown", "No downloadable media in response");
      return {
        ok: true,
        provider: "tiklydown",
        platform: "tiktok",
        title: json.title,
        author: json.author?.name ?? json.author?.unique_id,
        thumbnail: json.video?.cover,
        durationSec: json.video?.duration,
        media,
      };
    } catch (err) {
      return fail("tiklydown", (err as Error).message);
    }
  },
  health: () => pingHost("https://api.tiklydown.eu.org/api/download?url=https://www.tiktok.com/"),
};
