import type { AnalysisMode, WatchItem } from "@taa/shared";
import { Hono } from "hono";
import { maybeSendBatchDigest, sweepLimit } from "../cron";
import type { AppEnv } from "../env";
import { badRequest, forbidden, HttpError, notFound, optionalString, requireSymbol } from "../lib/http";
import {
  aiEngine,
  claimNextJob,
  createRunnerToken,
  enqueueJobs,
  getJob,
  heartbeat,
  revokeRunnerToken,
  runnerInfo,
  saveContext,
  takeContext,
  updateJob,
} from "../lib/runner";
import { acceptRunnerReport, requireContext, saveReport } from "../services/analysis";

const MAX_RESULT_BYTES = 512 * 1024;

const readBody = async (c: { req: { json: <T>() => Promise<T>; header: (n: string) => string | undefined } }) => {
  const len = Number(c.req.header("content-length") ?? 0);
  if (len > MAX_RESULT_BYTES) throw new HttpError(413, "Request body too large");
  return c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
};

const engineList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((e): e is string => typeof e === "string").map((e) => e.slice(0, 40)).slice(0, 5) : [];

/* ------------------- /api/runner/* — local runner (bearer token) ------------------- */

export const runner = new Hono<AppEnv>();

runner.use("*", async (c, next) => {
  if (c.var.authVia !== "runner") throw forbidden("Runner token required");
  return next();
});

/** POST /api/runner/hello { engines } → who am I + queue size. The runner calls this on start. */
runner.post("/hello", async (c) => {
  const b = await readBody(c);
  await heartbeat(c.env, c.var.user.sub, engineList(b.engines));
  const info = await runnerInfo(c.env, c.var.user.sub);
  return c.json({ user: c.var.user.email, storage: c.var.store.kind, workerEngine: aiEngine(c.env), queued: info.queued });
});

/**
 * POST /api/runner/jobs/claim { engines } → { job, context } or { job: null }.
 * The Worker builds the fact sheet (live prices + indicators) so numbers always
 * come from code; the runner only supplies the model's judgment.
 */
runner.post("/jobs/claim", async (c) => {
  const b = await readBody(c);
  const engines = engineList(b.engines);
  const sub = c.var.user.sub;
  await heartbeat(c.env, sub, engines);
  const job = await claimNextJob(c.env, sub, engines[0] ?? "runner");
  if (!job) return c.json({ job: null });
  try {
    const context = await requireContext(c.env, c.var.store, job.symbol);
    await saveContext(c.env, sub, job.id, context);
    return c.json({ job, context });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    const res = await updateJob(c.env, sub, job.id, { status: "failed", error, finishedAt: new Date().toISOString() });
    if (res) await maybeSendBatchDigest(c.env, res.jobs, res.job.batchId);
    return c.json({ job: null, skipped: { id: job.id, symbol: job.symbol, error }, retry: true });
  }
});

/** POST /api/runner/jobs/:id/result { report, engine } → saves to the sheet. */
runner.post("/jobs/:id/result", async (c) => {
  const sub = c.var.user.sub;
  const id = c.req.param("id");
  const job = await getJob(c.env, sub, id);
  if (!job) throw notFound("Job not found (it may have expired)");
  if (job.status !== "running") throw badRequest(`Job is ${job.status}, not running`);
  const b = await readBody(c);
  if (!b.report || typeof b.report !== "object") throw badRequest("report is required");
  const engine = optionalString(b.engine, 80) || job.engine || "runner";

  const ctx = await takeContext(c.env, sub, id);
  if (!ctx) throw badRequest("Job context expired — it will be retried on the next sweep");
  const report = acceptRunnerReport(b.report as Record<string, unknown>, ctx, { mode: job.mode, engine });
  const analysisId = await saveReport(c.var.store, report);
  const res = await updateJob(c.env, sub, id, {
    status: "done",
    finishedAt: new Date().toISOString(),
    analysisId,
    decision: report.decision,
    confidence: report.confidence,
    oneLiner: report.oneLiner.slice(0, 200),
    engine,
    error: undefined,
  });
  if (res) await maybeSendBatchDigest(c.env, res.jobs, res.job.batchId);
  return c.json({ ok: true, analysisId, decision: report.decision, ruleNotes: report.ruleNotes ?? [] });
});

/** POST /api/runner/jobs/:id/fail { error } */
runner.post("/jobs/:id/fail", async (c) => {
  const sub = c.var.user.sub;
  const b = await readBody(c);
  const error = optionalString(b.error, 500) || "Local runner failed";
  const res = await updateJob(c.env, sub, c.req.param("id"), { status: "failed", error, finishedAt: new Date().toISOString() });
  if (!res) throw notFound("Job not found");
  await takeContext(c.env, sub, res.job.id);
  await maybeSendBatchDigest(c.env, res.jobs, res.job.batchId);
  return c.json({ ok: true });
});

/** POST /api/runner/enqueue { symbol, mode? } → queue one analysis from the runner CLI. */
runner.post("/enqueue", async (c) => {
  const b = await readBody(c);
  const mode: AnalysisMode = b.mode === "deep" ? "deep" : "quick";
  const [job] = await enqueueJobs(c.env, c.var.user.sub, [{ symbol: requireSymbol(b.symbol), mode }], { source: "ui" });
  return c.json({ job });
});

/** POST /api/runner/sweep { mode? } → queue every watchlist symbol now (daily_stock_analysis-style sweep). */
runner.post("/sweep", async (c) => {
  const b = await readBody(c);
  const mode: AnalysisMode = b.mode === "deep" ? "deep" : "quick";
  const items = (await c.var.store.list("watchlists")) as unknown as WatchItem[];
  const symbols = [...new Set(items.map((i) => i.symbol))].slice(0, sweepLimit(c.env));
  if (!symbols.length) return c.json({ queued: 0, jobs: [] });
  const jobs = await enqueueJobs(c.env, c.var.user.sub, symbols.map((symbol) => ({ symbol, mode })), {
    source: "sweep",
    batchId: crypto.randomUUID(),
  });
  return c.json({ queued: jobs.length, jobs });
});

/* -------------- /api/settings/runner — manage the token (browser session) -------------- */

export const runnerSettings = new Hono<AppEnv>();

/** GET /api/settings/runner → RunnerInfo + the Worker's engine */
runnerSettings.get("/", async (c) => c.json({ engine: aiEngine(c.env), ...(await runnerInfo(c.env, c.var.user.sub)) }));

/** POST /api/settings/runner/token → { token } (shown once; rotates any old token) */
runnerSettings.post("/token", async (c) => c.json({ token: await createRunnerToken(c.env, c.var.user.sub) }));

/** DELETE /api/settings/runner/token */
runnerSettings.delete("/token", async (c) => {
  await revokeRunnerToken(c.env, c.var.user.sub);
  return c.json({ ok: true });
});
