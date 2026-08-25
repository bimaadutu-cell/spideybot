import { db } from "@/db";
import { botSettings, commandUsage } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { RuntimeBot } from "@/server/bot/manager";
import { logEvent, publish } from "@/server/events/bus";
import { findCommand, isCommandEnabled } from "./registry";
import { commandAvailability, type CommandContext } from "./types";
import { getGroupSettings } from "./groups";
import { checkQuizAnswer } from "./games";
import { getAfk, clearAfk, getCustomReply, cacheMessage, readCachedMessage } from "./state";

/* eslint-disable @typescript-eslint/no-explicit-any */

const LINK_RE = /(https?:\/\/|www\.)[^\s]+|chat\.whatsapp\.com\/[A-Za-z0-9]+/i;

function extractText(msg: any): string {
  const m = msg.message ?? {};
  return (
    m.conversation ??
    m.extendedTextMessage?.text ??
    m.imageMessage?.caption ??
    m.videoMessage?.caption ??
    m.documentMessage?.caption ??
    m.buttonsResponseMessage?.selectedButtonId ??
    m.listResponseMessage?.singleSelectReply?.selectedRowId ??
    ""
  );
}

const rateBuckets = new Map<string, { count: number; resetAt: number }>();
function rateLimited(key: string, limit: number) {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    rateBuckets.set(key, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  bucket.count += 1;
  return bucket.count > limit;
}

async function settingsFor(botId: string) {
  const rows = await db.select().from(botSettings).where(eq(botSettings.botId, botId)).limit(1);
  if (rows[0]) return rows[0];
  const inserted = await db.insert(botSettings).values({ botId }).returning();
  return inserted[0];
}

export async function handleIncomingMessage(rt: RuntimeBot, msg: any) {
  if (!rt.sock) return;
  const from: string = msg.key?.remoteJid ?? "";
  if (!from || from === "status@broadcast") return;
  const isGroup = from.endsWith("@g.us");
  const sender: string = isGroup ? (msg.key.participant ?? msg.participant ?? from) : from;
  const body = extractText(msg);
  const settings = await settingsFor(rt.id);

  if (msg.key?.id && body) {
    cacheMessage(rt.id, msg.key.id, { text: body, sender, ts: Date.now() });
  }

  // Protocol / revoke messages -> antidelete
  const proto = msg.message?.protocolMessage;
  if (proto?.type === 0 && proto.key?.id && isGroup) {
    const gs = await getGroupSettings(rt.id, from);
    if (gs.antidelete) {
      const cached = readCachedMessage(rt.id, proto.key.id);
      if (cached) {
        await rt.sock.sendMessage(from, {
          text: `🗑 *ANTI-DELETE*\n@${cached.sender.split("@")[0]} deleted:\n\n${cached.text}`,
          mentions: [cached.sender],
        });
      }
    }
    return;
  }

  if (msg.key?.fromMe) return;
  if (settings.groupsOnly && !isGroup) return;
  if (settings.autoRead) await rt.sock.readMessages([msg.key]).catch(() => undefined);

  const senderNumber = sender.split("@")[0].split(":")[0];
  const ownerNumber = rt.ownerNumber?.replace(/[^0-9]/g, "") ?? null;
  const isOwner = Boolean(ownerNumber && senderNumber === ownerNumber);
  if (settings.selfMode && !isOwner) return;

  let groupMeta: any = null;
  let isSenderAdmin = false;
  let isBotAdmin = false;
  if (isGroup) {
    try {
      groupMeta = await rt.sock.groupMetadata(from);
      const myNumber = (rt.jid ?? "").split("@")[0].split(":")[0];
      for (const p of groupMeta.participants ?? []) {
        const num = p.id.split("@")[0].split(":")[0];
        if (num === senderNumber && p.admin) isSenderAdmin = true;
        if (num === myNumber && p.admin) isBotAdmin = true;
      }
    } catch {
      /* metadata unavailable */
    }

    const gs = await getGroupSettings(rt.id, from);

    // AFK mention responder
    const mentioned: string[] = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid ?? [];
    for (const jid of mentioned) {
      const afk = getAfk(rt.id, jid);
      if (afk) {
        await rt.sock.sendMessage(from, {
          text: `😴 @${jid.split("@")[0]} is AFK: ${afk.reason} (${Math.round(
            (Date.now() - afk.since) / 60000,
          )}m ago)`,
          mentions: [jid],
        });
      }
    }
    if (getAfk(rt.id, sender) && body) {
      clearAfk(rt.id, sender);
      await rt.sock.sendMessage(from, { text: `👋 Welcome back @${senderNumber}`, mentions: [sender] });
    }

    // Anti-link
    if (gs.antilink && !isSenderAdmin && LINK_RE.test(body)) {
      if (isBotAdmin) {
        await rt.sock.sendMessage(from, { delete: msg.key }).catch(() => undefined);
        await rt.sock.sendMessage(from, {
          text: `🔗 *ANTI-LINK* — link from @${senderNumber} removed.`,
          mentions: [sender],
        });
      } else {
        await rt.sock.sendMessage(from, {
          text: `🔗 Link detected from @${senderNumber}, but I am not an admin so I cannot delete it.`,
          mentions: [sender],
        });
      }
      await logEvent({
        userId: rt.userId,
        botId: rt.id,
        channel: "GROUP",
        level: "warn",
        message: `Anti-link triggered in ${groupMeta?.subject ?? from}`,
        persist: false,
      });
      return;
    }

    // Anti-tag (status/broadcast mentions)
    if (gs.antitag && !isSenderAdmin && msg.message?.groupStatusMentionMessage) {
      if (isBotAdmin) await rt.sock.sendMessage(from, { delete: msg.key }).catch(() => undefined);
      return;
    }

    if (gs.muted && !isSenderAdmin) return;

    const custom = getCustomReply(rt.id, from, body);
    if (custom) {
      await rt.sock.sendMessage(from, { text: custom }, { quoted: msg });
      return;
    }
  }

  // Quiz answers
  if (body && !body.startsWith(rt.prefix)) {
    const quizResult = checkQuizAnswer(rt.id, from, body);
    if (quizResult?.correct) {
      await rt.sock.sendMessage(
        from,
        { text: `🎉 Correct! The answer was *${quizResult.answer}*.`, mentions: [sender] },
        { quoted: msg },
      );
    }
    return;
  }

  if (!body.startsWith(rt.prefix)) return;

  const withoutPrefix = body.slice(rt.prefix.length).trim();
  if (!withoutPrefix) return;
  const [rawCmd, ...args] = withoutPrefix.split(/\s+/);
  const def = findCommand(rawCmd);
  if (!def) return;

  if (rateLimited(`${rt.id}:${sender}`, settings.rateLimitPerMinute)) {
    await rt.sock.sendMessage(from, { text: "⏳ Rate limit reached, slow down a little." }, { quoted: msg });
    return;
  }

  const enabled = await isCommandEnabled(rt.id, def.name);
  if (!enabled) {
    await rt.sock.sendMessage(from, { text: `🚫 ${rt.prefix}${def.name} is disabled for this bot.` }, { quoted: msg });
    return;
  }
  if (def.category === "downloader" && !settings.downloaderEnabled) {
    await rt.sock.sendMessage(from, { text: "🚫 The downloader engine is disabled for this bot." }, { quoted: msg });
    return;
  }
  if (def.category === "games" && !settings.gamesEnabled) {
    await rt.sock.sendMessage(from, { text: "🚫 Games are disabled for this bot." }, { quoted: msg });
    return;
  }
  const { available, blockers } = await commandAvailability(def);
  if (!available) {
    await rt.sock.sendMessage(
      from,
      { text: `⚠️ ${rt.prefix}${def.name} is unavailable: ${blockers.join(", ")}` },
      { quoted: msg },
    );
    return;
  }
  if (def.ownerOnly && !isOwner) {
    await rt.sock.sendMessage(from, { text: "👑 Owner-only command." }, { quoted: msg });
    return;
  }
  if (def.groupOnly && !isGroup) {
    await rt.sock.sendMessage(from, { text: "👥 This command only works inside groups." }, { quoted: msg });
    return;
  }
  if (def.adminOnly && isGroup && !isSenderAdmin && !isOwner) {
    await rt.sock.sendMessage(from, { text: "🛡 Group admins only." }, { quoted: msg });
    return;
  }

  const ctx: CommandContext = {
    rt,
    sock: rt.sock,
    msg,
    from,
    sender,
    senderNumber,
    isGroup,
    isOwner,
    isSenderAdmin,
    isBotAdmin,
    prefix: rt.prefix,
    command: def.name,
    args,
    text: args.join(" "),
    body,
    quoted: msg.message?.extendedTextMessage?.contextInfo?.quotedMessage ?? null,
    groupMeta,
    reply: async (text: string) => {
      await rt.sock.sendMessage(from, { text }, { quoted: msg });
    },
    send: async (content: any) => {
      await rt.sock.sendMessage(from, content, { quoted: msg });
    },
    downloadMedia: async () => {
      const baileys: any = await import("@whiskeysockets/baileys");
      const download = baileys.downloadMediaMessage ?? baileys.default?.downloadMediaMessage;
      const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
      const quotedMessage = contextInfo?.quotedMessage;
      const target = quotedMessage
        ? {
            key: {
              remoteJid: from,
              id: contextInfo.stanzaId,
              participant: contextInfo.participant,
              fromMe: false,
            },
            message: quotedMessage,
          }
        : msg;
      const content = target.message ?? {};
      const node =
        content.imageMessage ??
        content.videoMessage ??
        content.stickerMessage ??
        content.audioMessage ??
        content.documentMessage;
      if (!node) return null;
      const buffer = (await download(target, "buffer", {})) as Buffer;
      return { buffer, mimetype: node.mimetype ?? "application/octet-stream" };
    },
  };

  if (settings.autoTyping) await rt.sock.sendPresenceUpdate("composing", from).catch(() => undefined);

  const started = Date.now();
  rt.stats.commands += 1;
  publish({
    type: "bot.command",
    userId: rt.userId,
    botId: rt.id,
    message: `${rt.prefix}${def.name}`,
    payload: { command: def.name, from, sender },
  });

  try {
    await def.run(ctx);
    const durationMs = Date.now() - started;
    await db.insert(commandUsage).values({
      botId: rt.id,
      commandName: def.name,
      chatJid: from,
      senderJid: sender,
      success: true,
      durationMs,
    });
    await logEvent({
      userId: rt.userId,
      botId: rt.id,
      channel: "COMMAND",
      level: "success",
      message: `${rt.prefix}${def.name} executed in ${durationMs}ms`,
      persist: false,
    });
  } catch (err) {
    const durationMs = Date.now() - started;
    const message = (err as Error).message;
    await db.insert(commandUsage).values({
      botId: rt.id,
      commandName: def.name,
      chatJid: from,
      senderJid: sender,
      success: false,
      durationMs,
      error: message,
    });
    await logEvent({
      userId: rt.userId,
      botId: rt.id,
      channel: "ERROR",
      level: "error",
      message: `${rt.prefix}${def.name} failed: ${message}`,
    });
    await rt.sock
      .sendMessage(from, { text: `❌ Command failed: ${message}` }, { quoted: msg })
      .catch(() => undefined);
  }
}

export async function handleGroupParticipantsUpdate(rt: RuntimeBot, update: any) {
  if (!rt.sock) return;
  const { id, participants, action } = update;
  const gs = await getGroupSettings(rt.id, id);
  if (!gs.welcome) return;
  for (const jid of participants ?? []) {
    if (action === "add") {
      const text = (gs.welcomeText ?? "👋 Welcome @user to the group!").replace("@user", `@${jid.split("@")[0]}`);
      await rt.sock.sendMessage(id, { text, mentions: [jid] }).catch(() => undefined);
    } else if (action === "remove") {
      await rt.sock
        .sendMessage(id, { text: `👋 @${jid.split("@")[0]} left the group.`, mentions: [jid] })
        .catch(() => undefined);
    }
  }
}
