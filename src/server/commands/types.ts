import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { RuntimeBot } from "@/server/bot/manager";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type CommandCategory = "general" | "downloader" | "games" | "groups" | "owner" | "tools";

export type Requirement = "ffmpeg" | "sharp" | `env:${string}`;

export type CommandContext = {
  rt: RuntimeBot;
  sock: any;
  msg: any;
  from: string;
  sender: string;
  senderNumber: string;
  isGroup: boolean;
  isOwner: boolean;
  isSenderAdmin: boolean;
  isBotAdmin: boolean;
  prefix: string;
  command: string;
  args: string[];
  text: string;
  body: string;
  quoted: any | null;
  groupMeta: any | null;
  reply: (text: string) => Promise<void>;
  send: (content: any) => Promise<void>;
  downloadMedia: () => Promise<{ buffer: Buffer; mimetype: string } | null>;
};

export type CommandDef = {
  name: string;
  category: CommandCategory;
  description: string;
  usage?: string;
  aliases?: string[];
  ownerOnly?: boolean;
  groupOnly?: boolean;
  adminOnly?: boolean;
  requires?: Requirement[];
  run: (ctx: CommandContext) => Promise<void>;
};

const execFileAsync = promisify(execFile);

let ffmpegChecked: boolean | null = null;
export async function hasFfmpeg() {
  if (ffmpegChecked !== null) return ffmpegChecked;
  try {
    await execFileAsync("ffmpeg", ["-version"], { timeout: 5000 });
    ffmpegChecked = true;
  } catch {
    ffmpegChecked = false;
  }
  return ffmpegChecked;
}

let sharpChecked: boolean | null = null;
export async function hasSharp() {
  if (sharpChecked !== null) return sharpChecked;
  try {
    await import("sharp");
    sharpChecked = true;
  } catch {
    sharpChecked = false;
  }
  return sharpChecked;
}

export async function requirementStatus(req: Requirement): Promise<{ ok: boolean; reason: string }> {
  if (req === "ffmpeg") {
    const ok = await hasFfmpeg();
    return { ok, reason: ok ? "ffmpeg available" : "ffmpeg binary not installed on the host" };
  }
  if (req === "sharp") {
    const ok = await hasSharp();
    return { ok, reason: ok ? "sharp available" : "sharp module not installed" };
  }
  const key = req.slice(4);
  const ok = Boolean(process.env[key]);
  return { ok, reason: ok ? `${key} configured` : `${key} is not configured` };
}

export async function commandAvailability(def: CommandDef) {
  if (!def.requires?.length) return { available: true, blockers: [] as string[] };
  const blockers: string[] = [];
  for (const req of def.requires) {
    const status = await requirementStatus(req);
    if (!status.ok) blockers.push(status.reason);
  }
  return { available: blockers.length === 0, blockers };
}

export function fmtDuration(ms: number) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [d ? `${d}d` : "", h ? `${h}h` : "", m ? `${m}m` : "", `${sec}s`].filter(Boolean).join(" ");
}
