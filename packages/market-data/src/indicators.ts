import type { Candle } from "@taa/shared";

// Pure, deterministic technical indicators. Numbers are computed here — never
// by the LLM — and passed to the agents as facts.

export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!;
    if (i >= period) sum -= values[i - period]!;
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i]! * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Wilder's RSI. */
export function rsi(values: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i]! - values[i - 1]!;
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i]! - values[i - 1]!;
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

export function macd(values: number[], fast = 12, slow = 26, signal = 9) {
  const ef = ema(values, fast);
  const es = ema(values, slow);
  const line = values.map((_, i) => (ef[i] != null && es[i] != null ? ef[i]! - es[i]! : null));
  const firstIdx = line.findIndex((v) => v != null);
  const sig: (number | null)[] = new Array(values.length).fill(null);
  if (firstIdx >= 0) {
    const compact = line.slice(firstIdx) as number[];
    ema(compact, signal).forEach((v, j) => (sig[firstIdx + j] = v));
  }
  const hist = line.map((v, i) => (v != null && sig[i] != null ? v - sig[i]! : null));
  return { line, signal: sig, hist };
}

/** Average True Range (Wilder). */
export function atr(candles: Candle[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(candles.length).fill(null);
  if (candles.length <= period) return out;
  const tr = candles.map((c, i) =>
    i === 0 ? c.h - c.l : Math.max(c.h - c.l, Math.abs(c.h - candles[i - 1]!.c), Math.abs(c.l - candles[i - 1]!.c)),
  );
  let prev = tr.slice(1, period + 1).reduce((a, b) => a + b, 0) / period;
  out[period] = prev;
  for (let i = period + 1; i < candles.length; i++) {
    prev = (prev * (period - 1) + tr[i]!) / period;
    out[i] = prev;
  }
  return out;
}

const last = <T>(arr: (T | null)[]): T | null => {
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return arr[i]!;
  return null;
};
const round = (v: number | null, d = 2) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);

export type Trend = "bullish" | "bearish" | "neutral";

export interface TechnicalSnapshot {
  lastClose: number | null;
  lastDate: string | null;
  sma5: number | null;
  sma10: number | null;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  ema12: number | null;
  ema26: number | null;
  rsi14: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHist: number | null;
  atr14: number | null;
  /** % distance of price from SMA5 ("bias rate"). >5% = chasing a high. */
  biasSma5Pct: number | null;
  /** % distance from SMA20. */
  biasSma20Pct: number | null;
  /** Today's volume / 20-day average volume. */
  volumeRatio: number | null;
  high52w: number | null;
  low52w: number | null;
  change1mPct: number | null;
  change3mPct: number | null;
  change1yPct: number | null;
  /** MA5 > MA10 > MA20 = bullish alignment; reverse = bearish. */
  maAlignment: Trend;
  /** Rule-based signals derived from the numbers above. */
  signals: string[];
}

/** Compute a compact technical snapshot from daily candles (oldest → newest). */
export function technicalSnapshot(candles: Candle[]): TechnicalSnapshot {
  const closes = candles.map((c) => c.c);
  const vols = candles.map((c) => c.v);
  const lastClose = closes.length ? closes[closes.length - 1]! : null;
  const lastCandle = candles[candles.length - 1];
  const s5 = last(sma(closes, 5));
  const s10 = last(sma(closes, 10));
  const s20 = last(sma(closes, 20));
  const s50 = last(sma(closes, 50));
  const s200 = last(sma(closes, 200));
  const m = macd(closes);
  const r = last(rsi(closes, 14));
  const avgVol20 = last(sma(vols, 20));
  const window = candles.slice(-252);
  const pct = (back: number) => {
    if (closes.length <= back || lastClose == null) return null;
    const ref = closes[closes.length - 1 - back]!;
    return ref ? ((lastClose - ref) / ref) * 100 : null;
  };

  let maAlignment: Trend = "neutral";
  if (s5 != null && s10 != null && s20 != null) {
    if (s5 > s10 && s10 > s20) maAlignment = "bullish";
    else if (s5 < s10 && s10 < s20) maAlignment = "bearish";
  }

  const biasSma5Pct = lastClose != null && s5 ? ((lastClose - s5) / s5) * 100 : null;
  const biasSma20Pct = lastClose != null && s20 ? ((lastClose - s20) / s20) * 100 : null;
  const volumeRatio = lastCandle && avgVol20 ? lastCandle.v / avgVol20 : null;
  const macdLine = last(m.line);
  const macdSig = last(m.signal);

  const signals: string[] = [];
  if (maAlignment === "bullish") signals.push("Bullish MA alignment (MA5 > MA10 > MA20)");
  if (maAlignment === "bearish") signals.push("Bearish MA alignment (MA5 < MA10 < MA20)");
  if (biasSma5Pct != null && biasSma5Pct > 5) signals.push(`Price ${biasSma5Pct.toFixed(1)}% above MA5 — avoid chasing`);
  if (biasSma5Pct != null && biasSma5Pct < -5) signals.push(`Price ${Math.abs(biasSma5Pct).toFixed(1)}% below MA5 — stretched to downside`);
  if (r != null && r > 70) signals.push(`RSI ${r.toFixed(0)} overbought`);
  if (r != null && r < 30) signals.push(`RSI ${r.toFixed(0)} oversold`);
  if (macdLine != null && macdSig != null) signals.push(macdLine > macdSig ? "MACD above signal" : "MACD below signal");
  if (s50 != null && s200 != null) signals.push(s50 > s200 ? "SMA50 above SMA200 (long-term uptrend)" : "SMA50 below SMA200 (long-term downtrend)");
  if (volumeRatio != null && volumeRatio > 2) signals.push(`Volume ${volumeRatio.toFixed(1)}x 20-day average`);

  return {
    lastClose: round(lastClose),
    lastDate: lastCandle ? new Date(lastCandle.t * 1000).toISOString().slice(0, 10) : null,
    sma5: round(s5),
    sma10: round(s10),
    sma20: round(s20),
    sma50: round(s50),
    sma200: round(s200),
    ema12: round(last(ema(closes, 12))),
    ema26: round(last(ema(closes, 26))),
    rsi14: round(r, 1),
    macd: round(macdLine, 3),
    macdSignal: round(macdSig, 3),
    macdHist: round(last(m.hist), 3),
    atr14: round(last(atr(candles, 14))),
    biasSma5Pct: round(biasSma5Pct),
    biasSma20Pct: round(biasSma20Pct),
    volumeRatio: round(volumeRatio),
    high52w: window.length ? round(Math.max(...window.map((c) => c.h))) : null,
    low52w: window.length ? round(Math.min(...window.map((c) => c.l))) : null,
    change1mPct: round(pct(21)),
    change3mPct: round(pct(63)),
    change1yPct: round(pct(252)),
    maAlignment,
    signals,
  };
}
