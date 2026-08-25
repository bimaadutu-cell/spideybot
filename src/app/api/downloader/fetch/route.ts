import { getSessionUser } from "@/server/auth/session";
import { assertPublicUrl, fetchWithTimeout } from "@/server/downloader/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function extFromType(type: string | null, fallbackUrl: string) {
  if (type?.includes("mp4") || type?.includes("video")) return "mp4";
  if (type?.includes("jpeg")) return "jpg";
  if (type?.includes("png")) return "png";
  if (type?.includes("webp")) return "webp";
  if (type?.includes("mpeg") || type?.includes("audio")) return "mp3";
  const m = fallbackUrl.match(/\.(mp4|jpg|jpeg|png|webp|mp3)(?:\?|$)/i);
  return m?.[1]?.toLowerCase() ?? "bin";
}

/**
 * Streams a resolved media file (from one of the downloader providers) back
 * through our own origin so the browser triggers a direct file download
 * instead of navigating to a third-party CDN in a new tab.
 */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const target = new URL(req.url).searchParams.get("url");
  const name = new URL(req.url).searchParams.get("name") ?? "spideybot-media";
  if (!target) return new Response("Missing url", { status: 400 });

  let parsed: URL;
  try {
    parsed = assertPublicUrl(target);
  } catch (err) {
    return new Response((err as Error).message, { status: 400 });
  }

  try {
    const upstream = await fetchWithTimeout(parsed.toString(), { timeoutMs: 60_000 });
    if (!upstream.ok || !upstream.body) {
      return new Response(`Upstream returned HTTP ${upstream.status}`, { status: 502 });
    }
    const contentType = upstream.headers.get("content-type");
    const ext = extFromType(contentType, parsed.toString());
    const filename = `${name.replace(/[^a-z0-9-_]+/gi, "_").slice(0, 60) || "spideybot-media"}.${ext}`;

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "content-type": contentType ?? "application/octet-stream",
        "content-disposition": `attachment; filename="${filename}"`,
        ...(upstream.headers.get("content-length")
          ? { "content-length": upstream.headers.get("content-length")! }
          : {}),
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    return new Response(`Gagal mengambil media: ${(err as Error).message}`, { status: 502 });
  }
}
