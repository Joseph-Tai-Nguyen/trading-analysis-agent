import type { AnalysisMode, AnalysisRecord } from "@taa/shared";
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { badRequest, notFound, requireSymbol } from "../lib/http";
import { aiEngine, enqueueJobs, getJob, listJobs } from "../lib/runner";
import { analyzeAndSave } from "../services/analysis";

export const analysis = new Hono<AppEnv>();

/**
 * POST /api/analysis { symbol, mode: "quick" | "deep" }
 *   engine "api"    → 200 AnalysisReport (the Worker calls Gemini/Claude now)
 *   engine "runner" → 202 { queued: true, job } (the local runner picks it up)
 */
analysis.post("/", async (c) => {
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
  const mode = (b.mode ?? "quick") as AnalysisMode;
  if (mode !== "quick" && mode !== "deep") throw badRequest("mode must be quick or deep");
  const symbol = requireSymbol(b.symbol);
  if (aiEngine(c.env) === "runner") {
    const [job] = await enqueueJobs(c.env, c.var.user.sub, [{ symbol, mode }], { source: "ui" });
    return c.json({ queued: true, job }, 202);
  }
  return c.json(await analyzeAndSave(c.env, c.var.store, symbol, mode));
});

/** GET /api/analysis?symbol=AAPL&limit=20 → AnalysisRecord[] newest first */
analysis.get("/", async (c) => {
  const symbol = c.req.query("symbol")?.toUpperCase();
  const limit = Math.min(100, Number(c.req.query("limit") ?? 20) || 20);
  let rows = (await c.var.store.list("analyses")) as unknown as AnalysisRecord[];
  if (symbol) rows = rows.filter((r) => r.symbol === symbol);
  rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return c.json(rows.slice(0, limit));
});

/** GET /api/analysis/jobs → RunnerJob[] (queued, running and finished in the last 24 h) */
analysis.get("/jobs", async (c) => c.json(await listJobs(c.env, c.var.user.sub)));

/** GET /api/analysis/jobs/:id → RunnerJob */
analysis.get("/jobs/:id", async (c) => {
  const job = await getJob(c.env, c.var.user.sub, c.req.param("id"));
  if (!job) throw notFound("Job not found (it may have expired)");
  return c.json(job);
});
