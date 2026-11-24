import type { AppStatus } from "@taa/shared";
import { Hono } from "hono";
import { runDailySweep } from "./cron";
import { isDevBypass, type AppEnv, type Env } from "./env";
import { statusOf } from "./lib/http";
import { aiEngine } from "./lib/runner";
import { requireAuth, sameOriginWrites } from "./lib/session";
import { telegramEnabled } from "./lib/telegram";
import { analysis } from "./routes/analysis";
import { auth } from "./routes/auth";
import { market } from "./routes/market";
import { portfolio } from "./routes/portfolio";
import { runner, runnerSettings } from "./routes/runner";
import { watchlists } from "./routes/watchlists";

const VERSION = "0.1.0";

const app = new Hono<AppEnv>();

app.onError((err, c) => {
  const status = statusOf(err);
  if (status >= 500) console.error(err);
  const detail = (err as { detail?: string }).detail;
  return c.json({ error: err.message, ...(detail ? { detail } : {}) }, status);
});

app.use("*", sameOriginWrites);
app.route("/auth", auth);

app.get("/api/health", (c) => c.json({ ok: true, version: VERSION }));

// Everything below requires a signed-in (allow-listed) user.
app.use("/api/*", requireAuth);

app.get("/api/status", (c) => {
  const status: AppStatus = {
    user: c.var.user,
    storage: c.var.store.kind,
    spreadsheetUrl: c.var.spreadsheetUrl,
    ai: {
      engine: aiEngine(c.env),
      primary: c.env.AI_PRIMARY === "claude" ? "claude" : "gemini",
      gemini: !!c.env.GEMINI_API_KEY,
      claude: !!c.env.ANTHROPIC_API_KEY,
    },
    market: { finnhub: !!c.env.FINNHUB_API_KEY, twelvedata: !!c.env.TWELVEDATA_API_KEY },
    notifications: { telegram: telegramEnabled(c.env) },
    version: VERSION,
  };
  return c.json(status);
});

app.route("/api/market", market);
app.route("/api", portfolio);
app.route("/api/watchlists", watchlists);
app.route("/api/analysis", analysis);
app.route("/api/runner", runner);
app.route("/api/settings/runner", runnerSettings);

// Manual trigger for the daily sweep (handy in dev): POST /api/cron/run
app.post("/api/cron/run", async (c) => {
  if (!isDevBypass(c.env)) return c.json({ error: "Only available with DEV_AUTH_BYPASS=true" }, 403);
  await runDailySweep(c.env);
  return c.json({ ok: true });
});

app.notFound((c) => (c.req.path.startsWith("/api/") ? c.json({ error: "Not found" }, 404) : c.env.ASSETS.fetch(c.req.raw)));

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runDailySweep(env));
  },
} satisfies ExportedHandler<Env>;
