import { applyHouseRules, normalizeReport, runAnalysis, type AnalysisContext } from "@taa/agents";
import { technicalSnapshot } from "@taa/market-data";
import {
  MAX_CELL_CHARS,
  summarizePortfolio,
  type AnalysisMode,
  type AnalysisRecord,
  type AnalysisReport,
  type Transaction,
} from "@taa/shared";
import type { Env } from "../env";
import type { Store } from "../lib/store";
import { llm, marketData } from "./deps";

const settled = async <T>(p: Promise<T>): Promise<T | null> => {
  try {
    return await p;
  } catch {
    return null;
  }
};

/** Gather live facts for a symbol. Missing pieces become null — agents are told to cope. */
export async function buildContext(env: Env, store: Store, symbol: string): Promise<AnalysisContext> {
  const md = marketData(env);
  const [quote, candles, profile, metrics, news, txs] = await Promise.all([
    settled(md.getQuote(symbol)),
    settled(md.getCandles(symbol, "1y")),
    settled(md.getProfile(symbol)),
    settled(md.getMetrics(symbol)),
    settled(md.getNews(symbol, 7)),
    settled(store.list("transactions")),
  ]);
  const summary = txs ? summarizePortfolio(txs as unknown as Transaction[], quote ? { [symbol]: quote } : {}) : null;
  return {
    symbol,
    asOf: new Date().toISOString(),
    quote,
    technicals: candles && candles.length ? technicalSnapshot(candles) : null,
    profile,
    metrics,
    news: news ?? [],
    position: summary?.positions.find((p) => p.symbol === symbol) ?? null,
  };
}

/** Live facts for an analysis; 404s when there is nothing to analyze. */
export async function requireContext(env: Env, store: Store, symbol: string): Promise<AnalysisContext> {
  const ctx = await buildContext(env, store, symbol);
  if (!ctx.quote && !ctx.technicals) {
    throw Object.assign(new Error(`No market data for ${symbol} — check the symbol and market data API keys`), { status: 404 });
  }
  return ctx;
}

/** Run an analysis with the Worker's API-based LLMs and persist it to the user's "analyses" tab. */
export async function analyzeAndSave(env: Env, store: Store, symbol: string, mode: AnalysisMode): Promise<AnalysisReport> {
  const ctx = await requireContext(env, store, symbol);
  const report = await runAnalysis(mode, ctx, llm(env));
  await saveReport(store, report);
  return report;
}

/**
 * Accept a report produced by the local runner. Never trust its shape or its
 * numbers: re-normalize it and re-apply the house rules against the context the
 * Worker itself built, so the saved levels and checklist come from code.
 */
export function acceptRunnerReport(
  raw: Record<string, unknown>,
  ctx: AnalysisContext,
  meta: { mode: AnalysisMode; engine: string },
): AnalysisReport {
  const [provider = "runner", ...rest] = meta.engine.split(":");
  const report = normalizeReport(raw, {
    symbol: ctx.symbol,
    mode: meta.mode,
    provider: `${provider} (local)`.slice(0, 60),
    model: (rest.join(":") || String(raw.model ?? "unknown")).slice(0, 80),
    price: ctx.quote?.price ?? null,
  });
  const notes = Array.isArray(raw.agentNotes) ? raw.agentNotes : [];
  report.agentNotes =
    meta.mode === "deep"
      ? notes.slice(0, 12).flatMap((n) => {
          const o = (n ?? {}) as Record<string, unknown>;
          return typeof o.role === "string" && typeof o.content === "string"
            ? [{ role: o.role.slice(0, 60), content: o.content.slice(0, 6000) }]
            : [];
        })
      : [];
  return applyHouseRules(report, ctx);
}

/** Persist a finished report; returns the new analyses row id. */
export async function saveReport(store: Store, report: AnalysisReport): Promise<string> {
  const { symbol, mode } = report;
  let reportJson = JSON.stringify(report);
  if (reportJson.length > MAX_CELL_CHARS) {
    reportJson = JSON.stringify({ ...report, agentNotes: report.agentNotes.map((n) => ({ ...n, content: n.content.slice(0, 1500) })) });
  }
  const record: AnalysisRecord = {
    id: crypto.randomUUID(),
    created_at: report.createdAt,
    symbol,
    mode,
    provider: report.provider,
    model: report.model,
    decision: report.decision,
    confidence: report.confidence,
    price: report.priceAtAnalysis,
    target_price: report.targetPrice,
    stop_loss: report.stopLoss,
    summary: report.oneLiner,
    report_json: reportJson,
  };
  await store.insert("analyses", record as unknown as Record<string, string | number | null>);
  return record.id;
}
