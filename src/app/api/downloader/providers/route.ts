import { withUser, json } from "@/server/api";
import { checkProviderHealth, listProviders } from "@/server/downloader/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

export async function GET() {
  return withUser(async () => json({ providers: await listProviders() }));
}

export async function POST() {
  return withUser(async () => {
    const results = await checkProviderHealth();
    return json({ ok: true, results, providers: await listProviders() });
  });
}
