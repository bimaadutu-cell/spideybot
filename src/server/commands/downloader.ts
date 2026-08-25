import { runDownload, detectPlatform } from "@/server/downloader/engine";
import type { CommandDef, CommandContext } from "./types";

async function handle(ctx: CommandContext, expected: "tiktok" | "instagram" | "youtube") {
  const url = ctx.args[0];
  if (!url) return ctx.reply(`Usage: ${ctx.prefix}${expected} <url>`);
  const platform = detectPlatform(url);
  if (platform !== expected) {
    return ctx.reply(`❌ That does not look like a ${expected} URL.`);
  }
  await ctx.reply(`📥 SPIDEY DOWNLOADER — resolving ${expected} link…`);
  const res = await runDownload({ url, userId: ctx.rt.userId, botId: ctx.rt.id });
  if (!res.ok) {
    return ctx.reply(`❌ Download failed.\n\n${res.error}`);
  }
  ctx.rt.stats.downloads += 1;
  const best = res.result.media.find((m) => m.type === "video") ?? res.result.media[0];
  const caption = [
    "🕷️ *SPIDEY DOWNLOADER*",
    res.result.title ? `📝 ${res.result.title.slice(0, 300)}` : "",
    res.result.author ? `👤 ${res.result.author}` : "",
    `🔌 Provider: ${res.result.provider}`,
    `⏱ ${res.durationMs} ms`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    if (best.type === "video") {
      await ctx.send({ video: { url: best.url }, caption, mimetype: "video/mp4" });
    } else if (best.type === "image") {
      await ctx.send({ image: { url: best.url }, caption });
    } else {
      await ctx.send({ audio: { url: best.url }, mimetype: "audio/mpeg" });
      await ctx.reply(caption);
    }
    const extras = res.result.media.filter((m) => m !== best && m.type === "image").slice(0, 9);
    for (const extra of extras) await ctx.send({ image: { url: extra.url } });
  } catch (err) {
    await ctx.reply(
      `${caption}\n\n⚠️ Could not upload the file to WhatsApp (${(err as Error).message}).\nDirect link:\n${best.url}`,
    );
  }
}

export const downloaderCommands: CommandDef[] = [
  {
    name: "tiktok",
    category: "downloader",
    description: "Download a TikTok video/photo (TikWM → TiklyDown → SnapTik fallback)",
    usage: ".tiktok <url>",
    run: (ctx) => handle(ctx, "tiktok"),
  },
  {
    name: "instagram",
    category: "downloader",
    description: "Download Instagram reels/posts (SnapInsta → GraphQL → SnapSave fallback)",
    usage: ".instagram <url>",
    run: (ctx) => handle(ctx, "instagram"),
  },
  {
    name: "youtube",
    category: "downloader",
    description: "Download YouTube media (Cobalt → YouTubeSave fallback)",
    usage: ".youtube <url>",
    run: (ctx) => handle(ctx, "youtube"),
  },
];
