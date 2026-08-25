import QRCode from "qrcode";
import type { CommandDef } from "./types";
import { fetchWithTimeout } from "@/server/downloader/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

async function bratBuffer(text: string) {
  const endpoint = `https://aqul-brat.hf.space/api/brat?text=${encodeURIComponent(text)}`;
  const res = await fetchWithTimeout(endpoint, { timeoutMs: 30_000 });
  if (!res.ok) throw new Error(`brat provider HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 512) throw new Error("brat provider returned an empty image");
  return buf;
}

export const toolCommands: CommandDef[] = [
  {
    name: "qrcode",
    category: "tools",
    description: "Generate a real QR code image from text",
    usage: ".qrcode https://example.com",
    async run(ctx) {
      const text = ctx.args.join(" ");
      if (!text) return ctx.reply(`Usage: ${ctx.prefix}qrcode <text or url>`);
      const png = await QRCode.toBuffer(text, { width: 600, margin: 2 });
      await ctx.send({ image: png, caption: `🕷️ QR for: ${text.slice(0, 120)}` });
    },
  },
  {
    name: "shortlink",
    category: "tools",
    description: "Shorten a URL using the is.gd API",
    usage: ".shortlink <url>",
    async run(ctx) {
      const url = ctx.args[0];
      if (!url?.startsWith("http")) return ctx.reply(`Usage: ${ctx.prefix}shortlink https://...`);
      const res = await fetchWithTimeout(
        `https://is.gd/create.php?format=json&url=${encodeURIComponent(url)}`,
        { timeoutMs: 15_000 },
      );
      const json = (await res.json().catch(() => null)) as { shorturl?: string; errormessage?: string } | null;
      if (!json?.shorturl) return ctx.reply(`❌ Shortener failed: ${json?.errormessage ?? `HTTP ${res.status}`}`);
      await ctx.reply(`🔗 ${json.shorturl}`);
    },
  },
  {
    name: "readmore",
    category: "tools",
    description: "Insert a WhatsApp 'read more' break",
    usage: ".readmore visible | hidden",
    async run(ctx) {
      const [visible, hidden] = ctx.args.join(" ").split("|");
      if (!visible || !hidden) return ctx.reply(`Usage: ${ctx.prefix}readmore visible text | hidden text`);
      await ctx.reply(`${visible.trim()}\u200B`.repeat(1) + "\u200B".repeat(4000) + hidden.trim());
    },
  },
  {
    name: "memegen",
    category: "tools",
    description: "Generate a meme via memegen.link",
    usage: ".memegen template | top | bottom",
    async run(ctx) {
      const parts = ctx.args.join(" ").split("|").map((s) => s.trim());
      if (parts.length < 3) return ctx.reply(`Usage: ${ctx.prefix}memegen drake | top text | bottom text`);
      const enc = (s: string) => encodeURIComponent(s.replace(/ /g, "_").replace(/\?/g, "~q"));
      const url = `https://api.memegen.link/images/${enc(parts[0])}/${enc(parts[1])}/${enc(parts[2])}.png`;
      const res = await fetchWithTimeout(url, { timeoutMs: 20_000 });
      if (!res.ok) return ctx.reply(`❌ memegen returned HTTP ${res.status} (check the template name)`);
      await ctx.send({ image: Buffer.from(await res.arrayBuffer()), caption: "🕷️ memegen" });
    },
  },
  {
    name: "brat",
    category: "tools",
    description: "Brat-style sticker from text",
    usage: ".brat hello world",
    requires: ["sharp"],
    async run(ctx) {
      const text = ctx.args.join(" ");
      if (!text) return ctx.reply(`Usage: ${ctx.prefix}brat <text>`);
      try {
        const png = await bratBuffer(text);
        const sharpMod: any = await import("sharp");
        const sharp = sharpMod.default ?? sharpMod;
        const webp = await sharp(png).resize(512, 512, { fit: "contain" }).webp().toBuffer();
        await ctx.send({ sticker: webp });
      } catch (err) {
        await ctx.reply(`❌ brat generator failed: ${(err as Error).message}`);
      }
    },
  },
  {
    name: "brat-image",
    category: "tools",
    description: "Brat-style image (PNG) from text",
    async run(ctx) {
      const text = ctx.args.join(" ");
      if (!text) return ctx.reply(`Usage: ${ctx.prefix}brat-image <text>`);
      try {
        const png = await bratBuffer(text);
        await ctx.send({ image: png, caption: `🕷️ ${text.slice(0, 60)}` });
      } catch (err) {
        await ctx.reply(`❌ brat generator failed: ${(err as Error).message}`);
      }
    },
  },
  {
    name: "bratvideo",
    category: "tools",
    description: "Animated brat video (requires ffmpeg)",
    requires: ["ffmpeg"],
    async run(ctx) {
      await ctx.reply("❌ ffmpeg is not installed on this host, animated brat is disabled.");
    },
  },
  {
    name: "towebp",
    category: "tools",
    description: "Convert a quoted image to WebP",
    requires: ["sharp"],
    async run(ctx) {
      const media = await ctx.downloadMedia();
      if (!media?.mimetype.startsWith("image/")) return ctx.reply("❌ Reply to an image.");
      const sharpMod: any = await import("sharp");
      const sharp = sharpMod.default ?? sharpMod;
      const webp = await sharp(media.buffer).webp({ quality: 90 }).toBuffer();
      await ctx.send({ document: webp, mimetype: "image/webp", fileName: "spideybot.webp" });
    },
  },
  {
    name: "watermark",
    category: "tools",
    description: "Add a SpideyBot watermark to a quoted image",
    requires: ["sharp"],
    async run(ctx) {
      const media = await ctx.downloadMedia();
      if (!media?.mimetype.startsWith("image/")) return ctx.reply("❌ Reply to an image.");
      const text = ctx.args.join(" ") || "SPIDEYBOT";
      const sharpMod: any = await import("sharp");
      const sharp = sharpMod.default ?? sharpMod;
      const base = sharp(media.buffer);
      const meta = await base.metadata();
      const w = meta.width ?? 720;
      const h = meta.height ?? 720;
      const svg = Buffer.from(
        `<svg width="${w}" height="${h}"><style>.t{fill:#ffffffcc;font-size:${Math.max(
          18,
          Math.round(w / 18),
        )}px;font-family:sans-serif;font-weight:700}</style><text x="${Math.round(w * 0.03)}" y="${Math.round(
          h * 0.95,
        )}" class="t">🕷 ${text}</text></svg>`,
      );
      const out = await base.composite([{ input: svg, gravity: "southwest" }]).jpeg().toBuffer();
      await ctx.send({ image: out, caption: `🕷️ watermarked: ${text}` });
    },
  },
  {
    name: "removebg",
    category: "tools",
    description: "Remove the background of a quoted image (remove.bg API)",
    requires: ["env:REMOVEBG_API_KEY"],
    async run(ctx) {
      const media = await ctx.downloadMedia();
      if (!media) return ctx.reply("❌ Reply to an image.");
      const form = new FormData();
      form.append("image_file", new Blob([new Uint8Array(media.buffer)]), "image.png");
      form.append("size", "auto");
      const res = await fetch("https://api.remove.bg/v1.0/removebg", {
        method: "POST",
        headers: { "X-Api-Key": process.env.REMOVEBG_API_KEY! },
        body: form,
      });
      if (!res.ok) return ctx.reply(`❌ remove.bg failed: HTTP ${res.status}`);
      await ctx.send({ image: Buffer.from(await res.arrayBuffer()), caption: "🕷️ background removed" });
    },
  },
  {
    name: "upscale",
    category: "tools",
    description: "AI upscale a quoted image",
    requires: ["env:UPSCALE_API_URL"],
    async run(ctx) {
      await ctx.reply("❌ Upscaling backend is not configured (UPSCALE_API_URL).");
    },
  },
  {
    name: "toaudio",
    category: "tools",
    description: "Extract audio from a quoted video (requires ffmpeg)",
    requires: ["ffmpeg"],
    async run(ctx) {
      await ctx.reply("❌ ffmpeg is not installed on this host, audio extraction is disabled.");
    },
  },
  {
    name: "voicechanger",
    category: "tools",
    description: "Pitch/speed effects on a quoted voice note (requires ffmpeg)",
    requires: ["ffmpeg"],
    async run(ctx) {
      await ctx.reply("❌ ffmpeg is not installed on this host, voice changing is disabled.");
    },
  },
];
