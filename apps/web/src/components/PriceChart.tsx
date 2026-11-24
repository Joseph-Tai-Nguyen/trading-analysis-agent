import type { Candle, CandleRange } from "@taa/shared";
import { useMemo, useState } from "react";
import { money } from "../lib/format";

const RANGES: CandleRange[] = ["1m", "3m", "6m", "1y", "2y", "5y"];
const W = 800;
const H = 260;
const PAD = { t: 12, r: 8, b: 22, l: 8 };

/** Dependency-free SVG area chart with SMA50 overlay and hover crosshair. */
export function PriceChart({
  candles,
  range,
  onRange,
  currency,
}: {
  candles: Candle[];
  range: CandleRange;
  onRange: (r: CandleRange) => void;
  currency?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const geo = useMemo(() => {
    if (candles.length < 2) return null;
    const closes = candles.map((c) => c.c);
    const sma50 = closes.map((_, i) => (i >= 49 ? closes.slice(i - 49, i + 1).reduce((a, b) => a + b, 0) / 50 : null));
    const lo = Math.min(...candles.map((c) => c.l));
    const hi = Math.max(...candles.map((c) => c.h));
    const pad = (hi - lo) * 0.05 || 1;
    const min = lo - pad;
    const max = hi + pad;
    const x = (i: number) => PAD.l + (i / (candles.length - 1)) * (W - PAD.l - PAD.r);
    const y = (v: number) => PAD.t + (1 - (v - min) / (max - min)) * (H - PAD.t - PAD.b);
    const line = closes.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
    const area = `${line}L${x(closes.length - 1).toFixed(1)},${H - PAD.b}L${x(0).toFixed(1)},${H - PAD.b}Z`;
    const smaPath = sma50
      .map((v, i) => (v == null ? "" : `${sma50[i - 1] == null ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`))
      .join("");
    const up = closes[closes.length - 1]! >= closes[0]!;
    return { x, y, line, area, smaPath, up, first: closes[0]! };
  }, [candles]);

  const hc = hover != null ? candles[hover] : undefined;
  const lastC = candles[candles.length - 1];
  const shown = hc ?? lastC;

  return (
    <div className="chart">
      <div className="chart-head">
        <div className="chart-readout">
          {shown && (
            <>
              <strong>{money(shown.c, currency)}</strong>
              <span>{new Date(shown.t * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</span>
              {geo && <span className={shown.c >= geo.first ? "change up" : "change down"}>{(((shown.c - geo.first) / geo.first) * 100).toFixed(2)}% in range</span>}
            </>
          )}
        </div>
        <div className="seg" role="tablist" aria-label="Range">
          {RANGES.map((r) => (
            <button key={r} role="tab" aria-selected={r === range} className={r === range ? "active" : ""} onClick={() => onRange(r)}>
              {r.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      {geo ? (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className={`chart-svg ${geo.up ? "up" : "down"}`}
          preserveAspectRatio="none"
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const rel = (e.clientX - rect.left) / rect.width;
            setHover(Math.max(0, Math.min(candles.length - 1, Math.round(rel * (candles.length - 1)))));
          }}
          onTouchMove={(e) => {
            const t = e.touches[0];
            if (!t) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const rel = (t.clientX - rect.left) / rect.width;
            setHover(Math.max(0, Math.min(candles.length - 1, Math.round(rel * (candles.length - 1)))));
          }}
          onTouchEnd={() => setHover(null)}
          role="img"
          aria-label="Price chart"
        >
          <defs>
            <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={geo.area} fill="url(#fill)" />
          <path d={geo.line} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          {geo.smaPath && <path d={geo.smaPath} className="sma" fill="none" strokeWidth="1.2" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />}
          {hc && hover != null && (
            <>
              <line x1={geo.x(hover)} x2={geo.x(hover)} y1={PAD.t} y2={H - PAD.b} className="crosshair" vectorEffect="non-scaling-stroke" />
              <circle cx={geo.x(hover)} cy={geo.y(hc.c)} r="4" fill="currentColor" />
            </>
          )}
        </svg>
      ) : (
        <div className="chart-empty">No price history available</div>
      )}
      <div className="chart-legend">
        <span className="legend-line" /> Close <span className="legend-line dashed" /> SMA 50
      </div>
    </div>
  );
}
