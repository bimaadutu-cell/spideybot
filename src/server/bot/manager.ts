import fs from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { bots, botSessions, groups as groupsTable } from "@/db/schema";
import { SESSIONS_DIR, ensureDirs } from "@/server/config";
import { publish, logEvent } from "@/server/events/bus";
import { notify } from "@/server/auth/session";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type BotStatus =
  | "offline"
  | "connecting"
  | "waiting_qr"
  | "pairing"
  | "connected"
  | "disconnected"
  | "reconnecting";

export type RuntimeBot = {
  id: string;
  userId: number;
  name: string;
  prefix: string;
  ownerNumber: string | null;
  sock: any | null;
  status: BotStatus;
  qr: { dataUrl: string; raw: string; expiresAt: number } | null;
  pairing: { code: string; phone: string; expiresAt: number } | null;
  lastError: string | null;
  jid: string | null;
  startedAt: number | null;
  connectedAt: number | null;
  reconnects: number;
  stats: { messages: number; commands: number; downloads: number };
  shuttingDown: boolean;
  saveCreds?: () => Promise<void>;
};

type Registry = Map<string, RuntimeBot>;
const globalForBots = globalThis as typeof globalThis & { __spideyBots?: Registry };

export function registry(): Registry {
  if (!globalForBots.__spideyBots) globalForBots.__spideyBots = new Map();
  return globalForBots.__spideyBots;
}

export function getRuntime(botId: string) {
  return registry().get(botId) ?? null;
}

export function runtimeSnapshot(botId: string) {
  const rt = getRuntime(botId);
  if (!rt) {
    return {
      status: "offline" as BotStatus,
      qr: null,
      pairing: null,
      lastError: null,
      jid: null,
      uptimeMs: 0,
      reconnects: 0,
      stats: { messages: 0, commands: 0, downloads: 0 },
    };
  }
  const now = Date.now();
  return {
    status: rt.status,
    qr: rt.qr && rt.qr.expiresAt > now ? { dataUrl: rt.qr.dataUrl, expiresAt: rt.qr.expiresAt } : null,
    pairing: rt.pairing && rt.pairing.expiresAt > now ? rt.pairing : null,
    lastError: rt.lastError,
    jid: rt.jid,
    uptimeMs: rt.connectedAt ? now - rt.connectedAt : 0,
    reconnects: rt.reconnects,
    stats: rt.stats,
  };
}

export function authDir(botId: string) {
  return path.join(SESSIONS_DIR, botId);
}

async function setStatus(rt: RuntimeBot, status: BotStatus, message?: string) {
  rt.status = status;
  publish({
    type: "bot.status",
    userId: rt.userId,
    botId: rt.id,
    message: message ?? status,
    payload: { status, jid: rt.jid, lastError: rt.lastError },
  });
  try {
    await db
      .update(bots)
      .set({ status, updatedAt: new Date(), ...(rt.jid ? { phoneNumber: rt.jid.split("@")[0].split(":")[0] } : {}) })
      .where(eq(bots.id, rt.id));
  } catch {
    /* ignore */
  }
}

async function loadBaileys() {
  const mod: any = await import("@whiskeysockets/baileys");
  const makeWASocket = mod.default?.default ?? mod.default ?? mod.makeWASocket;
  return { ...mod, makeWASocket } as any;
}

async function silentLogger() {
  const pinoMod: any = await import("pino");
  const pino = pinoMod.default ?? pinoMod;
  return pino({ level: "silent" });
}

export type StartOptions = { pairingPhone?: string };

async function issuePairingCode(rt: RuntimeBot, rawPhone: string) {
  const phone = rawPhone.replace(/[^0-9]/g, "");
  if (!rt.sock || !phone) throw new Error("A valid international phone number is required");
  const code: string = await rt.sock.requestPairingCode(phone);
  rt.qr = null;
  rt.pairing = { code, phone, expiresAt: Date.now() + 120_000 };
  await setStatus(rt, "pairing", "Pairing code issued by WhatsApp");
  publish({ type: "bot.pairing", userId: rt.userId, botId: rt.id, message: "Pairing code issued by WhatsApp", payload: rt.pairing });
  await logEvent({ userId: rt.userId, botId: rt.id, channel: "BAILEYS", message: `Pairing code generated for +${phone}` });
  return runtimeSnapshot(rt.id);
}

export async function startBot(botId: string, opts: StartOptions = {}) {
  ensureDirs();
  const rows = await db.select().from(bots).where(eq(bots.id, botId)).limit(1);
  const bot = rows[0];
  if (!bot) throw new Error("Bot not found");

  const existing = registry().get(botId);
  if (existing && ["connected", "connecting", "waiting_qr", "pairing", "reconnecting"].includes(existing.status)) {
    if (opts.pairingPhone && existing.sock && existing.status !== "connected") {
      try {
        return await issuePairingCode(existing, opts.pairingPhone);
      } catch (err) {
        existing.lastError = `Pairing failed: ${(err as Error).message}`;
        await setStatus(existing, "disconnected", existing.lastError);
        throw err;
      }
    }
    return runtimeSnapshot(botId);
  }
  if (existing?.sock) {
    try {
      existing.shuttingDown = true;
      existing.sock.end(undefined);
    } catch {
      /* ignore */
    }
  }

  const rt: RuntimeBot = existing ?? {
    id: bot.id,
    userId: bot.userId,
    name: bot.name,
    prefix: bot.prefix,
    ownerNumber: bot.ownerNumber,
    sock: null,
    status: "offline",
    qr: null,
    pairing: null,
    lastError: null,
    jid: null,
    startedAt: null,
    connectedAt: null,
    reconnects: 0,
    stats: { messages: 0, commands: 0, downloads: 0 },
    shuttingDown: false,
  };
  rt.name = bot.name;
  rt.prefix = bot.prefix;
  rt.ownerNumber = bot.ownerNumber;
  rt.shuttingDown = false;
  rt.lastError = null;
  rt.startedAt = Date.now();
  registry().set(botId, rt);

  await setStatus(rt, "connecting", "Initialising Baileys engine");
  await logEvent({
    userId: rt.userId,
    botId: rt.id,
    channel: "BAILEYS",
    message: `Starting ${rt.name} with @whiskeysockets/baileys@6.7.22`,
  });

  const baileys = await loadBaileys();
  const dir = authDir(botId);
  await fs.mkdir(dir, { recursive: true });
  const { state, saveCreds } = await baileys.useMultiFileAuthState(dir);
  rt.saveCreds = saveCreds;

  let version: number[] | undefined;
  try {
    const fetched = await baileys.fetchLatestBaileysVersion();
    version = fetched.version;
    await logEvent({
      userId: rt.userId,
      botId: rt.id,
      channel: "BAILEYS",
      message: `WhatsApp Web version ${version?.join(".")}`,
      persist: false,
    });
  } catch (err) {
    await logEvent({
      userId: rt.userId,
      botId: rt.id,
      channel: "BAILEYS",
      level: "warn",
      message: `Could not fetch latest WA version (${(err as Error).message}) — using bundled default`,
      persist: false,
    });
  }

  const logger = await silentLogger();
  const usePairing = Boolean(opts.pairingPhone) && !state.creds.registered;

  const sock = baileys.makeWASocket({
    version,
    logger,
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys: baileys.makeCacheableSignalKeyStore(state.keys, logger),
    },
    browser: ["Ubuntu", "Chrome", "22.04"],
    markOnlineOnConnect: false,
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
    shouldSyncHistoryMessage: () => false,
  });
  rt.sock = sock;

  sock.ev.on("creds.update", saveCreds);

  if (usePairing) {
    const phone = opts.pairingPhone!;
    setTimeout(async () => {
      try {
        await issuePairingCode(rt, phone);
      } catch (err) {
        rt.lastError = `Pairing failed: ${(err as Error).message}`;
        await logEvent({ userId: rt.userId, botId: rt.id, channel: "ERROR", level: "error", message: rt.lastError });
        await setStatus(rt, "disconnected", rt.lastError);
      }
    }, 3500);
  }

  sock.ev.on("connection.update", async (update: any) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      const dataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 420, errorCorrectionLevel: "M" });
      rt.qr = { dataUrl, raw: qr, expiresAt: Date.now() + 60_000 };
      await setStatus(rt, "waiting_qr", "QR generated by Baileys — scan with WhatsApp");
      publish({
        type: "bot.qr",
        userId: rt.userId,
        botId: rt.id,
        message: "QR code received from WhatsApp",
        payload: { dataUrl, expiresAt: rt.qr.expiresAt },
      });
      await logEvent({
        userId: rt.userId,
        botId: rt.id,
        channel: "BAILEYS",
        message: "QR code received from WhatsApp servers",
        persist: false,
      });
    }

    if (connection === "connecting") await setStatus(rt, "connecting", "Handshaking with WhatsApp");

    if (connection === "open") {
      rt.qr = null;
      rt.pairing = null;
      rt.connectedAt = Date.now();
      rt.jid = sock.user?.id ?? null;
      await setStatus(rt, "connected", "WhatsApp connection established");
      await db
        .update(bots)
        .set({ lastConnectedAt: new Date(), status: "connected" })
        .where(eq(bots.id, rt.id));
      await db.insert(botSessions).values({
        botId: rt.id,
        jid: rt.jid,
        platform: sock.user?.name ?? null,
        authPath: dir,
        connectedAt: new Date(),
      });
      await logEvent({
        userId: rt.userId,
        botId: rt.id,
        channel: "BAILEYS",
        level: "success",
        message: `Connected as ${rt.jid ?? "unknown"}`,
      });
      await notify(rt.userId, "bot.connected", `${rt.name} connected`, `WhatsApp session active as ${rt.jid ?? ""}`);
      publish({ type: "notification.created", userId: rt.userId, message: `${rt.name} connected` });
      void syncGroups(rt).catch(() => undefined);
    }

    if (connection === "close") {
      const baileysMod = await loadBaileys();
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const reason = lastDisconnect?.error?.message ?? "connection closed";
      rt.lastError = reason;
      const loggedOut = statusCode === baileysMod.DisconnectReason.loggedOut;
      await db
        .update(botSessions)
        .set({ disconnectedAt: new Date(), lastReason: reason })
        .where(eq(botSessions.botId, rt.id));

      if (rt.shuttingDown) {
        await setStatus(rt, "offline", "Stopped by operator");
        return;
      }
      if (loggedOut) {
        await setStatus(rt, "disconnected", "Logged out from WhatsApp — session removed");
        await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
        await logEvent({
          userId: rt.userId,
          botId: rt.id,
          channel: "BAILEYS",
          level: "warn",
          message: "Device logged out — auth state cleared, a new QR is required",
        });
        await notify(rt.userId, "bot.disconnected", `${rt.name} logged out`, "Scan a new QR code to reconnect.");
        return;
      }

      const botRow = await db.select().from(bots).where(eq(bots.id, rt.id)).limit(1);
      if (botRow[0]?.autoReconnect) {
        rt.reconnects += 1;
        await setStatus(rt, "reconnecting", `Reconnecting (#${rt.reconnects}) — ${reason}`);
        await logEvent({
          userId: rt.userId,
          botId: rt.id,
          channel: "BAILEYS",
          level: "warn",
          message: `Disconnected (${reason}). Reconnecting in 3s…`,
          persist: false,
        });
        setTimeout(() => {
          startBot(rt.id).catch(async (err) => {
            await logEvent({
              userId: rt.userId,
              botId: rt.id,
              channel: "ERROR",
              level: "error",
              message: `Reconnect failed: ${(err as Error).message}`,
            });
          });
        }, 3000);
      } else {
        await setStatus(rt, "disconnected", reason);
        await notify(rt.userId, "bot.disconnected", `${rt.name} disconnected`, reason);
      }
    }
  });

  sock.ev.on("messages.upsert", async (payload: any) => {
    if (payload.type !== "notify") return;
    for (const msg of payload.messages ?? []) {
      rt.stats.messages += 1;
      publish({
        type: "bot.message",
        userId: rt.userId,
        botId: rt.id,
        message: "message received",
        payload: {
          from: msg.key?.remoteJid,
          fromMe: msg.key?.fromMe,
          pushName: msg.pushName,
        },
      });
      if (msg.message?.protocolMessage?.key?.id && msg.message?.protocolMessage?.requestId) continue;
      try {
        const { handleIncomingMessage } = await import("@/server/commands/handler");
        await handleIncomingMessage(rt, msg);
      } catch (err) {
        await logEvent({
          userId: rt.userId,
          botId: rt.id,
          channel: "ERROR",
          level: "error",
          message: `Message handler crashed: ${(err as Error).message}`,
        });
      }
    }
  });

  sock.ev.on("groups.upsert", () => void syncGroups(rt).catch(() => undefined));
  sock.ev.on("group-participants.update", async (update: any) => {
    try {
      const { handleGroupParticipantsUpdate } = await import("@/server/commands/handler");
      await handleGroupParticipantsUpdate(rt, update);
    } catch {
      /* ignore */
    }
  });

  return runtimeSnapshot(botId);
}

export async function stopBot(botId: string) {
  const rt = getRuntime(botId);
  if (!rt) {
    await db.update(bots).set({ status: "offline" }).where(eq(bots.id, botId));
    return { stopped: false };
  }
  rt.shuttingDown = true;
  try {
    rt.sock?.end(undefined);
  } catch {
    /* ignore */
  }
  rt.sock = null;
  rt.qr = null;
  rt.pairing = null;
  rt.connectedAt = null;
  await setStatus(rt, "offline", "Stopped");
  await logEvent({ userId: rt.userId, botId, channel: "BAILEYS", message: `${rt.name} stopped` });
  return { stopped: true };
}

export async function restartBot(botId: string) {
  await stopBot(botId);
  await new Promise((r) => setTimeout(r, 800));
  return startBot(botId);
}

export async function logoutBot(botId: string) {
  const rt = getRuntime(botId);
  if (rt?.sock) {
    try {
      await rt.sock.logout();
    } catch {
      /* ignore */
    }
  }
  await stopBot(botId);
  await fs.rm(authDir(botId), { recursive: true, force: true }).catch(() => undefined);
  return { ok: true };
}

export async function deleteBotRuntime(botId: string) {
  await stopBot(botId);
  registry().delete(botId);
  await fs.rm(authDir(botId), { recursive: true, force: true }).catch(() => undefined);
}

export async function syncGroups(rt: RuntimeBot) {
  if (!rt.sock) return [];
  const meta: Record<string, any> = await rt.sock.groupFetchAllParticipating();
  const entries = Object.values(meta ?? {});
  for (const g of entries) {
    const myJid = (rt.jid ?? "").split(":")[0];
    const isAdmin = Boolean(
      (g.participants ?? []).find(
        (p: any) => p.id?.split(":")[0] === myJid && (p.admin === "admin" || p.admin === "superadmin"),
      ),
    );
    await db
      .insert(groupsTable)
      .values({
        botId: rt.id,
        jid: g.id,
        subject: g.subject ?? null,
        participantCount: g.participants?.length ?? 0,
        isAdmin,
        lastSyncedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [groupsTable.botId, groupsTable.jid],
        set: {
          subject: g.subject ?? null,
          participantCount: g.participants?.length ?? 0,
          isAdmin,
          lastSyncedAt: new Date(),
        },
      });
  }
  await logEvent({
    userId: rt.userId,
    botId: rt.id,
    channel: "GROUP",
    message: `Synced ${entries.length} groups from WhatsApp`,
    persist: false,
  });
  return entries;
}

export async function assertBotOwnership(botId: string, userId: number) {
  const rows = await db
    .select()
    .from(bots)
    .where(and(eq(bots.id, botId), eq(bots.userId, userId)))
    .limit(1);
  if (!rows[0]) throw new Error("Bot not found");
  return rows[0];
}
