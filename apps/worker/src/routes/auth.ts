import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { isDevBypass, type AppEnv, type Env } from "../env";
import { assertSecret, decrypt, encrypt, randomId } from "../lib/crypto";
import { buildAuthUrl, exchangeCode, fetchGoogleUser, revokeToken } from "../lib/google";
import { forbidden } from "../lib/http";
import {
  getUser,
  isEmailAllowed,
  putUser,
  SESSION_COOKIE,
  SESSION_TTL_S,
  sessionKey,
  sheetsStoreFor,
  type SessionRecord,
  type UserRecord,
} from "../lib/session";

const STATE_COOKIE = "taa_oauth_state";

const appOrigin = (env: Env, reqUrl: string) => (env.APP_URL ? new URL(env.APP_URL).origin : new URL(reqUrl).origin);
const secureCookies = (origin: string) => origin.startsWith("https://");

export const auth = new Hono<AppEnv>();

auth.get("/login", (c) => {
  const origin = appOrigin(c.env, c.req.url);
  if (isDevBypass(c.env)) return c.redirect(`${origin}/`);
  const state = randomId(16);
  setCookie(c, STATE_COOKIE, state, {
    httpOnly: true,
    secure: secureCookies(origin),
    sameSite: "Lax",
    path: "/auth",
    maxAge: 600,
  });
  return c.redirect(buildAuthUrl(c.env, `${origin}/auth/callback`, state));
});

auth.get("/callback", async (c) => {
  const origin = appOrigin(c.env, c.req.url);
  const secret = assertSecret(c.env.SESSION_SECRET);
  const { code, state, error } = c.req.query();
  if (error) return c.redirect(`${origin}/?auth_error=${encodeURIComponent(error)}`);
  const expected = getCookie(c, STATE_COOKIE);
  deleteCookie(c, STATE_COOKIE, { path: "/auth" });
  if (!code || !state || !expected || state !== expected) return c.redirect(`${origin}/?auth_error=state_mismatch`);

  const tokens = await exchangeCode(c.env, code, `${origin}/auth/callback`);
  const g = await fetchGoogleUser(tokens.access_token);
  if (!g.email_verified || !isEmailAllowed(c.env, g.email)) {
    await revokeToken(tokens.access_token);
    throw forbidden(`${g.email} is not in ALLOWED_EMAILS`);
  }
  if (!tokens.scope.includes("drive.file")) {
    return c.redirect(`${origin}/?auth_error=drive_permission_required`);
  }

  const existing = await getUser(c.env, g.sub);
  const refreshToken = tokens.refresh_token
    ? await encrypt(tokens.refresh_token, secret)
    : existing?.refreshToken;
  if (!refreshToken) return c.redirect(`${origin}/?auth_error=no_refresh_token`);

  const user: UserRecord = {
    sub: g.sub,
    email: g.email,
    name: g.name ?? g.email,
    picture: g.picture,
    refreshToken,
    spreadsheetId: existing?.spreadsheetId ?? null,
    schemaVersion: existing?.schemaVersion ?? 0,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };
  // Creates the database spreadsheet in the user's Drive on first login.
  await sheetsStoreFor(c.env, user, async () => tokens.access_token);
  await putUser(c.env, user);

  const sid = randomId(32);
  const session: SessionRecord = {
    sub: g.sub,
    accessToken: await encrypt(tokens.access_token, secret),
    expiresAt: Date.now() + tokens.expires_in * 1000,
  };
  await c.env.KV.put(sessionKey(sid), JSON.stringify(session), { expirationTtl: SESSION_TTL_S });
  setCookie(c, SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: secureCookies(origin),
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL_S,
  });
  return c.redirect(`${origin}/`);
});

auth.post("/logout", async (c) => {
  const sid = getCookie(c, SESSION_COOKIE);
  if (sid) {
    const session = await c.env.KV.get<SessionRecord>(sessionKey(sid), "json");
    if (session && c.env.SESSION_SECRET) {
      await revokeToken(await decrypt(session.accessToken, c.env.SESSION_SECRET).catch(() => ""));
    }
    await c.env.KV.delete(sessionKey(sid));
  }
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});
