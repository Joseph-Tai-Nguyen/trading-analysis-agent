import { describe, expect, it } from "vitest";
import { computePositions, summarizePortfolio } from "./portfolio";
import type { Quote, Transaction } from "./types";

let n = 0;
const tx = (p: Partial<Transaction>): Transaction => ({
  id: String(++n),
  date: "2026-01-01",
  symbol: "AAPL",
  type: "BUY",
  quantity: 0,
  price: 0,
  fees: 0,
  account: "TFSA",
  currency: "USD",
  notes: "",
  created_at: `2026-01-01T00:00:0${n % 10}Z`,
  ...p,
});

describe("computePositions", () => {
  it("averages cost across buys and realizes P/L on sells", () => {
    const [p] = computePositions([
      tx({ date: "2026-01-01", quantity: 10, price: 100 }),
      tx({ date: "2026-01-02", quantity: 10, price: 200 }),
      tx({ date: "2026-01-03", type: "SELL", quantity: 5, price: 300 }),
    ]);
    expect(p!.quantity).toBe(15);
    expect(p!.avgCost).toBeCloseTo(150);
    expect(p!.realizedPL).toBeCloseTo(5 * (300 - 150));
    expect(p!.costBasis).toBeCloseTo(15 * 150);
  });

  it("includes fees in cost basis and closes positions fully", () => {
    const [p] = computePositions([
      tx({ quantity: 2, price: 50, fees: 1 }),
      tx({ date: "2026-02-01", type: "SELL", quantity: 2, price: 60, fees: 1 }),
    ]);
    expect(p!.quantity).toBe(0);
    expect(p!.costBasis).toBe(0);
    expect(p!.realizedPL).toBeCloseTo(119 - 101);
  });

  it("separates accounts", () => {
    const ps = computePositions([tx({ quantity: 1, price: 1 }), tx({ quantity: 1, price: 1, account: "RRSP" })]);
    expect(ps).toHaveLength(2);
  });
});

describe("summarizePortfolio", () => {
  it("computes market value, weights and day change from quotes", () => {
    const quotes: Record<string, Quote> = {
      AAPL: { symbol: "AAPL", price: 110, change: 10, changePercent: 10, open: null, high: null, low: null, prevClose: 100, timestamp: 0, source: "test" },
      MSFT: { symbol: "MSFT", price: 300, change: -3, changePercent: -1, open: null, high: null, low: null, prevClose: 303, timestamp: 0, source: "test" },
    };
    const s = summarizePortfolio(
      [tx({ quantity: 10, price: 100 }), tx({ symbol: "MSFT", quantity: 1, price: 250 })],
      quotes,
    );
    expect(s.marketValue).toBeCloseTo(1400);
    expect(s.costBasis).toBeCloseTo(1250);
    expect(s.dayChange).toBeCloseTo(100 - 3);
    expect(s.positions[0]!.symbol).toBe("AAPL");
    expect(s.positions.reduce((a, p) => a + (p.weight ?? 0), 0)).toBeCloseTo(100);
  });
});
