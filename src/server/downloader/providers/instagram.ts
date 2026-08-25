import { fail, fetchWithTimeout, pingHost, UA, type DownloadProvider, type MediaItem } from "../types";

function shortcodeFrom(url: string): string | null {
  const m = url.match(/instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
  return m?.[1] ?? null;
}

/**
 * Direct Instagram GraphQL adapter (public posts only).
 * Uses the documented web app id header. Instagram rate limits datacenter IPs
 * aggressively — when that happens the adapter reports the real error and the
 * engine moves on to the next provider.
 */
export const instagramGraph: DownloadProvider = {
  key: "instagram-graph",
  label: "Instagram GraphQL",
  platform: "instagram",
  priority: 2,
  async download(url) {
    const code = shortcodeFrom(url);
    if (!code) return fail("instagram-graph", "Unsupported Instagram URL (need /p/, /reel/ or /tv/)");
    try {
      const endpoint = `https://www.instagram.com/api/v1/media/shortcode/${code}/info/`;
      const res = await fetchWithTimeout(endpoint, {
        headers: {
          "user-agent": UA,
          "x-ig-app-id": "936619743392459",
          accept: "*/*",
        },
        timeoutMs: 25_000,
      });
      if (!res.ok) return fail("instagram-graph", `HTTP ${res.status} (Instagram blocked or private post)`);
      const json = (await res.json().catch(() => null)) as {
        items?: {
          caption?: { text?: string };
          user?: { username?: string };
          video_versions?: { url: string; width?: number; height?: number }[];
          image_versions2?: { candidates?: { url: string }[] };
          carousel_media?: {
            video_versions?: { url: string }[];
            image_versions2?: { candidates?: { url: string }[] };
          }[];
        }[];
      } | null;
      const item = json?.items?.[0];
      if (!item) return fail("instagram-graph", "post not found or not public");
      const media: MediaItem[] = [];
      const push = (node: {
        video_versions?: { url: string }[];
        image_versions2?: { candidates?: { url: string }[] };
      }) => {
        if (node.video_versions?.[0]) media.push({ type: "video", url: node.video_versions[0].url, ext: "mp4" });
        else if (node.image_versions2?.candidates?.[0])
          media.push({ type: "image", url: node.image_versions2.candidates[0].url, ext: "jpg" });
      };
      if (item.carousel_media?.length) item.carousel_media.forEach(push);
      else push(item);
      if (!media.length) return fail("instagram-graph", "no media in response");
      return {
        ok: true,
        provider: "instagram-graph",
        platform: "instagram",
        title: item.caption?.text?.slice(0, 200),
        author: item.user?.username,
        thumbnail: item.image_versions2?.candidates?.[0]?.url,
        media,
      };
    } catch (err) {
      return fail("instagram-graph", (err as Error).message);
    }
  },
  health: () => pingHost("https://www.instagram.com/favicon.ico"),
};

/** SaveInsta / snapsave style mirror used as the last Instagram fallback. */
export const savevid: DownloadProvider = {
  key: "snapsave",
  label: "SnapSave",
  platform: "instagram",
  priority: 3,
  async download(url) {
    try {
      const res = await fetchWithTimeout("https://snapsave.app/action.php?lang=en", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          origin: "https://snapsave.app",
          referer: "https://snapsave.app/",
          "user-agent": UA,
        },
        body: new URLSearchParams({ url }),
        timeoutMs: 30_000,
      });
      if (!res.ok) return fail("snapsave", `HTTP ${res.status}`);
      const body = await res.text();
      const decoded = body.replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
      const found = new Set<string>();
      for (const m of decoded.matchAll(/https?:\\?\/\\?\/[^"'\\\s<>]+/g)) {
        const clean = m[0].replace(/\\/g, "");
        if (/\.mp4|\.jpg|\.webp|cdninstagram|snapsave|fbcdn/i.test(clean)) found.add(clean);
      }
      const media: MediaItem[] = [...found]
        .filter((u) => !/\.(css|js|svg|ico)(\?|$)/i.test(u))
        .slice(0, 6)
        .map((u) => ({ type: /\.mp4/i.test(u) ? "video" : "image", url: u }));
      if (!media.length) return fail("snapsave", "no media links found");
      return { ok: true, provider: "snapsave", platform: "instagram", media };
    } catch (err) {
      return fail("snapsave", (err as Error).message);
    }
  },
  health: () => pingHost("https://snapsave.app/"),
};
