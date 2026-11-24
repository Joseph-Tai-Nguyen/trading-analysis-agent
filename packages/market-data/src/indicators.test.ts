import { describe, expect, it } from "vitest";
import type { Candle } from "@taa/shared";
import { ema, rsi, sma, technicalSnapshot } from "./indicators";

const candles = (closes: number[]): Candle[] =>
  closes.map((c, i) => ({ t: 1_700_000_000 + i * 86_400, o: c, h: c + 1, l: c - 1, c, v: 1000 }));

describe("indicators", () => {
  it("sma", () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });

  it("ema seeds with sma and converges toward price", () => {
    const e = ema([1, 2, 3, 4, 5, 6], 3);
    expect(e[2]).toBeCloseTo(2);
    expect(e[5]!).toBeGreaterThan(4);
  });

  it("rsi is 100 on a straight uptrend and ~0 on a downtrend", () => {
    const up = Array.from({ length: 30 }, (_, i) => i + 1);
    expect(rsi(up).at(-1)).toBe(100);
    expect(rsi([...up].reverse()).at(-1)!).toBeLessThan(1);
  });

  it("technicalSnapshot detects bullish alignment and chasing", () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + i);
    closes.push(200); // spike far above MA5
    const snap = technicalSnapshot(candles(closes));
    expect(snap.maAlignment).toBe("bullish");
    expect(snap.biasSma5Pct!).toBeGreaterThan(5);
    expect(snap.signals.some((s) => s.includes("avoid chasing"))).toBe(true);
    expect(snap.high52w).toBe(201);
  });
});
