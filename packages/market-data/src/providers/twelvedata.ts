import type { Candle, CandleRange, Quote, SymbolMatch } from "@taa/shared";
import { ProviderError, RANGE_DAYS, type FetchLike, type MarketDataProvider } from "../types";

/**
 * Twelve Data (https://twelvedata.com) — daily OHLCV history, quotes and
 * symbol search for US + many international exchanges (free tier ~800 req/day,
 * 8 req/min). Used as the primary candle source and as a quote fallback.
 */
export class TwelveDataProvider implements MarketDataProvider {
  readonly name = "twelvedata";
  private readonly base = "https://api.twelvedata.com";

  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: FetchLike = fetch,
  ) {}

  private async get<T>(path: string, params: Record<string, string>): Promise<T> {
    const url = new URL(this.base + path);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await this.fetchFn(url.toString(), {
      headers: { Authorization: `apikey ${this.apiKey}` },
    });
    if (!res.ok) throw new ProviderError(this.name, `${path} HTTP ${res.status}`, res.status);
    const body = (await res.json()) as T & { status?: string; message?: string; code?: number };
    if (body && body.status === "error") {
      throw new ProviderError(this.name, body.message ?? "error", body.code);
    }
    return body;
  }

  async getQuote(symbol: string): Promise<Quote> {
    const q = await this.get<Record<string, string | number | boolean | undefined>>("/quote", { symbol });
    const n = (v: unknown) => (v === undefined || v === null || v === "" ? null : Number(v));
    const price = n(q.close);
    if (price === null) throw new ProviderError(this.name, `no quote for ${symbol}`, 404);
    return {
      symbol,
      price,
      change: n(q.change) ?? 0,
      changePercent: n(q.percent_change) ?? 0,
      open: n(q.open),
      high: n(q.high),
      low: n(q.low),
      prevClose: n(q.previous_close),
      timestamp: n(q.last_quote_at) ?? n(q.timestamp) ?? Math.floor(Date.now() / 1000),
      currency: q.currency as string | undefined,
      source: this.name,
    };
  }

  async getCandles(symbol: string, range: CandleRange): Promise<Candle[]> {
    // ~252 trading days per 365 calendar days; request a small margin.
    const outputsize = Math.min(5000, Math.ceil((RANGE_DAYS[range] * 252) / 365) + 5);
    const r = await this.get<{ values?: { datetime: string; open: string; high: string; low: string; close: string; volume?: string }[] }>(
      "/time_series",
      { symbol, interval: "1day", outputsize: String(outputsize), order: "ASC" },
    );
    return (r.values ?? []).map((v) => ({
      t: Math.floor(Date.parse(`${v.datetime}T00:00:00Z`) / 1000),
      o: Number(v.open),
      h: Number(v.high),
      l: Number(v.low),
      c: Number(v.close),
      v: Number(v.volume ?? 0),
    }));
  }

  async search(query: string): Promise<SymbolMatch[]> {
    const r = await this.get<{ data?: { symbol: string; instrument_name: string; exchange: string; instrument_type: string }[] }>(
      "/symbol_search",
      { symbol: query, outputsize: "15" },
    );
    return (r.data ?? []).map((m) => ({
      symbol: m.symbol,
      description: m.instrument_name,
      exchange: m.exchange,
      type: m.instrument_type,
    }));
  }
}
