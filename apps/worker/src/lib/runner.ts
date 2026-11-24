import type { AnalysisContext } from "@taa/agents";
import type { AIEngine, AnalysisMode, RunnerInfo, RunnerJob } from "@taa/shared";
import type { Env } from "../env";
import { randomId } from "./crypto";
import { HttpError } from "./http";

// Local-runner support: a per-user bearer token and a small job queue in KV.
//
// Why a single queue document per user instead of one key per job: KV `list()`
// is eventually consistent (up to ~60 s), while a get/put on one key is
// read-after-write consistent in the same location. At personal scale (a few
// dozen jobs) one document is simpler and correct enough; concurrent writes can
// race, which only matters if two browsers enqueue at the very same moment.
//
// KV free tier allows ~1,000 writes/day, so polls never write: heartbeats are
// throttled and only state changes (enqueue, claim, finish) are persisted.

export const TOKEN_PREFIX = "taa_rt_";
const MAX_QUEUED = 30;
const MAX_JOBS = 100;
const KEEP_FINISHED_MS = 24 * 3600_000;
export const STALE_RUNNING_MS = 20 * 60_000;
const HEARTBEAT_EVERY_MS = 15 * 60_000;
const CTX_TTL_S = 24 * 3600;

interface TokenRecord {
  sub: string;
  createdAt: string;
}
interface RunnerRecord {
  hash: string;
  createdAt: string;
  lastSeen: string | null;
  engines: string[];
}
interface Queue {
  jobs: RunnerJob[];
}

const tokenKey = (hash: string) => `runnertoken:${hash}`;
const runnerKey = (sub: string) => `runner:${sub}`;
const queueKey = (sub: string) => `runnerqueue:${sub}`;
const ctxKey = (sub: string, id: string) => `runnerctx:${sub}:${id}`;

async function sha256hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** "api" when a Gemini/Claude API key is set (unless AI_ENGINE overrides), else "runner". */
export function aiEngine(env: Env): AIEngine {
  if (env.AI_ENGINE === "api" || env.AI_ENGINE === "runner") return env.AI_ENGINE;
  return env.GEMINI_API_KEY || env.ANTHROPIC_API_KEY ? "api" : "runner";
}

/* --------------------------------- Tokens --------------------------------- */

/** Create (or rotate) the user's runner token. The plain token is returned once and only its hash is stored. */
export async function createRunnerToken(env: Env, sub: string): Promise<string> {
  const old = await env.KV.get<RunnerRecord>(runnerKey(sub), "json");
  if (old) await env.KV.delete(tokenKey(old.hash));
  const token = TOKEN_PREFIX + randomId(32);
  const hash = await sha256hex(token);
  const now = new Date().toISOString();
  await env.KV.put(tokenKey(hash), JSON.stringify({ sub, createdAt: now } satisfies TokenRecord));
  await env.KV.put(runnerKey(sub), JSON.stringify({ hash, createdAt: now, lastSeen: null, engines: [] } satisfies RunnerRecord));
  return token;
}

export async function revokeRunnerToken(env: Env, sub: string): Promise<void> {
  const rec = await env.KV.get<RunnerRecord>(runnerKey(sub), "json");
  if (rec) await env.KV.delete(tokenKey(rec.hash));
  await env.KV.delete(runnerKey(sub));
}

/** Resolve a bearer token to its user id, or null. */
export async function resolveRunnerToken(env: Env, token: string): Promise<string | null> {
  if (!token.startsWith(TOKEN_PREFIX) || token.length > 200) return null;
  const rec = await env.KV.get<TokenRecord>(tokenKey(await sha256hex(token)), "json");
  return rec?.sub ?? null;
}

/** Record that the runner checked in (throttled to save KV writes). */
export async function heartbeat(env: Env, sub: string, engines: string[]): Promise<void> {
  const rec = await env.KV.get<RunnerRecord>(runnerKey(sub), "json");
  if (!rec) return;
  const last = rec.lastSeen ? Date.parse(rec.lastSeen) : 0;
  const changed = engines.length > 0 && engines.join(",") !== rec.engines.join(",");
  if (!changed && Date.now() - last < HEARTBEAT_EVERY_MS) return;
  await env.KV.put(runnerKey(sub), JSON.stringify({ ...rec, lastSeen: new Date().toISOString(), engines: engines.length ? engines : rec.engines }));
}

/* --------------------------------- Queue ---------------------------------- */

function tidy(jobs: RunnerJob[], now = Date.now()): RunnerJob[] {
  return jobs
    .map((j) =>
      j.status === "running" && j.claimedAt && now - Date.parse(j.claimedAt) > STALE_RUNNING_MS
        ? { ...j, status: "failed" as const, error: "The local runner did not finish within 20 minutes", finishedAt: new Date(now).toISOString() }
        : j,
    )
    .filter((j) => j.status === "queued" || j.status === "running" || now - Date.parse(j.finishedAt ?? j.createdAt) < KEEP_FINISHED_MS)
    .slice(-MAX_JOBS);
}

async function readQueue(env: Env, sub: string): Promise<RunnerJob[]> {
  const q = await env.KV.get<Queue>(queueKey(sub), "json");
  return tidy(q?.jobs ?? []);
}

const writeQueue = (env: Env, sub: string, jobs: RunnerJob[]) => env.KV.put(queueKey(sub), JSON.stringify({ jobs } satisfies Queue));

export async function listJobs(env: Env, sub: string): Promise<RunnerJob[]> {
  return readQueue(env, sub);
}

export async function getJob(env: Env, sub: string, id: string): Promise<RunnerJob | null> {
  return (await readQueue(env, sub)).find((j) => j.id === id) ?? null;
}

/** Queue analyses. A symbol+mode that is already queued or running is reused, not duplicated. */
export async function enqueueJobs(
  env: Env,
  sub: string,
  items: { symbol: string; mode: AnalysisMode }[],
  opts: { source: RunnerJob["source"]; batchId?: string },
): Promise<RunnerJob[]> {
  const jobs = await readQueue(env, sub);
  const out: RunnerJob[] = [];
  for (const { symbol, mode } of items) {
    const existing = jobs.find((j) => j.symbol === symbol && j.mode === mode && (j.status === "queued" || j.status === "running"));
    if (existing) {
      out.push(existing);
      continue;
    }
    if (jobs.filter((j) => j.status === "queued").length >= MAX_QUEUED) throw new HttpError(429, "Too many queued analyses — start the local runner or wait");
    const job: RunnerJob = {
      id: crypto.randomUUID(),
      symbol,
      mode,
      status: "queued",
      source: opts.source,
      batchId: opts.batchId,
      createdAt: new Date().toISOString(),
    };
    jobs.push(job);
    out.push(job);
  }
  await writeQueue(env, sub, jobs);
  return out;
}

/** Claim the oldest queued job (UI jobs before sweep jobs). */
export async function claimNextJob(env: Env, sub: string, engine: string): Promise<RunnerJob | null> {
  const jobs = await readQueue(env, sub);
  const queued = jobs.filter((j) => j.status === "queued");
  const next = queued.find((j) => j.source === "ui") ?? queued[0];
  if (!next) return null;
  next.status = "running";
  next.claimedAt = new Date().toISOString();
  next.engine = engine.slice(0, 80) || undefined;
  await writeQueue(env, sub, jobs);
  return next;
}

/** Patch one job; returns it plus the whole queue (used to check batch completion). */
export async function updateJob(env: Env, sub: string, id: string, patch: Partial<RunnerJob>): Promise<{ job: RunnerJob; jobs: RunnerJob[] } | null> {
  const jobs = await readQueue(env, sub);
  const job = jobs.find((j) => j.id === id);
  if (!job) return null;
  Object.assign(job, patch);
  await writeQueue(env, sub, jobs);
  return { job, jobs };
}

export function saveContext(env: Env, sub: string, id: string, ctx: AnalysisContext) {
  return env.KV.put(ctxKey(sub, id), JSON.stringify(ctx), { expirationTtl: CTX_TTL_S });
}

export async function takeContext(env: Env, sub: string, id: string): Promise<AnalysisContext | null> {
  const ctx = await env.KV.get<AnalysisContext>(ctxKey(sub, id), "json");
  if (ctx) await env.KV.delete(ctxKey(sub, id));
  return ctx;
}

export async function runnerInfo(env: Env, sub: string): Promise<RunnerInfo> {
  const [rec, jobs] = await Promise.all([env.KV.get<RunnerRecord>(runnerKey(sub), "json"), readQueue(env, sub)]);
  return {
    hasToken: !!rec,
    tokenCreatedAt: rec?.createdAt ?? null,
    lastSeen: rec?.lastSeen ?? null,
    engines: rec?.engines ?? [],
    queued: jobs.filter((j) => j.status === "queued").length,
    running: jobs.filter((j) => j.status === "running").length,
  };
}
