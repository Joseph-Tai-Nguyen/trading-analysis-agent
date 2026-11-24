#!/usr/bin/env node
// Local AI runner — answers the app's queued analyses on this PC using
// Antigravity CLI, Gemini CLI or Claude Code (your subscriptions, no API keys).
//
//   npm run runner -- doctor          check config, CLIs and the connection
//   npm run runner -- watch           keep running; pick up jobs as they're queued
//   npm run runner -- once            process everything queued, then exit
//   npm run runner -- sweep [--deep]  queue the whole watchlist, process it, exit
//   npm run runner -- analyze NVDA [--deep]
//
// The Worker builds the fact sheet (live prices + indicators computed in code)
// and re-checks every report with the house rules before saving it, so this
// process only contributes the model's judgment.

import { runAnalysis, type LLMRequest } from "@taa/agents";
import { DISCLAIMER, type AnalysisReport } from "@taa/shared";
import { ApiError, RunnerApi } from "./api";
import { CONFIG_FILE, loadConfig, type RunnerConfig } from "./config";
import { createEngines, type Engines } from "./engines";

const log = (...a: unknown[]) => console.log(new Date().toLocaleTimeString(), ...a);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function summarize(r: AnalysisReport): string {
  const lv = (n: number | null) => (n == null ? "—" : n.toFixed(2));
  return [
    `${r.symbol}  ${r.decision} (${r.confidence}%)  ${r.mode === "deep" ? "agent team" : "decision dashboard"}`,
    `  ${r.oneLiner}`,
    `  buy point ${lv(r.entryPrice)} · target ${lv(r.targetPrice)} · stop ${lv(r.stopLoss)} · reward/risk ${r.rewardRisk != null ? r.rewardRisk.toFixed(1) : "—"}`,
    ...(r.ruleNotes ?? []).map((n) => `  rule: ${n}`),
  ].join("\n");
}

async function setup(cfg: RunnerConfig, verbose = true): Promise<{ api: RunnerApi; engines: Engines }> {
  const onCall = (req: LLMRequest, res: { provider: string; model: string } | null, ms: number, err?: unknown) => {
    if (!verbose) return;
    const what = `${req.tier ?? "fast"}${req.json ? " json" : ""}`;
    if (res) log(`   · ${res.provider}/${res.model} ${what} ${(ms / 1000).toFixed(1)}s`);
    else log(`   · failed ${what} after ${(ms / 1000).toFixed(1)}s: ${err instanceof Error ? err.message : String(err)}`);
  };
  const engines = await createEngines(cfg, onCall);
  return { api: new RunnerApi(cfg.url, cfg.token), engines };
}

/** Claim and process one job. Returns false when the queue is empty. */
async function processNext(api: RunnerApi, engines: Engines): Promise<boolean> {
  const names = engines.found.map((f) => f.name);
  const claim = await api.claim(names);
  if (claim.skipped) log(`✕ ${claim.skipped.symbol}: ${claim.skipped.error}`);
  if (!claim.job || !claim.context) return !!claim.retry;

  const { job, context } = claim;
  log(`▶ ${job.symbol} ${job.mode === "deep" ? "deep (8-agent team)" : "quick (decision dashboard)"} — job ${job.id.slice(0, 8)}`);
  const t0 = Date.now();
  try {
    const report = await runAnalysis(job.mode, context, engines.llm);
    const saved = await api.result(job.id, report, `${report.provider}:${report.model}`);
    // Print what the Worker saved: it re-applies the house rules to the context it built.
    console.log(summarize({ ...report, decision: saved.decision as AnalysisReport["decision"], ruleNotes: saved.ruleNotes }));
    log(`✓ ${job.symbol} saved in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log(`✕ ${job.symbol} failed: ${msg}`);
    await api.fail(job.id, msg).catch(() => undefined);
  }
  return true;
}

async function drain(api: RunnerApi, engines: Engines) {
  let n = 0;
  while (await processNext(api, engines)) n++;
  log(n ? `Queue empty — processed ${n} job(s).` : "Queue empty.");
}

async function hello(api: RunnerApi, engines: Engines) {
  const h = await api.hello(engines.found.map((f) => f.name));
  log(`Connected as ${h.user} (${h.storage}). Engines: ${engines.found.map((f) => f.name).join(" → ")}. Queued: ${h.queued}.`);
  if (h.workerEngine !== "runner") log(`Note: the app is set to AI_ENGINE=${h.workerEngine}, so new analyses run in the cloud; only queued jobs come here.`);
}

async function doctor(cfg: RunnerConfig, test: boolean) {
  console.log(`Config file: ${CONFIG_FILE}`);
  console.log(`App URL:     ${cfg.url}`);
  console.log(`Token:       ${cfg.token ? "set" : "MISSING — create one in Settings → Local AI runner"}`);
  const engines = await createEngines(cfg).catch((e: Error) => {
    console.log(`Engines:     ${e.message}`);
    return null;
  });
  if (engines) {
    for (const f of engines.found) console.log(`  ✓ ${f.name.padEnd(12)} ${f.bin}  models fast=${cfg.models[f.name].fast ?? "default"} deep=${cfg.models[f.name].deep ?? "default"}`);
    for (const m of engines.missing) console.log(`  – ${m.padEnd(12)} not installed (skipped)`);
    if (test) {
      for (const f of engines.found) {
        const t0 = Date.now();
        try {
          const r = await f.client.generate({ system: "Reply with the single word OK.", prompt: "Health check.", tier: "fast" });
          console.log(`  ✓ ${f.name} answered "${r.text.trim().slice(0, 40)}" in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
        } catch (e) {
          console.log(`  ✕ ${f.name}: ${e instanceof Error ? e.message : String(e)} — open it once and sign in`);
        }
      }
    } else console.log("  (add --test to send each engine a one-word health check)");
  }
  if (cfg.token && engines) {
    try {
      await hello(new RunnerApi(cfg.url, cfg.token), engines);
    } catch (e) {
      console.log(`Connection:  ✕ ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

async function main() {
  const [cmd = "help", ...rest] = process.argv.slice(2);
  const flags = new Set(rest.filter((a) => a.startsWith("--")));
  const args = rest.filter((a) => !a.startsWith("--"));
  const cfg = loadConfig();
  const mode = flags.has("--deep") ? "deep" : "quick";

  switch (cmd) {
    case "doctor":
      return doctor(cfg, flags.has("--test"));
    case "once": {
      const { api, engines } = await setup(cfg);
      await hello(api, engines);
      return drain(api, engines);
    }
    case "sweep": {
      const { api, engines } = await setup(cfg);
      await hello(api, engines);
      const s = await api.sweep(mode);
      log(`Queued ${s.queued} watchlist symbol(s) for a ${mode} sweep.`);
      return drain(api, engines);
    }
    case "analyze": {
      const symbol = args[0];
      if (!symbol) throw new Error("usage: analyze SYMBOL [--deep]");
      const { api, engines } = await setup(cfg);
      await api.enqueue(symbol.toUpperCase(), mode);
      return drain(api, engines);
    }
    case "watch": {
      const { api, engines } = await setup(cfg);
      await hello(api, engines);
      log(`Watching for jobs every ${cfg.pollMs / 1000}s. Press Ctrl+C to stop.`);
      let stopping = false;
      process.on("SIGINT", () => {
        if (stopping) process.exit(130);
        stopping = true;
        log("Stopping after the current job… (Ctrl+C again to quit now)");
      });
      let backoff = cfg.pollMs;
      while (!stopping) {
        try {
          const worked = await processNext(api, engines);
          backoff = cfg.pollMs;
          if (!worked) await sleep(cfg.pollMs);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (e instanceof ApiError && e.status === 401) throw e;
          log(`! ${msg} — retrying in ${backoff / 1000}s`);
          await sleep(backoff);
          backoff = Math.min(backoff * 2, 5 * 60_000);
        }
      }
      return;
    }
    default:
      console.log(`Usage: npm run runner -- <command>

  doctor [--test]        check config, installed CLIs and the connection
  watch                  keep running and answer jobs as they are queued
  once                   answer everything queued now, then exit
  sweep [--deep]         queue every watchlist symbol, answer them, exit
  analyze SYMBOL [--deep]

Config: ${CONFIG_FILE} (copy runner.env.example)
${DISCLAIMER}`);
  }
}

main().catch((e) => {
  console.error(`✕ ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
