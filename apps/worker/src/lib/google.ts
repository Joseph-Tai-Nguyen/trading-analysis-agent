import type { Env } from "../env";
import { HttpError } from "./http";

/**
 * Least-privilege scopes: `drive.file` only grants access to files this app
 * creates (the database spreadsheet) — not the rest of the user's Drive.
 * It is a non-sensitive scope, so no Google security review is needed.
 */
export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/drive.file",
];

export interface GoogleTokens {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  id_token?: string;
}

export interface GoogleUser {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

function creds(env: Env) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new HttpError(503, "Google OAuth is not configured", "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET");
  }
  return { id: env.GOOGLE_CLIENT_ID, secret: env.GOOGLE_CLIENT_SECRET };
}

export function buildAuthUrl(env: Env, redirectUri: string, state: string): string {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", creds(env).id);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", GOOGLE_SCOPES.join(" "));
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent");
  u.searchParams.set("include_granted_scopes", "true");
  u.searchParams.set("state", state);
  return u.toString();
}

async function tokenRequest(params: Record<string, string>): Promise<GoogleTokens> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  if (!res.ok) throw new HttpError(401, "Google token request failed", (await res.text()).slice(0, 300));
  return (await res.json()) as GoogleTokens;
}

export function exchangeCode(env: Env, code: string, redirectUri: string) {
  const c = creds(env);
  return tokenRequest({ code, client_id: c.id, client_secret: c.secret, redirect_uri: redirectUri, grant_type: "authorization_code" });
}

export function refreshAccessToken(env: Env, refreshToken: string) {
  const c = creds(env);
  return tokenRequest({ refresh_token: refreshToken, client_id: c.id, client_secret: c.secret, grant_type: "refresh_token" });
}

export async function fetchGoogleUser(accessToken: string): Promise<GoogleUser> {
  const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new HttpError(401, "Could not read Google profile");
  return (await res.json()) as GoogleUser;
}

export async function revokeToken(token: string): Promise<void> {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" }).catch(() => {});
}
