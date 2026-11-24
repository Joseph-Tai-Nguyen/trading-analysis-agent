import type { TechnicalSnapshot } from "@taa/market-data";
import { describe, expect, it } from "vitest";
import type { AnalysisContext } from "./context";
import { normalizeReport } from "./json";
import { applyHouseRules, rewardRisk, RULE_ITEMS } from "./rules";

const tech = (over: Partial<TechnicalSnapshot>): TechnicalSnapshot =>
  ({
    lastClose: 110, sma5: 100, sma10: 98, sma20: 95, sma50: 90, sma200: 80, ema12: null, ema26: null,
    rsi14: 60, macd: null, macdSignal: null, macdHist: null, atr14: 2, biasSma5Pct: 10, biasSma20Pct: null,
    volumeRatio: null, high52w: null, low52w: null, change1mPct: null, change3mPct: null, change1yPct: null,
    maAlignment: "bullish", signals: [], ...over,
  }) as TechnicalSnapshot;

const ctx = (t: TechnicalSnapshot | null): AnalysisContext => ({
  symbol: "TEST", asOf: "2026-11-24", technicals: t, profile: null, metrics: null, news: [], position: null,
  quote: { symbol: "TEST", price: 110, change: 0, changePercent: 0, open: null, high: null, low: null, prevClose: null, timestamp: 0, source: "mock" },
});

const report = (raw: Record<string, unknown>) =>
  normalizeReport({ confidence: 80, oneLiner: "Strong trend.", ...raw }, { symbol: "TEST", mode: "quick", provider: "p", model: "m", price: 110 });

const item = (r: ReturnType<typeof applyHouseRules>, name: string) => r.checklist.find((c) => c.item === name);

describe("house rules", () => {
  it("never lets a BUY through when price is > 5% above MA5", () => {
    const r = applyHouseRules(report({ decision: "STRONG_BUY", entryPrice: 110, targetPrice: 130, stopLoss: 104 }), ctx(tech({})));
    expect(r.decision).toBe("HOLD");
    expect(r.confidence).toBeLessThanOrEqual(60);
    expect(r.entryPrice).toBe(100); // buy point moved to MA5
    expect(item(r, RULE_ITEMS.chase)?.status).toBe("fail");
    expect(r.ruleNotes?.join(" ")).toMatch(/Don't chase/);
  });

  it("keeps a BUY near MA5 and computes reward/risk from the levels", () => {
    const r = applyHouseRules(report({ decision: "BUY", entryPrice: 101, targetPrice: 121, stopLoss: 96 }), ctx(tech({ biasSma5Pct: 1.2 })));
    expect(r.decision).toBe("BUY");
    expect(r.rewardRisk).toBe(4);
    expect(item(r, RULE_ITEMS.chase)?.status).toBe("pass");
    expect(item(r, RULE_ITEMS.trend)?.status).toBe("pass");
    expect(item(r, RULE_ITEMS.rr)?.status).toBe("pass");
  });

  it("drops a stop loss above the buy point and flags the missing stop", () => {
    const r = applyHouseRules(report({ decision: "BUY", entryPrice: 100, targetPrice: 120, stopLoss: 105 }), ctx(tech({ biasSma5Pct: 3 })));
    expect(r.stopLoss).toBeNull();
    expect(r.rewardRisk).toBeNull();
    expect(item(r, RULE_ITEMS.chase)?.status).toBe("warn");
    expect(r.ruleNotes?.join(" ")).toMatch(/No valid stop loss/);
  });

  it("replaces the model's own checklist item instead of duplicating it", () => {
    const r = applyHouseRules(
      report({ decision: "HOLD", checklist: [{ item: "Not chasing (bias vs MA5 <= 5%)", status: "pass" }] }),
      ctx(tech({ maAlignment: "bearish" })),
    );
    expect(r.checklist.filter((c) => /chas/i.test(c.item))).toHaveLength(1);
    expect(item(r, RULE_ITEMS.trend)?.status).toBe("fail");
  });

  it("copes with missing technicals", () => {
    const r = applyHouseRules(report({ decision: "BUY" }), ctx(null));
    expect(r.decision).toBe("BUY");
    expect(item(r, RULE_ITEMS.chase)?.status).toBe("warn");
  });

  it("rewardRisk needs stop < entry < target", () => {
    expect(rewardRisk(100, 120, 90)).toBe(2);
    expect(rewardRisk(100, 90, 95)).toBeNull();
    expect(rewardRisk(null, 120, 90)).toBeNull();
  });
});
