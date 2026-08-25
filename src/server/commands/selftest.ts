import { db } from "@/db";
import { bots } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getRuntime, type RuntimeBot } from "@/server/bot/manager";
import { allCommands, findCommand } from "./registry";
import { commandAvailability, type CommandContext, type CommandDef } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Command self-test harness.
 *
 * It executes the REAL command implementations. The only substitution is the
 * WhatsApp socket, which is replaced by a capture object that records outgoing
 * payloads instead of transmitting them (the harness must run without a linked
 * phone). Commands that genuinely require a live WhatsApp session, a media
 * attachment, or a missing host dependency are reported as skipped with the
 * reason — they are never reported as passing.
 */

export type SelfTestResult = {
  name: string;
  category: string;
  status: "pass" | "fail" | "skipped";
  reason?: string;
  durationMs: number;
  outputs: string[];
};

/** Commands safe to execute with no live WhatsApp session and no network. */
const OFFLINE_SAFE = ["ping", "menu", "cmdinfo", "limit", "donate", "qrcode", "readmore", "quiz", "quiz-easy", "gamecheck"];
/** Commands that are safe but perform real outbound HTTP to third parties. */
const NETWORK_TESTS = ["shortlink", "memegen", "brat-image", "tiktok"];
/** Fixed arguments so each command receives valid input. */
const ARGS: Record<string, string[]> = {
  cmdinfo: ["ping"],
  qrcode: ["https://spideybot.local/selftest"],
  readmore: ["visible", "part", "|", "hidden", "part"],
  shortlink: ["https://github.com/WhiskeySockets/Baileys"],
  memegen: ["buzz", "|", "spideybot", "|", "self test"],
  "brat-image": ["spideybot", "self", "test"],
  tiktok: ["https://www.tiktok.com/@tiktok/video/7106594312292453675"],
};

const NEEDS_MEDIA = new Set([
  "sticker", "toimage", "towebp", "watermark", "removebg", "readviewonce", "setpp", "upscale", "brat",
]);

function describeContent(content: any): string {
  if (typeof content?.text === "string") return content.text.slice(0, 240).replace(/\n/g, " ⏎ ");
  for (const key of ["image", "video", "audio", "sticker", "document"] as const) {
    const node = content?.[key];
    if (node) {
      if (Buffer.isBuffer(node)) return `${key}: buffer ${node.length} bytes`;
      if (node?.url) return `${key}: url ${String(node.url).slice(0, 120)}`;
      return `${key}: payload`;
    }
  }
  return JSON.stringify(content ?? {}).slice(0, 200);
}

function captureSocket(outputs: string[]) {
  const notSupported = (method: string) => async () => {
    throw new Error(`${method} requires a live WhatsApp connection`);
  };
  return {
    user: { id: "selftest@s.whatsapp.net", name: "SpideyBot Self-Test" },
    async sendMessage(_jid: string, content: any) {
      outputs.push(describeContent(content));
      return { key: { id: `selftest_${outputs.length}` } };
    },
    async sendPresenceUpdate() {},
    async readMessages() {},
    groupMetadata: notSupported("groupMetadata"),
    groupSettingUpdate: notSupported("groupSettingUpdate"),
    groupParticipantsUpdate: notSupported("groupParticipantsUpdate"),
    groupRevokeInvite: notSupported("groupRevokeInvite"),
    groupLeave: notSupported("groupLeave"),
    updateProfilePicture: notSupported("updateProfilePicture"),
    groupFetchAllParticipating: notSupported("groupFetchAllParticipating"),
  };
}

async function syntheticRuntime(botId: string): Promise<RuntimeBot> {
  const live = getRuntime(botId);
  if (live) return live;
  const rows = await db.select().from(bots).where(eq(bots.id, botId)).limit(1);
  const bot = rows[0];
  if (!bot) throw new Error("Bot not found");
  return {
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
}

function buildContext(rt: RuntimeBot, def: CommandDef, outputs: string[]): CommandContext {
  const sock = captureSocket(outputs);
  const from = "selftest@s.whatsapp.net";
  const sender = `${rt.ownerNumber ?? "0"}@s.whatsapp.net`;
  const args = ARGS[def.name] ?? [];
  return {
    rt,
    sock,
    msg: { key: { id: "selftest", remoteJid: from, fromMe: false }, message: { conversation: `${rt.prefix}${def.name}` } },
    from,
    sender,
    senderNumber: rt.ownerNumber ?? "0",
    isGroup: false,
    isOwner: true,
    isSenderAdmin: false,
    isBotAdmin: false,
    prefix: rt.prefix,
    command: def.name,
    args,
    text: args.join(" "),
    body: `${rt.prefix}${def.name} ${args.join(" ")}`.trim(),
    quoted: null,
    groupMeta: null,
    reply: async (text: string) => {
      outputs.push(text.slice(0, 240).replace(/\n/g, " ⏎ "));
    },
    send: async (content: any) => {
      outputs.push(describeContent(content));
    },
    downloadMedia: async () => null,
  };
}

export async function runCommandSelfTest(botId: string, includeNetwork: boolean) {
  const rt = await syntheticRuntime(botId);
  const results: SelfTestResult[] = [];
  const targets = new Set([...OFFLINE_SAFE, ...(includeNetwork ? NETWORK_TESTS : [])]);

  for (const def of allCommands()) {
    const base = { name: def.name, category: def.category };
    const { available, blockers } = await commandAvailability(def);

    if (!available) {
      results.push({ ...base, status: "skipped", reason: blockers.join(", "), durationMs: 0, outputs: [] });
      continue;
    }
    if (!targets.has(def.name)) {
      const reason = def.groupOnly
        ? "requires a live WhatsApp group session"
        : NEEDS_MEDIA.has(def.name)
          ? "requires a media attachment in the chat"
          : def.ownerOnly
            ? "mutates bot ownership — run it from WhatsApp"
            : def.category === "downloader"
              ? "enable network tests to run real provider calls"
              : def.category === "games" && def.name !== "quiz" && def.name !== "quiz-easy"
                ? "multiplayer lobby needs a live group"
                : "not part of the offline self-test set";
      results.push({ ...base, status: "skipped", reason, durationMs: 0, outputs: [] });
      continue;
    }

    const outputs: string[] = [];
    const started = Date.now();
    try {
      const ctx = buildContext(rt, def, outputs);
      await def.run(ctx);
      const durationMs = Date.now() - started;
      if (outputs.length === 0) {
        results.push({ ...base, status: "fail", reason: "command produced no output", durationMs, outputs });
      } else {
        results.push({ ...base, status: "pass", durationMs, outputs });
      }
    } catch (err) {
      results.push({
        ...base,
        status: "fail",
        reason: (err as Error).message,
        durationMs: Date.now() - started,
        outputs,
      });
    }
  }

  const summary = {
    total: results.length,
    passed: results.filter((r) => r.status === "pass").length,
    failed: results.filter((r) => r.status === "fail").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    networkIncluded: includeNetwork,
  };
  return { summary, results };
}

export function selfTestTargets() {
  return {
    offline: OFFLINE_SAFE.filter((n) => findCommand(n)),
    network: NETWORK_TESTS.filter((n) => findCommand(n)),
  };
}
