import type { CompanyProfile, KeyMetrics, NewsItem, Position, Quote } from "@taa/shared";
import type { TechnicalSnapshot } from "@taa/market-data";

/** Everything the agents are allowed to know. Built by the Worker from live data. */
export interface AnalysisContext {
  symbol: string;
  asOf: string;
  quote: Quote | null;
  technicals: TechnicalSnapshot | null;
  profile: CompanyProfile | null;
  metrics: KeyMetrics | null;
  news: NewsItem[];
  /** The user's current position, if any — lets agents tailor hold/trim advice. */
  position: Position | null;
}

/** Render the context as a compact, LLM-friendly fact sheet. */
export function renderContext(ctx: AnalysisContext): string {
  const lines: string[] = [];
  lines.push(`# Fact sheet: ${ctx.symbol} (as of ${ctx.asOf})`);
  if (ctx.profile) {
    const p = ctx.profile;
    lines.push(
      `Company: ${p.name} | Exchange: ${p.exchange ?? "?"} | Industry: ${p.industry ?? "?"} | Country: ${p.country ?? "?"} | Currency: ${p.currency ?? "?"}` +
        (p.marketCap ? ` | Market cap: ${(p.marketCap / 1e9).toFixed(1)}B` : ""),
    );
  }
  if (ctx.quote) {
    const q = ctx.quote;
    lines.push(
      `Quote: price ${q.price} | change ${q.change.toFixed(2)} (${q.changePercent.toFixed(2)}%) | open ${q.open ?? "?"} | high ${q.high ?? "?"} | low ${q.low ?? "?"} | prev close ${q.prevClose ?? "?"} | source ${q.source}`,
    );
  } else {
    lines.push("Quote: unavailable");
  }
  if (ctx.technicals) {
    const { signals, ...nums } = ctx.technicals;
    lines.push("## Technicals (computed, daily bars)");
    lines.push(JSON.stringify(nums));
    if (signals.length) lines.push(`Rule signals: ${signals.join("; ")}`);
  }
  if (ctx.metrics) {
    lines.push("## Fundamentals (TTM unless noted)");
    lines.push(JSON.stringify(ctx.metrics));
  }
  if (ctx.news.length) {
    lines.push("## Recent news (newest first)");
    for (const n of ctx.news.slice(0, 10)) {
      const d = new Date(n.datetime * 1000).toISOString().slice(0, 10);
      lines.push(`- [${d}] ${n.headline} (${n.source})${n.summary ? ` — ${n.summary.slice(0, 220)}` : ""}`);
    }
  } else {
    lines.push("## Recent news: none available");
  }
  if (ctx.position) {
    const p = ctx.position;
    lines.push(
      `## User position: ${p.quantity} shares @ avg cost ${p.avgCost.toFixed(2)} (${p.account})` +
        (p.unrealizedPLPercent != null ? `, unrealized ${p.unrealizedPLPercent.toFixed(1)}%` : "") +
        (p.weight != null ? `, ${p.weight.toFixed(1)}% of portfolio` : ""),
    );
  } else {
    lines.push("## User position: none");
  }
  return lines.join("\n");
}
