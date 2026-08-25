import * as cheerio from "cheerio";
import { fail, fetchWithTimeout, pingHost, UA, type DownloadProvider, type MediaItem } from "../types";

/**
 * SnapInsta adapter — real request against snapinsta.app's action endpoint.
 * Returns HTML with download anchors that are parsed with cheerio.
 */
export const snapinsta: DownloadProvider = {
  key: "snapinsta",
  label: "SnapInsta",
  platform: "instagram",
  priority: 1,
  async download(url) {
    try {
      const home = await fetchWithTimeout("https://snapinsta.app/", { timeoutMs: 20_000 });
      const cookie = home.headers.get("set-cookie")?.split(";")[0] ?? "";
      const homeHtml = home.ok ? await home.text() : "";
      const token = cheerio.load(homeHtml)('input[name="token"]').attr("value") ?? "";

      const res = await fetchWithTimeout("https://snapinsta.app/api/ajaxSearch", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
          "x-requested-with": "XMLHttpRequest",
          origin: "https://snapinsta.app",
          referer: "https://snapinsta.app/",
          "user-agent": UA,
          ...(cookie ? { cookie } : {}),
        },
        body: new URLSearchParams({ q: url, t: "media", lang: "en", v: "v2", ...(token ? { token } : {}) }),
        timeoutMs: 30_000,
      });
      if (!res.ok) return fail("snapinsta", `HTTP ${res.status}`);
      const json = (await res.json().catch(() => null)) as { status?: string; data?: string } | null;
      if (!json?.data) return fail("snapinsta", "provider returned no data payload");
      const $ = cheerio.load(json.data);
      const media: MediaItem[] = [];
      $("a").each((_, el) => {
        const href = $(el).attr("href");
        if (!href || !/^https?:/.test(href)) return;
        if (/\.mp4/i.test(href)) media.push({ type: "video", url: href, ext: "mp4" });
        else if (/\.(jpe?g|webp|png)/i.test(href)) media.push({ type: "image", url: href, ext: "jpg" });
      });
      const thumbnail = $("img").first().attr("src") ?? undefined;
      if (!media.length) return fail("snapinsta", "no downloadable links in provider response");
      return { ok: true, provider: "snapinsta", platform: "instagram", media, thumbnail };
    } catch (err) {
      return fail("snapinsta", (err as Error).message);
    }
  },
  health: () => pingHost("https://snapinsta.app/"),
};
