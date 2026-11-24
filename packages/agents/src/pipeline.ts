import type { AgentNote, AnalysisMode, AnalysisReport } from "@taa/shared";
import { renderContext, type AnalysisContext } from "./context";
import { extractJson, normalizeReport } from "./json";
import type { LLMClient } from "./llm/types";
import {
  ANALYSTS,
  BEAR_SYSTEM,
  BULL_SYSTEM,
  PM_SYSTEM,
  QUICK_SYSTEM,
  RISK_SYSTEM,
  TRADER_SYSTEM,
} from "./prompts";
import { applyHouseRules } from "./rules";

/**
 * QUICK mode (1 LLM call) — daily_stock_analysis style "decision dashboard".
 * Good for daily watchlist sweeps and cron jobs.
 */
export async function runQuickAnalysis(ctx: AnalysisContext, llm: LLMClient): Promise<AnalysisReport> {
  const facts = renderContext(ctx);
  const res = await llm.generate({
    system: QUICK_SYSTEM,
    prompt: `${facts}\n\nProduce the decision dashboard JSON for ${ctx.symbol}.`,
    tier: "fast",
    json: true,
  });
  const report = normalizeReport(extractJson(res.text), {
    symbol: ctx.symbol,
    mode: "quick",
    provider: res.provider,
    model: res.model,
    price: ctx.quote?.price ?? null,
  });
  return applyHouseRules(report, ctx);
}

/**
 * DEEP mode (8 LLM calls) — TradingAgents-style multi-agent flow:
 *   [Technical, Fundamentals, News] analysts (parallel)
 *   → Bull vs Bear researchers (parallel, one debate round)
 *   → Trader plan → Risk manager → Portfolio manager (final JSON).
 */
export async function runDeepAnalysis(ctx: AnalysisContext, llm: LLMClient): Promise<AnalysisReport> {
  const facts = renderContext(ctx);
  const notes: AgentNote[] = [];
  const say = async (role: string, system: string, prompt: string, tier: "fast" | "deep" = "fast") => {
    const r = await llm.generate({ system, prompt, tier, maxTokens: 1200 });
    return { role, content: r.text };
  };

  // 1) Analyst team (parallel)
  const analysts = await Promise.all(
    Object.values(ANALYSTS).map((a) => say(a.role, a.system, facts)),
  );
  notes.push(...analysts);
  const analystBlock = analysts.map((n) => `### ${n.role}\n${n.content}`).join("\n\n");

  // 2) Research debate (parallel, one round)
  const debatePrompt = `${facts}\n\n## Analyst reports\n${analystBlock}`;
  const [bull, bear] = await Promise.all([
    say("Bull Researcher", BULL_SYSTEM, debatePrompt),
    say("Bear Researcher", BEAR_SYSTEM, debatePrompt),
  ]);
  notes.push(bull, bear);

  // 3) Trader
  const debateBlock = `### Bull case\n${bull.content}\n\n### Bear case\n${bear.content}`;
  const trader = await say("Trader", TRADER_SYSTEM, `${facts}\n\n${debateBlock}`, "deep");
  notes.push(trader);

  // 4) Risk management
  const risk = await say("Risk Manager", RISK_SYSTEM, `${facts}\n\n### Trader plan\n${trader.content}`);
  notes.push(risk);

  // 5) Portfolio manager — final structured decision
  const final = await llm.generate({
    system: PM_SYSTEM,
    prompt: `${facts}\n\n## Analyst reports\n${analystBlock}\n\n## Debate\n${debateBlock}\n\n### Trader plan\n${trader.content}\n\n### Risk review\n${risk.content}\n\nReturn the final decision JSON for ${ctx.symbol}.`,
    tier: "deep",
    json: true,
  });

  const report = normalizeReport(extractJson(final.text), {
    symbol: ctx.symbol,
    mode: "deep",
    provider: final.provider,
    model: final.model,
    price: ctx.quote?.price ?? null,
  });
  report.agentNotes = notes;
  return applyHouseRules(report, ctx);
}

export function runAnalysis(mode: AnalysisMode, ctx: AnalysisContext, llm: LLMClient): Promise<AnalysisReport> {
  return mode === "deep" ? runDeepAnalysis(ctx, llm) : runQuickAnalysis(ctx, llm);
}
