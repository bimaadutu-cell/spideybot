import crypto from "node:crypto";
import type { ProviderProfile } from "./session";

export type TokenResult = { accessToken: string; idToken?: string; scope?: string };

export function pkce() {
  const verifier = crypto.randomBytes(48).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

/* -------------------------------- GOOGLE ------------------------------- */

export function googleAuthorizeUrl(opts: {
  clientId: string;
  callbackUrl: string;
  state: string;
  challenge: string;
}) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", opts.clientId);
  url.searchParams.set("redirect_uri", opts.callbackUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", opts.state);
  url.searchParams.set("code_challenge", opts.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("access_type", "online");
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export async function googleExchange(opts: {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  code: string;
  verifier: string;
}): Promise<TokenResult> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      redirect_uri: opts.callbackUrl,
      grant_type: "authorization_code",
      code: opts.code,
      code_verifier: opts.verifier,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || !json.access_token) {
    throw new Error(
      `google_token_exchange_failed:${res.status}:${String(json.error ?? "unknown")}:${String(
        json.error_description ?? "",
      )}`,
    );
  }
  return {
    accessToken: String(json.access_token),
    idToken: json.id_token ? String(json.id_token) : undefined,
    scope: json.scope ? String(json.scope) : undefined,
  };
}

export async function googleProfile(token: TokenResult): Promise<ProviderProfile> {
  const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: `Bearer ${token.accessToken}`, accept: "application/json" },
  });
  if (!res.ok) throw new Error(`google_userinfo_failed:${res.status}`);
  const info = (await res.json()) as {
    sub: string;
    name?: string;
    given_name?: string;
    email?: string;
    email_verified?: boolean;
    picture?: string;
  };
  if (!info.sub) throw new Error("google_identity_invalid");
  const email = info.email?.toLowerCase() ?? null;
  const username =
    (email ? email.split("@")[0] : info.given_name?.toLowerCase().replace(/\s+/g, "")) ?? `google_${info.sub.slice(-6)}`;
  return {
    provider: "google",
    providerAccountId: info.sub,
    name: info.name ?? info.given_name ?? username,
    username,
    email,
    avatar: info.picture ?? null,
    emailVerified: Boolean(info.email_verified),
    scope: token.scope,
  };
}

/* -------------------------------- GITHUB ------------------------------- */

export function githubAuthorizeUrl(opts: { clientId: string; callbackUrl: string; state: string }) {
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", opts.clientId);
  url.searchParams.set("redirect_uri", opts.callbackUrl);
  url.searchParams.set("scope", "read:user user:email");
  url.searchParams.set("state", opts.state);
  url.searchParams.set("allow_signup", "true");
  return url.toString();
}

export async function githubExchange(opts: {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  code: string;
}): Promise<TokenResult> {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      redirect_uri: opts.callbackUrl,
      code: opts.code,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || !json.access_token) {
    throw new Error(`github_token_exchange_failed:${res.status}:${String(json.error ?? "unknown")}`);
  }
  return { accessToken: String(json.access_token), scope: json.scope ? String(json.scope) : undefined };
}

export async function githubProfile(token: TokenResult): Promise<ProviderProfile> {
  const headers = {
    authorization: `Bearer ${token.accessToken}`,
    accept: "application/vnd.github+json",
    "user-agent": "SpideyBot-OAuth",
  };
  const res = await fetch("https://api.github.com/user", { headers });
  if (!res.ok) throw new Error(`github_user_failed:${res.status}`);
  const user = (await res.json()) as {
    id: number;
    login: string;
    name?: string | null;
    email?: string | null;
    avatar_url?: string;
  };
  if (!user.id) throw new Error("github_identity_invalid");

  let email = user.email?.toLowerCase() ?? null;
  let verified = false;
  const emailsRes = await fetch("https://api.github.com/user/emails", { headers });
  if (emailsRes.ok) {
    const emails = (await emailsRes.json()) as { email: string; primary: boolean; verified: boolean }[];
    const primary = emails.find((e) => e.primary && e.verified) ?? emails.find((e) => e.verified);
    if (primary) {
      email = primary.email.toLowerCase();
      verified = primary.verified;
    }
  }
  return {
    provider: "github",
    providerAccountId: String(user.id),
    name: user.name ?? user.login,
    username: user.login,
    email,
    avatar: user.avatar_url ?? null,
    emailVerified: verified,
    scope: token.scope,
  };
}
