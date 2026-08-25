import { withUser, json, errorJson, rateLimit } from "@/server/api";
import {
  assertBotOwnership,
  startBot,
  stopBot,
  restartBot,
  logoutBot,
  runtimeSnapshot,
  syncGroups,
  getRuntime,
} from "@/server/bot/manager";
import { logActivity } from "@/server/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withUser(async (user) => {
    const bot = await assertBotOwnership(id, user.id);
    const body = (await req.json().catch(() => ({}))) as { action?: string; phone?: string };
    const action = body.action;
    if (!rateLimit(`bot-action:${user.id}:${id}`, 20)) return errorJson("Too many actions, slow down", 429);

    switch (action) {
      case "start": {
        const snapshot = await startBot(id);
        await logActivity(user.id, "bot.start", `You started ${bot.name}`);
        return json({ ok: true, runtime: snapshot });
      }
      case "pair": {
        const phone = body.phone?.replace(/[^0-9]/g, "");
        if (!phone || phone.length < 8) return errorJson("A valid international phone number is required");
        const snapshot = await startBot(id, { pairingPhone: phone });
        await logActivity(user.id, "bot.pair", `You requested a pairing code for ${bot.name}`);
        return json({ ok: true, runtime: snapshot, note: "Pairing code will arrive over the realtime stream" });
      }
      case "stop": {
        const res = await stopBot(id);
        await logActivity(user.id, "bot.stop", `You stopped ${bot.name}`);
        return json({ ok: true, ...res, runtime: runtimeSnapshot(id) });
      }
      case "restart": {
        const snapshot = await restartBot(id);
        await logActivity(user.id, "bot.restart", `You restarted ${bot.name}`);
        return json({ ok: true, runtime: snapshot });
      }
      case "logout": {
        await logoutBot(id);
        await logActivity(user.id, "bot.logout", `You logged ${bot.name} out of WhatsApp`);
        return json({ ok: true, runtime: runtimeSnapshot(id) });
      }
      case "sync-groups": {
        const rt = getRuntime(id);
        if (!rt || rt.status !== "connected") return errorJson("Bot must be connected to sync groups", 409);
        const list = await syncGroups(rt);
        return json({ ok: true, synced: list.length });
      }
      default:
        return errorJson("Unknown action. Use start, stop, restart, logout, pair or sync-groups.");
    }
  });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withUser(async (user) => {
    await assertBotOwnership(id, user.id);
    return json({ runtime: runtimeSnapshot(id) });
  });
}
