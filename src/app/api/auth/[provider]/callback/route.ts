import { NextResponse } from "next/server";
import { appUrlFromRequest, googleConfig, githubConfig } from "@/server/config";
import {
  consumeOAuthState,
  createSession,
  upsertUserFromProvider,
  logActivity,
  notify,
} from "@/server/auth/session";
import { googleExchange, googleProfile, githubExchange, githubProfile } from "@/server/auth/oauth";
import { logEvent, publish } from "@/server/events/bus";
import { clientIp } from "@/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorRedirect(baseUrl: string, reqUrl: string, reason: string, provider?: string) {
  const url = new URL("/auth/error", baseUrl || reqUrl);
  url.searchParams.set("reason", reason);
  if (provider) url.searchParams.set("provider", provider);
  return NextResponse.redirect(url);
}

export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const baseUrl = appUrlFromRequest(req);
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const providerError = url.searchParams.get("error");

  if (provider !== "google" && provider !== "github") {
    return errorRedirect(baseUrl, req.url, "unknown_provider");
  }

  if (providerError) {
    await logEvent({
      userId: null,
      channel: "AUTH",
      level: "error",
      message: `${provider} returned error: ${providerError} ${url.searchParams.get("error_description") ?? ""}`,
    });
    return errorRedirect(baseUrl, req.url, "provider_rejected", provider);
  }

  const stored = await consumeOAuthState();
  if (!stored || stored.provider !== provider || !state || stored.state !== state) {
    await logEvent({
      userId: null,
      channel: "AUTH",
      level: "error",
      message: `${provider} callback state validation failed (possible CSRF or expired flow)`,
    });
    return errorRedirect(baseUrl, req.url, "state_mismatch", provider);
  }
  if (!code) return errorRedirect(baseUrl, req.url, "missing_code", provider);

  const config = provider === "google" ? googleConfig(baseUrl) : githubConfig(baseUrl);
  if (!config.configured) return errorRedirect(baseUrl, req.url, "provider_not_configured", provider);

  try {
    const token =
      provider === "google"
        ? await googleExchange({
            clientId: process.env.GOOGLE_CLIENT_ID!.trim(),
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!.trim(),
            callbackUrl: config.callbackUrl,
            code,
            verifier: stored.verifier,
          })
        : await githubExchange({
            clientId: process.env.GITHUB_CLIENT_ID!.trim(),
            clientSecret: process.env.GITHUB_CLIENT_SECRET!.trim(),
            callbackUrl: config.callbackUrl,
            code,
          });

    const profile = provider === "google" ? await googleProfile(token) : await githubProfile(token);
    const { userId, linked, created } = await upsertUserFromProvider(profile);

    await createSession({
      userId,
      provider,
      userAgent: req.headers.get("user-agent"),
      ip: clientIp(req),
      secure: baseUrl.startsWith("https://"),
    });

    await logActivity(
      userId,
      "auth.login",
      `You signed in with ${provider === "google" ? "Google" : "GitHub"}${linked ? " (account linked)" : ""}`,
      clientIp(req),
    );
    await notify(
      userId,
      "auth.login",
      `Signed in with ${provider === "google" ? "Google" : "GitHub"}`,
      created ? "Welcome to SpideyBot 🕷️" : "Welcome back 🕷️",
    );
    publish({ type: "notification.created", userId, message: "New sign-in" });
    await logEvent({
      userId,
      channel: "AUTH",
      level: "success",
      message: `${provider} OAuth login succeeded for ${profile.username}`,
    });

    return NextResponse.redirect(new URL(stored.redirect || "/dashboard", baseUrl || req.url));
  } catch (err) {
    // Full detail stays in the developer logs; the user only sees a safe reason.
    await logEvent({
      userId: null,
      channel: "AUTH",
      level: "error",
      message: `${provider} OAuth callback failed: ${(err as Error).message}`,
    });
    return errorRedirect(baseUrl, req.url, "exchange_failed", provider);
  }
}
