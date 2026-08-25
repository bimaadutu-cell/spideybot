import Link from "next/link";

export const dynamic = "force-dynamic";

const REASONS: Record<string, string> = {
  provider_not_configured: "This OAuth provider is not configured on the server yet.",
  state_mismatch: "OAuth state validation failed. The sign-in flow expired or was tampered with.",
  provider_rejected: "OAuth callback was rejected by the provider.",
  missing_code: "The provider did not return an authorization code.",
  exchange_failed: "The authorization code could not be exchanged for an access token.",
  unknown_provider: "Unknown authentication provider.",
};

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; provider?: string; missing?: string; callback?: string }>;
}) {
  const params = await searchParams;
  const reason = params.reason ?? "provider_rejected";
  const provider = params.provider;
  const missing = params.missing?.split(",").filter(Boolean) ?? [];

  return (
    <main className="web-grid flex min-h-dvh items-center justify-center px-4">
      <div className="panel w-full max-w-lg p-8">
        <div className="text-5xl">🕸️</div>
        <h1 className="mt-4 text-2xl font-black tracking-wider text-white">Authentication Failed</h1>
        <p className="mt-3 text-sm text-slate-400">
          Reason:
          <br />
          <span className="text-slate-200">{REASONS[reason] ?? "OAuth callback was rejected."}</span>
        </p>

        {provider && (
          <p className="mt-2 text-xs uppercase tracking-widest text-slate-500">provider · {provider}</p>
        )}

        {missing.length > 0 && (
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200">
            <p className="font-semibold">Missing environment variables</p>
            <ul className="mt-1 list-inside list-disc">
              {missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
            {params.callback && (
              <p className="mt-2 break-all">
                Register this callback URL with the provider: <code className="text-neon">{params.callback}</code>
              </p>
            )}
          </div>
        )}

        <p className="mt-4 text-[11px] text-slate-500">
          Detailed error information (tokens, stack traces, provider payloads) is written to the server developer logs
          only — never to this page.
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link href="/dashboard" className="btn btn-primary flex-1">
            GO TO DASHBOARD
          </Link>
          <Link href="/dashboard" className="btn flex-1">
            BACK TO DASHBOARD
          </Link>
        </div>
      </div>
    </main>
  );
}
