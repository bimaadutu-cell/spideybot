import { db } from "@/db";
import { commandUsage, botSettings } from "@/db/schema";
import { and, eq, gte, sql } from "drizzle-orm";
import type { CommandDef } from "./types";
import { commandAvailability, fmtDuration } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const generalCommands: CommandDef[] = [
  {
    name: "ping",
    category: "general",
    description: "Measure real round-trip latency and show uptime",
    async run(ctx) {
      const t0 = Date.now();
      await ctx.reply("🕷️ pinging…");
      const rtt = Date.now() - t0;
      const uptime = ctx.rt.connectedAt ? fmtDuration(Date.now() - ctx.rt.connectedAt) : "not connected";
      await ctx.reply(
        `🕷️ *SPIDEYBOT*\n\n⚡ Round-trip: *${rtt} ms*\n🟢 Uptime: *${uptime}*\n💬 Messages seen: *${ctx.rt.stats.messages}*\n⚙️ Commands run: *${ctx.rt.stats.commands}*`,
      );
    },
  },
  {
    name: "menu",
    category: "general",
    description: "Command menu generated from the live registry",
    async run(ctx) {
      const { allCommands } = await import("./registry");
      const groupsByCat = new Map<string, string[]>();
      for (const def of allCommands()) {
        const { available } = await commandAvailability(def);
        if (!available) continue;
        const list = groupsByCat.get(def.category) ?? [];
        list.push(`${ctx.prefix}${def.name}`);
        groupsByCat.set(def.category, list);
      }
      const icons: Record<string, string> = {
        general: "🧭",
        downloader: "📥",
        games: "🎮",
        groups: "👥",
        owner: "👑",
        tools: "🛠",
      };
      let out = `🕷️ *SPIDEYBOT*\n_Powerful WhatsApp Automation Platform_\n\n👤 ${ctx.rt.name}\n🔣 Prefix: *${ctx.prefix}*\n\n`;
      for (const [cat, list] of [...groupsByCat.entries()].sort()) {
        out += `${icons[cat] ?? "•"} *${cat.toUpperCase()}*\n${list.sort().map((c) => `  ⟡ ${c}`).join("\n")}\n\n`;
      }
      out += `_Use ${ctx.prefix}cmdinfo <command> for details._`;
      await ctx.reply(out.trim());
    },
  },
  {
    name: "cmdinfo",
    category: "general",
    description: "Show details for one command",
    usage: ".cmdinfo ping",
    async run(ctx) {
      const { findCommand } = await import("./registry");
      const target = ctx.args[0]?.replace(/^\./, "");
      if (!target) return ctx.reply(`Usage: ${ctx.prefix}cmdinfo <command>`);
      const def = findCommand(target);
      if (!def) return ctx.reply(`❌ Command *${target}* is not registered.`);
      const { available, blockers } = await commandAvailability(def);
      await ctx.reply(
        [
          `🕷️ *${ctx.prefix}${def.name}*`,
          `📂 Category: ${def.category}`,
          `📝 ${def.description}`,
          def.usage ? `💡 Usage: ${def.usage}` : "",
          `🔐 Owner only: ${def.ownerOnly ? "yes" : "no"}`,
          `👥 Group only: ${def.groupOnly ? "yes" : "no"}`,
          `🛡 Admin only: ${def.adminOnly ? "yes" : "no"}`,
          `⚙️ Status: ${available ? "available" : `unavailable — ${blockers.join(", ")}`}`,
        ]
          .filter(Boolean)
          .join("\n"),
      );
    },
  },
  {
    name: "limit",
    category: "general",
    description: "Show your command usage for the last 24h (real counters)",
    async run(ctx) {
      const since = new Date(Date.now() - 86400_000);
      const rows = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(commandUsage)
        .where(
          and(
            eq(commandUsage.botId, ctx.rt.id),
            eq(commandUsage.senderJid, ctx.sender),
            gte(commandUsage.createdAt, since),
          ),
        );
      const used = rows[0]?.total ?? 0;
      const settings = await db
        .select({ limit: botSettings.rateLimitPerMinute })
        .from(botSettings)
        .where(eq(botSettings.botId, ctx.rt.id))
        .limit(1);
      await ctx.reply(
        `🕷️ Usage in the last 24h: *${used}* commands\nRate limit: *${settings[0]?.limit ?? 20}* commands / minute`,
      );
    },
  },
  {
    name: "donate",
    category: "general",
    description: "Support information for this SpideyBot deployment",
    async run(ctx) {
      await ctx.reply(
        "🕷️ *Support SPIDEYBOT*\n\nThis instance is self-hosted. Ask the operator of this bot for donation details — no payment channel is configured inside the bot itself.",
      );
    },
  },
  {
    name: "sticker",
    category: "general",
    description: "Convert a quoted/attached image into a WhatsApp sticker",
    usage: ".sticker (reply to an image)",
    requires: ["sharp"],
    async run(ctx) {
      const media = await ctx.downloadMedia();
      if (!media) return ctx.reply("❌ Reply to an image with .sticker");
      if (!media.mimetype.startsWith("image/")) return ctx.reply("❌ Only images can be converted (video needs ffmpeg).");
      const sharpMod: any = await import("sharp");
      const sharp = sharpMod.default ?? sharpMod;
      const webp = await sharp(media.buffer)
        .resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .webp({ quality: 85 })
        .toBuffer();
      await ctx.send({ sticker: webp });
    },
  },
  {
    name: "toimage",
    category: "general",
    description: "Convert a quoted sticker back into a PNG image",
    requires: ["sharp"],
    async run(ctx) {
      const media = await ctx.downloadMedia();
      if (!media) return ctx.reply("❌ Reply to a sticker with .toimage");
      const sharpMod: any = await import("sharp");
      const sharp = sharpMod.default ?? sharpMod;
      const png = await sharp(media.buffer).png().toBuffer();
      await ctx.send({ image: png, caption: "🕷️ converted by SpideyBot" });
    },
  },
  {
    name: "togif",
    category: "general",
    description: "Convert an animated sticker/video into a GIF (needs ffmpeg)",
    requires: ["ffmpeg"],
    async run(ctx) {
      await ctx.reply("❌ ffmpeg is not installed on this host, so GIF conversion is disabled.");
    },
  },
];
