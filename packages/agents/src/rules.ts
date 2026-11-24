import type { AnalysisReport, ChecklistItem, CheckStatus } from "@taa/shared";
import type { AnalysisContext } from "./context";

// Deterministic house rules, applied in code AFTER the model answers.
// Prompts ask the model to follow these too, but models drift, so the code is
// what guarantees them (daily_stock_analysis discipline):
//   - Don't chase: price > 5% above MA5 never gets a BUY; the buy point moves to MA5.
//   - Trend: the MA-alignment checklist item comes from the computed MAs.
//   - Levels must make sense: stop < buy point < target for a buy call, and
//     reward/risk is computed from those levels, not guessed.

export const CHASE_LIMIT_PCT = 5;
/** Below this bias the price is close enough to MA5 to be an ideal buy point. */
export const IDEAL_BIAS_PCT = 2;

export const RULE_ITEMS = {
  trend: "Trend (MA5 > MA10 > MA20)",
  chase: "Not chasing (price ≤ 5% above MA5)",
  rr: "Reward / risk ≥ 2",
} as const;

const round2 = (n: number) => Math.round(n * 100) / 100;
const isBuy = (d: AnalysisReport["decision"]) => d === "BUY" || d === "STRONG_BUY";

/** Reward/risk of a long setup, or null when the levels don't form one. */
export function rewardRisk(entry: number | null, target: number | null, stop: number | null): number | null {
  if (entry == null || target == null || stop == null) return null;
  if (!(stop < entry && entry < target)) return null;
  return round2((target - entry) / (entry - stop));
}

function upsert(list: ChecklistItem[], item: string, status: CheckStatus, note: string, match: RegExp) {
  const i = list.findIndex((c) => match.test(c.item));
  const next = { item, status, note };
  if (i >= 0) list[i] = next;
  else list.unshift(next);
}

/** Enforce the house rules on a normalized report. Returns a new report. */
export function applyHouseRules(input: AnalysisReport, ctx: AnalysisContext): AnalysisReport {
  const r: AnalysisReport = { ...input, checklist: [...input.checklist], ruleNotes: [...(input.ruleNotes ?? [])] };
  const notes = r.ruleNotes!;
  const t = ctx.technicals;
  const bias = t?.biasSma5Pct ?? null;
  const ma5 = t?.sma5 ?? null;

  // 1) Trend — status from the computed MA alignment.
  if (t) {
    const status: CheckStatus = t.maAlignment === "bullish" ? "pass" : t.maAlignment === "bearish" ? "fail" : "warn";
    const note = `MA5 ${t.sma5 ?? "?"} / MA10 ${t.sma10 ?? "?"} / MA20 ${t.sma20 ?? "?"} — ${t.maAlignment} (computed)`;
    upsert(r.checklist, RULE_ITEMS.trend, status, note, /trend|alignment/i);
  }

  // 2) Don't chase — status from the computed bias vs MA5.
  if (bias == null) {
    upsert(r.checklist, RULE_ITEMS.chase, "warn", "No MA5 data — cannot check (computed)", /chas|bias/i);
  } else {
    const status: CheckStatus = bias > CHASE_LIMIT_PCT ? "fail" : bias > IDEAL_BIAS_PCT ? "warn" : "pass";
    const where = bias >= 0 ? `${bias.toFixed(1)}% above` : `${Math.abs(bias).toFixed(1)}% below`;
    upsert(r.checklist, RULE_ITEMS.chase, status, `Price ${where} MA5 (computed)`, /chas|bias/i);

    if (bias > CHASE_LIMIT_PCT && isBuy(r.decision)) {
      notes.push(`Don't chase: price is ${bias.toFixed(1)}% above MA5 (limit ${CHASE_LIMIT_PCT}%), so ${r.decision} was changed to HOLD — wait for a pullback.`);
      r.decision = "HOLD";
      r.confidence = Math.min(r.confidence, 60);
      if (!/^wait/i.test(r.oneLiner)) r.oneLiner = `Wait for a pullback toward MA5 — ${r.oneLiner}`.slice(0, 400);
    }
    if (bias > CHASE_LIMIT_PCT && ma5 != null && (r.entryPrice == null || r.entryPrice > ma5)) {
      notes.push(`Buy point set to MA5 (${round2(ma5)}) instead of chasing.`);
      r.entryPrice = round2(ma5);
    }
  }

  // 3) Levels — for a long setup the stop must be below and the target above the buy point.
  if (isBuy(r.decision) || r.decision === "HOLD") {
    const entry = r.entryPrice ?? ctx.quote?.price ?? null;
    if (entry != null && r.stopLoss != null && r.stopLoss >= entry) {
      notes.push(`Stop loss ${r.stopLoss} was not below the buy point ${entry}, so it was removed.`);
      r.stopLoss = null;
    }
    if (entry != null && r.targetPrice != null && r.targetPrice <= entry) {
      notes.push(`Target ${r.targetPrice} was not above the buy point ${entry}, so it was removed.`);
      r.targetPrice = null;
    }
  }
  if (isBuy(r.decision) && r.stopLoss == null) notes.push("No valid stop loss — define one before acting.");

  // 4) Reward / risk — computed from the levels.
  const rr = rewardRisk(r.entryPrice ?? ctx.quote?.price ?? null, r.targetPrice, r.stopLoss);
  r.rewardRisk = rr;
  if (isBuy(r.decision) || rr != null) {
    const status: CheckStatus = rr == null ? "warn" : rr >= 2 ? "pass" : rr >= 1 ? "warn" : "fail";
    upsert(r.checklist, RULE_ITEMS.rr, status, rr == null ? "Levels incomplete (computed)" : `${rr.toFixed(1)} : 1 (computed)`, /reward|risk\s*\/|r\/r|rr\b/i);
  }

  return r;
}
