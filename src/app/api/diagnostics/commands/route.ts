import { withUser, json, errorJson, rateLimit } from "@/server/api";
import { assertBotOwnership } from "@/server/bot/manager";
import { runCommandSelfTest, selfTestTargets } from "@/server/commands/selftest";
import { logEvent } from "@/server/events/bus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function GET() {
  return withUser(async () => json({ targets: selfTestTargets() }));
}

export async function POST(req: Request) {
  return withUser(async (user) => {
    const body = (await req.json().catch(() => ({}))) as { botId?: string; network?: boolean };
    if (!body.botId) return errorJson("botId is required");
    await assertBotOwnership(body.botId, user.id);
    if (!rateLimit(`selftest:${user.id}`, 6)) return errorJson("Rate limit: max 6 self-tests per minute", 429);

    const report = await runCommandSelfTest(body.botId, Boolean(body.network));
    await logEvent({
      userId: user.id,
      botId: body.botId,
      channel: "COMMAND",
      level: report.summary.failed > 0 ? "warn" : "success",
      message: `Command self-test: ${report.summary.passed} passed, ${report.summary.failed} failed, ${report.summary.skipped} skipped`,
    });
    return json(report);
  });
}
