import type { UserInfo } from "@taa/shared";
import type { Store } from "./lib/store";

/** Worker bindings, vars (wrangler.jsonc) and secrets (.dev.vars / wrangler secret). */
export interface Env {
  ASSETS: Fetcher;
  KV: KVNamespace;

  APP_URL?: string;
  ALLOWED_EMAILS?: string;
  DEV_AUTH_BYPASS?: string;
  SESSION_SECRET?: string;

  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;

  /** "api" | "runner" | unset (auto: api when an AI key is set, else runner). */
  AI_ENGINE?: string;
  AI_PRIMARY?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL_FAST?: string;
  GEMINI_MODEL_DEEP?: string;
  ANTHROPIC_API_KEY?: string;
  CLAUDE_MODEL_FAST?: string;
  CLAUDE_MODEL_DEEP?: string;

  FINNHUB_API_KEY?: string;
  TWELVEDATA_API_KEY?: string;

  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  CRON_MAX_SYMBOLS?: string;
}

export type AppEnv = {
  Bindings: Env;
  Variables: {
    user: UserInfo;
    store: Store;
    spreadsheetUrl: string | null;
    /** How this request authenticated: browser session, local-runner bearer token, or dev bypass. */
    authVia: "session" | "runner" | "dev";
  };
};

export const isDevBypass = (env: Env) => env.DEV_AUTH_BYPASS === "true";
