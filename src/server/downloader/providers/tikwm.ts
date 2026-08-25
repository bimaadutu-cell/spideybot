import { fail, fetchWithTimeout, pingHost, type DownloadProvider, type MediaItem } from "../types";

/**
 * TikWM public API — real JSON endpoint, no key required.
 * https://tikwm.com/api/?url=<tiktok-url>
 */
export const tikwm: DownloadProvider = {
  key: "tikwm",
  label: "TikWM",
  platform: "tiktok",
  priority: 1,
  async download(url) {
    try {
      const res = await fetchWithTimeout("https://tikwm.com/api/", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
        body: new URLSearchParams({ url, hd: "1" }),
        timeoutMs: 25_000,
      });
      if (!res.ok) return fail("tikwm", `HTTP ${res.status}`);
      const json = (await res.json()) as {
        code?: number;
        msg?: string;
        data?: {
          id?: string;
          title?: string;
          play?: string;
          hdplay?: string;
          wmplay?: string;
          music?: string;
          cover?: string;
          duration?: number;
          images?: string[];
          author?: { nickname?: string; unique_id?: string };
        };
      };
      if (json.code !== 0 || !json.data) return fail("tikwm", json.msg || "Provider returned no data");
      const d = json.data;
      const media: MediaItem[] = [];
      if (d.images?.length) {
        for (const img of d.images) media.push({ type: "image", url: img, ext: "jpg" });
      }
      const base = "https://tikwm.com";
      const abs = (u?: string) => (u ? (u.startsWith("http") ? u : base + u) : undefined);
      if (d.hdplay) media.push({ type: "video", url: abs(d.hdplay)!, quality: "HD (no watermark)", ext: "mp4" });
      if (d.play) media.push({ type: "video", url: abs(d.play)!, quality: "SD (no watermark)", ext: "mp4" });
      if (d.wmplay) media.push({ type: "video", url: abs(d.wmplay)!, quality: "watermark", ext: "mp4" });
      if (d.music) media.push({ type: "audio", url: abs(d.music)!, quality: "audio", ext: "mp3" });
      if (!media.length) return fail("tikwm", "No downloadable media in response");
      return {
        ok: true,
        provider: "tikwm",
        platform: "tiktok",
        title: d.title,
        author: d.author?.nickname ?? d.author?.unique_id,
        thumbnail: abs(d.cover),
        durationSec: d.duration,
        media,
      };
    } catch (err) {
      return fail("tikwm", (err as Error).message);
    }
  },
  health: () => pingHost("https://tikwm.com/api/?url=https://www.tiktok.com/"),
};
