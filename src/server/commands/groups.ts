import { db } from "@/db";
import { groupSettings, warnings, bots } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import type { CommandContext, CommandDef } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function getGroupSettings(botId: string, jid: string) {
  const rows = await db
    .select()
    .from(groupSettings)
    .where(and(eq(groupSettings.botId, botId), eq(groupSettings.jid, jid)))
    .limit(1);
  if (rows[0]) return rows[0];
  const inserted = await db.insert(groupSettings).values({ botId, jid }).returning();
  return inserted[0];
}

export async function toggleGroupSetting(
  botId: string,
  jid: string,
  key: "antilink" | "antidelete" | "antitag" | "welcome" | "warningEnabled" | "muted",
  value: boolean,
) {
  await getGroupSettings(botId, jid);
  await db
    .update(groupSettings)
    .set({ [key]: value, updatedAt: new Date() })
    .where(and(eq(groupSettings.botId, botId), eq(groupSettings.jid, jid)));
  return getGroupSettings(botId, jid);
}

function mentionOf(ctx: CommandContext): string | null {
  const ctxInfo = ctx.msg.message?.extendedTextMessage?.contextInfo;
  const mentioned: string[] = ctxInfo?.mentionedJid ?? [];
  if (mentioned[0]) return mentioned[0];
  if (ctxInfo?.participant) return ctxInfo.participant;
  const numeric = ctx.args[0]?.replace(/[^0-9]/g, "");
  if (numeric && numeric.length > 5) return `${numeric}@s.whatsapp.net`;
  return null;
}

const toggle =
  (key: "antilink" | "antidelete" | "antitag" | "welcome" | "muted", label: string) =>
  async (ctx: CommandContext) => {
    const mode = ctx.args[0]?.toLowerCase();
    if (!["on", "off"].includes(mode ?? "")) return ctx.reply(`Usage: ${ctx.prefix}${label} on|off`);
    const next = await toggleGroupSetting(ctx.rt.id, ctx.from, key, mode === "on");
    await ctx.reply(`✅ ${label} is now *${(next as any)[key] ? "ON" : "OFF"}* for this group.`);
  };

export const groupCommands: CommandDef[] = [
  {
    name: "antilink",
    category: "groups",
    description: "Delete messages containing links (bot must be admin)",
    usage: ".antilink on|off",
    groupOnly: true,
    adminOnly: true,
    run: toggle("antilink", "antilink"),
  },
  {
    name: "antidelete",
    category: "groups",
    description: "Re-post messages that members delete",
    usage: ".antidelete on|off",
    groupOnly: true,
    adminOnly: true,
    run: toggle("antidelete", "antidelete"),
  },
  {
    name: "antilinkstatus",
    category: "groups",
    description: "Show all protection toggles for this group",
    groupOnly: true,
    async run(ctx) {
      const s = await getGroupSettings(ctx.rt.id, ctx.from);
      await ctx.reply(
        `🛡 *GROUP PROTECTION*\n\n🔗 antilink: ${s.antilink ? "ON" : "OFF"}\n🗑 antidelete: ${
          s.antidelete ? "ON" : "OFF"
        }\n🚫 antitag: ${s.antitag ? "ON" : "OFF"}\n👋 welcome: ${s.welcome ? "ON" : "OFF"}\n⚠️ warnings: ${
          s.warningEnabled ? "ON" : "OFF"
        } (limit ${s.warnLimit})\n🔇 muted: ${s.muted ? "ON" : "OFF"}`,
      );
    },
  },
  {
    name: "antitagstatus",
    category: "groups",
    description: "Block status/broadcast mentions inside the group",
    usage: ".antitagstatus on|off",
    groupOnly: true,
    adminOnly: true,
    run: toggle("antitag", "antitagstatus"),
  },
  {
    name: "welcome",
    category: "groups",
    description: "Enable welcome/goodbye announcements",
    usage: ".welcome on|off | .welcome text <message>",
    groupOnly: true,
    adminOnly: true,
    async run(ctx) {
      if (ctx.args[0]?.toLowerCase() === "text") {
        const text = ctx.args.slice(1).join(" ");
        if (!text) return ctx.reply("Provide the welcome text after `text`.");
        await getGroupSettings(ctx.rt.id, ctx.from);
        await db
          .update(groupSettings)
          .set({ welcomeText: text, welcome: true, updatedAt: new Date() })
          .where(and(eq(groupSettings.botId, ctx.rt.id), eq(groupSettings.jid, ctx.from)));
        return ctx.reply("✅ Welcome message updated.");
      }
      return toggle("welcome", "welcome")(ctx);
    },
  },
  {
    name: "tagall",
    category: "groups",
    description: "Mention every participant of the group",
    groupOnly: true,
    adminOnly: true,
    async run(ctx) {
      const meta = ctx.groupMeta ?? (await ctx.sock.groupMetadata(ctx.from));
      const participants: any[] = meta.participants ?? [];
      const note = ctx.args.join(" ") || "Attention please";
      const text = `🕷️ *TAG ALL*\n${note}\n\n${participants.map((p) => `• @${p.id.split("@")[0]}`).join("\n")}`;
      await ctx.send({ text, mentions: participants.map((p) => p.id) });
    },
  },
  {
    name: "mute",
    category: "groups",
    description: "Close the group (admins only can send)",
    groupOnly: true,
    adminOnly: true,
    async run(ctx) {
      if (!ctx.isBotAdmin) return ctx.reply("❌ I need to be a group admin for that.");
      await ctx.sock.groupSettingUpdate(ctx.from, "announcement");
      await toggleGroupSetting(ctx.rt.id, ctx.from, "muted", true);
      await ctx.reply("🔇 Group muted — only admins can send messages.");
    },
  },
  {
    name: "unmute",
    category: "groups",
    description: "Re-open the group for everyone",
    groupOnly: true,
    adminOnly: true,
    async run(ctx) {
      if (!ctx.isBotAdmin) return ctx.reply("❌ I need to be a group admin for that.");
      await ctx.sock.groupSettingUpdate(ctx.from, "not_announcement");
      await toggleGroupSetting(ctx.rt.id, ctx.from, "muted", false);
      await ctx.reply("🔊 Group un-muted.");
    },
  },
  {
    name: "grouplock",
    category: "groups",
    description: "Lock/unlock group info editing",
    usage: ".grouplock on|off",
    groupOnly: true,
    adminOnly: true,
    async run(ctx) {
      if (!ctx.isBotAdmin) return ctx.reply("❌ I need to be a group admin for that.");
      const mode = ctx.args[0]?.toLowerCase();
      if (!["on", "off"].includes(mode ?? "")) return ctx.reply(`Usage: ${ctx.prefix}grouplock on|off`);
      await ctx.sock.groupSettingUpdate(ctx.from, mode === "on" ? "locked" : "unlocked");
      await ctx.reply(`🔒 Group info editing is now ${mode === "on" ? "locked to admins" : "open"}.`);
    },
  },
  {
    name: "statusgroup",
    category: "groups",
    description: "Show live group metadata from WhatsApp",
    groupOnly: true,
    async run(ctx) {
      const meta = ctx.groupMeta ?? (await ctx.sock.groupMetadata(ctx.from));
      const admins = (meta.participants ?? []).filter((p: any) => p.admin).length;
      await ctx.reply(
        `👥 *${meta.subject}*\n\n🆔 ${meta.id}\n👤 Members: ${meta.participants?.length ?? 0}\n🛡 Admins: ${admins}\n📅 Created: ${
          meta.creation ? new Date(meta.creation * 1000).toISOString().slice(0, 10) : "unknown"
        }\n🔒 Announcement: ${meta.announce ? "yes" : "no"}\n📝 Description: ${meta.desc ?? "-"}`,
      );
    },
  },
  {
    name: "revokelink",
    category: "groups",
    description: "Revoke the current group invite link",
    groupOnly: true,
    adminOnly: true,
    async run(ctx) {
      if (!ctx.isBotAdmin) return ctx.reply("❌ I need to be a group admin for that.");
      const code = await ctx.sock.groupRevokeInvite(ctx.from);
      await ctx.reply(`♻️ Invite link revoked. New link:\nhttps://chat.whatsapp.com/${code}`);
    },
  },
  {
    name: "leave",
    category: "groups",
    description: "Make the bot leave this group",
    groupOnly: true,
    adminOnly: true,
    async run(ctx) {
      await ctx.reply("👋 Leaving this group. Bye!");
      await ctx.sock.groupLeave(ctx.from);
    },
  },
  {
    name: "warn",
    category: "groups",
    description: "Warn a member (auto-removal at the configured limit)",
    usage: ".warn @user reason",
    groupOnly: true,
    adminOnly: true,
    async run(ctx) {
      const target = mentionOf(ctx);
      if (!target) return ctx.reply("❌ Mention or reply to the member you want to warn.");
      const settings = await getGroupSettings(ctx.rt.id, ctx.from);
      const reason = ctx.args.filter((a) => !a.startsWith("@")).join(" ") || "no reason given";
      const rows = await db
        .insert(warnings)
        .values({ botId: ctx.rt.id, jid: ctx.from, memberJid: target, count: 1, reason })
        .onConflictDoUpdate({
          target: [warnings.botId, warnings.jid, warnings.memberJid],
          set: { count: sql`${warnings.count} + 1`, reason, updatedAt: new Date() },
        })
        .returning();
      const count = rows[0]?.count ?? 1;
      await ctx.send({
        text: `⚠️ @${target.split("@")[0]} warned (${count}/${settings.warnLimit})\nReason: ${reason}`,
        mentions: [target],
      });
      if (count >= settings.warnLimit && ctx.isBotAdmin) {
        await ctx.sock.groupParticipantsUpdate(ctx.from, [target], "remove");
        await db
          .delete(warnings)
          .where(
            and(eq(warnings.botId, ctx.rt.id), eq(warnings.jid, ctx.from), eq(warnings.memberJid, target)),
          );
        await ctx.reply("🚪 Warn limit reached — member removed.");
      }
    },
  },
  {
    name: "unwarn",
    category: "groups",
    description: "Remove one warning from a member",
    groupOnly: true,
    adminOnly: true,
    async run(ctx) {
      const target = mentionOf(ctx);
      if (!target) return ctx.reply("❌ Mention the member.");
      await db
        .update(warnings)
        .set({ count: sql`GREATEST(${warnings.count} - 1, 0)`, updatedAt: new Date() })
        .where(and(eq(warnings.botId, ctx.rt.id), eq(warnings.jid, ctx.from), eq(warnings.memberJid, target)));
      await ctx.send({ text: `✅ Removed one warning from @${target.split("@")[0]}`, mentions: [target] });
    },
  },
  {
    name: "mywarn",
    category: "groups",
    description: "Show your own warning counter",
    groupOnly: true,
    async run(ctx) {
      const rows = await db
        .select()
        .from(warnings)
        .where(
          and(eq(warnings.botId, ctx.rt.id), eq(warnings.jid, ctx.from), eq(warnings.memberJid, ctx.sender)),
        )
        .limit(1);
      const settings = await getGroupSettings(ctx.rt.id, ctx.from);
      await ctx.reply(`⚠️ Your warnings: *${rows[0]?.count ?? 0}/${settings.warnLimit}*`);
    },
  },
  {
    name: "afk",
    category: "groups",
    description: "Mark yourself AFK — the bot answers when you are tagged",
    usage: ".afk <reason>",
    groupOnly: true,
    async run(ctx) {
      const { setAfk } = await import("./state");
      const reason = ctx.args.join(" ") || "AFK";
      setAfk(ctx.rt.id, ctx.sender, reason);
      await ctx.reply(`😴 You are now AFK: ${reason}`);
    },
  },
  {
    name: "adminnotify",
    category: "groups",
    description: "Ping every admin of the group",
    groupOnly: true,
    async run(ctx) {
      const meta = ctx.groupMeta ?? (await ctx.sock.groupMetadata(ctx.from));
      const admins = (meta.participants ?? []).filter((p: any) => p.admin).map((p: any) => p.id);
      if (!admins.length) return ctx.reply("No admins found.");
      await ctx.send({
        text: `🚨 *ADMIN NOTIFY*\n${ctx.args.join(" ") || "An admin is needed here."}\n\n${admins
          .map((a: string) => `@${a.split("@")[0]}`)
          .join(" ")}`,
        mentions: admins,
      });
    },
  },
  {
    name: "custom",
    category: "groups",
    description: "Store a custom auto-reply keyword for this group",
    usage: ".custom <keyword> | <response>",
    groupOnly: true,
    adminOnly: true,
    async run(ctx) {
      const raw = ctx.args.join(" ");
      const [keyword, response] = raw.split("|").map((s) => s.trim());
      if (!keyword || !response) return ctx.reply(`Usage: ${ctx.prefix}custom keyword | response`);
      const { setCustomReply } = await import("./state");
      setCustomReply(ctx.rt.id, ctx.from, keyword.toLowerCase(), response);
      await ctx.reply(`✅ Custom reply saved for *${keyword}*.`);
    },
  },
  {
    name: "readviewonce",
    category: "groups",
    description: "Re-send a quoted view-once message",
    async run(ctx) {
      const quoted = ctx.msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      const voWrapper = quoted?.viewOnceMessageV2 ?? quoted?.viewOnceMessage ?? quoted?.viewOnceMessageV2Extension;
      const inner = voWrapper?.message ?? quoted;
      if (!inner?.imageMessage && !inner?.videoMessage) return ctx.reply("❌ Reply to a view-once photo or video.");
      const baileys: any = await import("@whiskeysockets/baileys");
      const download = baileys.downloadMediaMessage ?? baileys.default?.downloadMediaMessage;
      const buffer = (await download(
        { key: ctx.msg.message.extendedTextMessage.contextInfo, message: inner },
        "buffer",
        {},
      )) as Buffer;
      if (inner.imageMessage) await ctx.send({ image: buffer, caption: "🕷️ view-once unlocked" });
      else await ctx.send({ video: buffer, caption: "🕷️ view-once unlocked" });
    },
  },
  {
    name: "setpp",
    category: "groups",
    description: "Set the group profile picture from a quoted image",
    groupOnly: true,
    adminOnly: true,
    requires: ["sharp"],
    async run(ctx) {
      if (!ctx.isBotAdmin) return ctx.reply("❌ I need to be a group admin for that.");
      const media = await ctx.downloadMedia();
      if (!media?.mimetype.startsWith("image/")) return ctx.reply("❌ Reply to an image.");
      const sharpMod: any = await import("sharp");
      const sharp = sharpMod.default ?? sharpMod;
      const jpeg = await sharp(media.buffer).resize(640, 640, { fit: "cover" }).jpeg().toBuffer();
      await ctx.sock.updateProfilePicture(ctx.from, jpeg);
      await ctx.reply("🖼 Group picture updated.");
    },
  },
];

export const ownerCommands: CommandDef[] = [
  {
    name: "addowner",
    category: "owner",
    description: "Set/replace the owner number of this SpideyBot",
    usage: ".addowner 6281234567890",
    ownerOnly: true,
    async run(ctx) {
      const number = ctx.args[0]?.replace(/[^0-9]/g, "");
      if (!number || number.length < 7) return ctx.reply("Usage: .addowner <international number>");
      await db.update(bots).set({ ownerNumber: number, updatedAt: new Date() }).where(eq(bots.id, ctx.rt.id));
      ctx.rt.ownerNumber = number;
      await ctx.reply(`👑 Owner updated to +${number}`);
    },
  },
];
