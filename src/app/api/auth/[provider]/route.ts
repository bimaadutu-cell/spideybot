import { NextResponse } from "next/server";
import { appUrlFromRequest, googleConfig, githubConfig, logStartupConfig } from "@/server/config";
import { setOAuthState, randomId } from "@/server/auth/session";
import { pkce, googleAuthorizeUrl, githubAuthorizeUrl } from "@/server/auth/oauth";
import { logEvent } from "@/server/events/bus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  logStartupConfig();
  const { provider } = await params;
  if (provider !== "google" && provider !== "github") {
    return NextResponse.redirect(new URL("/auth/error?reason=unknown_provider", req.url));
  }

  const baseUrl = appUrlFromRequest(req);
  const config = provider === "google" ? googleConfig(baseUrl) : githubConfig(baseUrl);

  if (!config.configured) {
    const url = new URL("/auth/error", baseUrl || req.url);
    url.searchParams.set("reason", "provider_not_configured");
    url.searchParams.set("provider", provider);
    url.searchParams.set("missing", config.missing.join(","));
    url.searchParams.set("callback", config.callbackUrl);
    await logEvent({
      userId: null,
      channel: "AUTH",
      level: "warn",
      message: `${provider} OAuth start blocked — missing: ${config.missing.join(", ")}`,
      persist: false,
    });
    return NextResponse.redirect(url);
  }

  const state = randomId(24);
  const { verifier, challenge } = pkce();
  const secure = baseUrl.startsWith("https://");
  await setOAuthState(
    { provider, state, verifier, redirect: "/dashboard", createdAt: Date.now() },
    secure,
  );

  const authorizeUrl =
    provider === "google"
      ? googleAuthorizeUrl({
          clientId: process.env.GOOGLE_CLIENT_ID!.trim(),
          callbackUrl: config.callbackUrl,
          state,
          challenge,
        })
      : githubAuthorizeUrl({
          clientId: process.env.GITHUB_CLIENT_ID!.trim(),
          callbackUrl: config.callbackUrl,
          state,
        });

  await logEvent({
    userId: null,
    channel: "AUTH",
    message: `Redirecting user to ${provider} authorization (callback: ${config.callbackUrl})`,
    persist: false,
  });

  return NextResponse.redirect(authorizeUrl);
}
