import type { CompanyProfile, KeyMetrics, NewsItem, Quote, SymbolMatch } from "@taa/shared";
import { ProviderError, type FetchLike, type MarketDataProvider } from "../types";

/**
 * Finnhub (https://finnhub.io) — real-time US quotes, symbol search, company
 * profile, basic financials and company news on the free tier (~60 req/min).
 * Historical candles are NOT used from Finnhub (premium on most plans);
 * Twelve Data handles candles.
 */
export class FinnhubProvider implements MarketDataProvider {
  readonly name = "finnhub";
  private readonly base = "https://finnhub.io/api/v1";

  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: FetchLike = fetch,
  ) {}

  private async get<T>(path: string, params: Record<string, string>): Promise<T> {
    const url = new URL(this.base + path);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await this.fetchFn(url.toString(), {
      headers: { "X-Finnhub-Token": this.apiKey },
    });
    if (!res.ok) throw new ProviderError(this.name, `${path} HTTP ${res.status}`, res.status);
    return (await res.json()) as T;
  }

  async getQuote(symbol: string): Promise<Quote> {
    const q = await this.get<{ c: number; d: number | null; dp: number | null; h: number; l: number; o: number; pc: number; t: number }>(
      "/quote",
      { symbol },
    );
    // Finnhub returns all zeros for unknown symbols.
    if (!q || (q.c === 0 && q.pc === 0 && q.t === 0)) {
      throw new ProviderError(this.name, `no quote for ${symbol}`, 404);
    }
    return {
      symbol,
      price: q.c,
      change: q.d ?? q.c - q.pc,
      changePercent: q.dp ?? (q.pc ? ((q.c - q.pc) / q.pc) * 100 : 0),
      open: q.o || null,
      high: q.h || null,
      low: q.l || null,
      prevClose: q.pc || null,
      timestamp: q.t,
      source: this.name,
    };
  }

  async search(query: string): Promise<SymbolMatch[]> {
    const r = await this.get<{ result: { symbol: string; description: string; type: string; displaySymbol: string }[] }>(
      "/search",
      { q: query },
    );
    return (r.result ?? []).slice(0, 15).map((m) => ({
      symbol: m.symbol,
      description: m.description,
      type: m.type,
    }));
  }

  async getProfile(symbol: string): Promise<CompanyProfile> {
    const p = await this.get<Record<string, unknown>>("/stock/profile2", { symbol });
    if (!p || !p.name) throw new ProviderError(this.name, `no profile for ${symbol}`, 404);
    return {
      symbol,
      name: String(p.name),
      exchange: p.exchange as string | undefined,
      currency: p.currency as string | undefined,
      country: p.country as string | undefined,
      industry: p.finnhubIndustry as string | undefined,
      // Finnhub reports market cap in millions.
      marketCap: typeof p.marketCapitalization === "number" ? p.marketCapitalization * 1e6 : null,
      logo: p.logo as string | undefined,
      weburl: p.weburl as string | undefined,
    };
  }

  async getMetrics(symbol: string): Promise<KeyMetrics> {
    const r = await this.get<{ metric?: Record<string, number | null> }>("/stock/metric", { symbol, metric: "all" });
    const m = r.metric ?? {};
    const num = (k: string) => (typeof m[k] === "number" ? (m[k] as number) : null);
    return {
      peTTM: num("peTTM") ?? num("peBasicExclExtraTTM"),
      pbAnnual: num("pbAnnual"),
      epsTTM: num("epsTTM") ?? num("epsBasicExclExtraItemsTTM"),
      dividendYield: num("dividendYieldIndicatedAnnual"),
      beta: num("beta"),
      week52High: num("52WeekHigh"),
      week52Low: num("52WeekLow"),
      revenueGrowthTTM: num("revenueGrowthTTMYoy"),
      netMarginTTM: num("netProfitMarginTTM"),
      roeTTM: num("roeTTM"),
      debtToEquity: num("totalDebt/totalEquityQuarterly"),
    };
  }

  async getNews(symbol: string, days: number): Promise<NewsItem[]> {
    const to = new Date();
    const from = new Date(to.getTime() - days * 86_400_000);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const r = await this.get<{ headline: string; summary: string; source: string; url: string; datetime: number }[]>(
      "/company-news",
      { symbol, from: iso(from), to: iso(to) },
    );
    return (r ?? []).slice(0, 20).map((n) => ({
      headline: n.headline,
      summary: n.summary,
      source: n.source,
      url: n.url,
      datetime: n.datetime,
    }));
  }
}
