import * as cheerio from "cheerio";
import { fail, fetchWithTimeout, pingHost, UA, type DownloadProvider, type MediaItem } from "../types";

/**
 * SnapTik adapter — performs the real two step flow:
 *   1. GET https://snaptik.app/en to obtain the CSRF token
 *   2. POST the token + url to /abc2.php and parse the returned payload
 * SnapTik answers with obfuscated JS, so downloadable links are extracted from
 * the raw response body. If the layout changes the adapter fails loudly.
 */
export const snaptik: DownloadProvider = {
  key: "snaptik",
  label: "SnapTik",
  platform: "tiktok",
  priority: 3,
  async download(url) {
    try {
      const page = await fetchWithTimeout("https://snaptik.app/en", { timeoutMs: 20_000 });
      if (!page.ok) return fail("snaptik", `token page HTTP ${page.status}`);
      const html = await page.text();
      const cookie = page.headers.get("set-cookie")?.split(";")[0] ?? "";
      const $ = cheerio.load(html);
      const token = $('input[name="token"]').attr("value");
      if (!token) return fail("snaptik", "token not found (site layout changed)");

      const res = await fetchWithTimeout("https://snaptik.app/abc2.php", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          origin: "https://snaptik.app",
          referer: "https://snaptik.app/en",
          "user-agent": UA,
          ...(cookie ? { cookie } : {}),
        },
        body: new URLSearchParams({ url, lang: "en", token }),
        timeoutMs: 30_000,
      });
      if (!res.ok) return fail("snaptik", `HTTP ${res.status}`);
      const body = await res.text();
      const decoded = body.replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
      const urls = new Set<string>();
      for (const m of decoded.matchAll(/https?:\\?\/\\?\/[^"'\\\s]+/g)) {
        const clean = m[0].replace(/\\/g, "");
        if (/\.mp4|tikcdn|snaptik|rapidcdn|\/dl\//i.test(clean)) urls.add(clean);
      }
      const media: MediaItem[] = [...urls]
        .filter((u) => !/\.(css|js|png|svg|ico)(\?|$)/i.test(u))
        .slice(0, 4)
        .map((u) => ({ type: "video", url: u, ext: "mp4", quality: "snaptik" }));
      if (!media.length) return fail("snaptik", "no media links found in provider response");
      return { ok: true, provider: "snaptik", platform: "tiktok", media };
    } catch (err) {
      return fail("snaptik", (err as Error).message);
    }
  },
  health: () => pingHost("https://snaptik.app/en"),
};
