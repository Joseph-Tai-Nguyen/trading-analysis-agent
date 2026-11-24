import { SCHEMA_VERSION, type UserInfo } from "@taa/shared";
import type { Context, MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { isDevBypass, type AppEnv, type Env } from "../env";
import { assertSecret, decrypt, encrypt } from "./crypto";
import { refreshAccessToken } from "./google";
import { resolveRunnerToken } from "./runner";
import { forbidden, HttpError, unauthorized } from "./http";
import { SheetsApi, spreadsheetUrl } from "./sheets";
import { KvStore, SheetsStore, type Store } from "./store";

export const SESSION_COOKIE = "taa_sid";
export const SESSION_TTL_S = 30 * 24 * 3600;

export interface UserRecord extends UserInfo {
  /** AES-GCM encrypted Google refresh token. */
  refreshToken: string;
  spreadsheetId: string | null;
  schemaVersion: number;
  createdAt: string;
}

export interface SessionRecord {
  sub: string;
  /** AES-GCM encrypted Google access token. */
  accessToken: string;
  expiresAt: number;
}

export const DEV_USER: UserInfo = { sub: "dev-user", email: "dev@localhost", name: "Dev User" };

export const userKey = (sub: string) => `user:${sub}`;
export const sessionKey = (sid: string) => `session:${sid}`;

export function isEmailAllowed(env: Env, email: string): boolean {
  const list = (env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.length > 0 && list.includes(email.toLowerCase());
}

export async function getUser(env: Env, sub: string) {
  return env.KV.get<UserRecord>(userKey(sub), "json");
}

export function putUser(env: Env, user: UserRecord) {
  return env.KV.put(userKey(user.sub), JSON.stringify(user));
}

/** Returns a valid Google access token, refreshing it (and the session) when needed. */
export async function accessTokenFor(env: Env, user: UserRecord, sid?: string, session?: SessionRecord): Promise<string> {
  const secret = assertSecret(env.SESSION_SECRET);
  if (session && session.expiresAt - 60_000 > Date.now()) return decrypt(session.accessToken, secret);
  const tokens = await refreshAccessToken(env, await decrypt(user.refreshToken, secret));
  if (sid) {
    const next: SessionRecord = {
      sub: user.sub,
      accessToken: await encrypt(tokens.access_token, secret),
      expiresAt: Date.now() + tokens.expires_in * 1000,
    };
    await env.KV.put(sessionKey(sid), JSON.stringify(next), { expirationTtl: SESSION_TTL_S });
  }
  return tokens.access_token;
}

/** Build a Sheets-backed store for a user, creating/migrating the spreadsheet if needed. */
export async function sheetsStoreFor(env: Env, user: UserRecord, getToken: () => Promise<string>): Promise<{ store: Store; url: string }> {
  const api = new SheetsApi(getToken);
  if (!user.spreadsheetId) {
    user.spreadsheetId = (await api.findSpreadsheet()) ?? (await api.createSpreadsheet());
    user.schemaVersion = 0;
  }
  if (user.schemaVersion < SCHEMA_VERSION) {
    await api.ensureSchema(user.spreadsheetId);
    user.schemaVersion = SCHEMA_VERSION;
    await putUser(env, user);
  }
  return { store: new SheetsStore(api, user.spreadsheetId), url: spreadsheetUrl(user.spreadsheetId) };
}

function useDevUser(c: Context<AppEnv>) {
  c.set("user", DEV_USER);
  c.set("store", new KvStore(c.env.KV, DEV_USER.sub));
  c.set("spreadsheetUrl", null);
}

async function useSheetsUser(c: Context<AppEnv>, user: UserRecord, getToken: () => Promise<string>) {
  try {
    const { store, url } = await sheetsStoreFor(c.env, user, getToken);
    c.set("store", store);
    c.set("spreadsheetUrl", url);
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) throw unauthorized("Google access expired — sign in again");
    throw e;
  }
  c.set("user", { sub: user.sub, email: user.email, name: user.name, picture: user.picture });
}

/**
 * Local-runner auth: `Authorization: Bearer taa_rt_…`. The token is scoped to
 * /api/runner/* only, so a leaked runner token cannot read or change the
 * portfolio through the normal API. Bearer requests carry no cookies, so they
 * are not exposed to CSRF.
 */
async function runnerAuth(c: Context<AppEnv>, header: string) {
  const m = /^Bearer\s+(\S+)$/i.exec(header);
  if (!m) throw unauthorized("Malformed Authorization header");
  if (!c.req.path.startsWith("/api/runner/")) throw forbidden("Runner tokens can only call /api/runner/*");
  const sub = await resolveRunnerToken(c.env, m[1]!);
  if (!sub) throw unauthorized("Invalid or revoked runner token — create a new one in Settings");
  c.set("authVia", "runner");
  if (isDevBypass(c.env)) {
    if (sub !== DEV_USER.sub) throw unauthorized("Runner token belongs to another user");
    return useDevUser(c);
  }
  const user = await getUser(c.env, sub);
  if (!user) throw unauthorized("Runner token user no longer exists");
  if (!isEmailAllowed(c.env, user.email)) throw forbidden("This Google account is not allowed");
  let cached: Promise<string> | null = null;
  await useSheetsUser(c, user, () => (cached ??= accessTokenFor(c.env, user)));
}

/** Auth middleware: resolves the user + their data store, or 401s. */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const authz = c.req.header("authorization");
  if (authz) {
    await runnerAuth(c, authz);
    return next();
  }
  // Runner endpoints never accept a browser session, so a page can't impersonate the runner.
  if (c.req.path.startsWith("/api/runner/")) throw unauthorized("Runner token required");
  if (isDevBypass(c.env)) {
    useDevUser(c);
    c.set("authVia", "dev");
    return next();
  }
  const sid = getCookie(c, SESSION_COOKIE);
  if (!sid) throw unauthorized();
  const session = await c.env.KV.get<SessionRecord>(sessionKey(sid), "json");
  if (!session) throw unauthorized("Session expired");
  const user = await getUser(c.env, session.sub);
  if (!user) throw unauthorized("Session expired");
  if (!isEmailAllowed(c.env, user.email)) throw forbidden("This Google account is not allowed");

  let cached: Promise<string> | null = null;
  await useSheetsUser(c, user, () => (cached ??= accessTokenFor(c.env, user, sid, session)));
  c.set("authVia", "session");
  return next();
};

/** Reject cross-origin state-changing requests (defense in depth on top of SameSite=Lax). */
export const sameOriginWrites: MiddlewareHandler<AppEnv> = async (c: Context<AppEnv>, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    const origin = c.req.header("origin");
    const allowed = new Set([new URL(c.req.url).origin, c.env.APP_URL ? new URL(c.env.APP_URL).origin : ""]);
    if (origin && !allowed.has(origin)) throw forbidden("Cross-origin request blocked");
  }
  return next();
};
