import type { Candle, CandleRange, CompanyProfile, KeyMetrics, NewsItem, Quote, SymbolMatch } from "@taa/shared";
import { FinnhubProvider } from "./providers/finnhub";
import { TwelveDataProvider } from "./providers/twelvedata";
import { ProviderError, type FetchLike, type MarketDataProvider } from "./types";

type Method = "getQuote" | "getCandles" | "search" | "getProfile" | "getMetrics" | "getNews";

/** Cache TTLs in milliseconds (best-effort, per Worker isolate). */
const TTL: Record<Method, number> = {
  getQuote: 15_000,
  getCandles: 30 * 60_000,
  search: 60 * 60_000,
  getProfile: 24 * 60 * 60_000,
  getMetrics: 6 * 60 * 60_000,
  getNews: 15 * 60_000,
};

/**
 * Routes each call through an ordered provider chain per method, with
 * fallback on error and a small in-memory TTL cache to protect rate limits.
 */
export class MarketData {
  private cache = new Map<string, { at: number; value: unknown }>();

  constructor(private readonly chains: Record<Method, MarketDataProvider[]>) {}

  get providers(): string[] {
    return [...new Set(Object.values(this.chains).flat().map((p) => p.name))];
  }

  private async call<T>(method: Method, key: string, args: unknown[]): Promise<T> {
    const cacheKey = `${method}:${key}`;
    const hit = this.cache.get(cacheKey);
    if (hit && Date.now() - hit.at < TTL[method]) return hit.value as T;

    const chain = this.chains[method];
    if (!chain.length) {
      const hint = method === "getCandles" ? "TWELVEDATA_API_KEY" : "FINNHUB_API_KEY or TWELVEDATA_API_KEY";
      throw new ProviderError("router", `no market data provider configured for ${method} — set ${hint}`, 503);
    }
    const errors: string[] = [];
    for (const provider of chain) {
      const fn = provider[method] as ((...a: unknown[]) => Promise<T>) | undefined;
      if (!fn) continue;
      try {
        const value = await fn.apply(provider, args);
        this.cache.set(cacheKey, { at: Date.now(), value });
        if (this.cache.size > 2000) this.cache.delete(this.cache.keys().next().value as string);
        return value;
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }
    throw new ProviderError("router", `${method}(${key}) failed: ${errors.join("; ")}`, 502);
  }

  getQuote(symbol: string): Promise<Quote> {
    const s = normalizeSymbol(symbol);
    return this.call("getQuote", s, [s]);
  }

  /** Fetch many quotes; failures are returned as undefined instead of throwing. */
  async getQuotes(symbols: string[]): Promise<Record<string, Quote | undefined>> {
    const unique = [...new Set(symbols.map(normalizeSymbol))].slice(0, 50);
    const results = await Promise.allSettled(unique.map((s) => this.getQuote(s)));
    const out: Record<string, Quote | undefined> = {};
    unique.forEach((s, i) => {
      const r = results[i];
      out[s] = r && r.status === "fulfilled" ? r.value : undefined;
    });
    return out;
  }

  getCandles(symbol: string, range: CandleRange = "1y"): Promise<Candle[]> {
    const s = normalizeSymbol(symbol);
    return this.call("getCandles", `${s}:${range}`, [s, range]);
  }

  search(query: string): Promise<SymbolMatch[]> {
    return this.call("search", query.trim().toLowerCase(), [query.trim()]);
  }

  getProfile(symbol: string): Promise<CompanyProfile> {
    const s = normalizeSymbol(symbol);
    return this.call("getProfile", s, [s]);
  }

  getMetrics(symbol: string): Promise<KeyMetrics> {
    const s = normalizeSymbol(symbol);
    return this.call("getMetrics", s, [s]);
  }

  getNews(symbol: string, days = 7): Promise<NewsItem[]> {
    const s = normalizeSymbol(symbol);
    return this.call("getNews", `${s}:${days}`, [s, days]);
  }
}

export function normalizeSymbol(symbol: string): string {
  const s = symbol.trim().toUpperCase();
  if (!/^[A-Z0-9.\-:^=/]{1,20}$/.test(s)) throw new ProviderError("router", `invalid symbol "${symbol}"`, 400);
  return s;
}

export interface MarketDataConfig {
  finnhubApiKey?: string;
  twelveDataApiKey?: string;
  fetchFn?: FetchLike;
}

/** Build the default provider chains from whichever API keys are configured. */
export function createMarketData(cfg: MarketDataConfig): MarketData {
  const f = cfg.fetchFn ?? fetch;
  const finnhub = cfg.finnhubApiKey ? new FinnhubProvider(cfg.finnhubApiKey, f) : null;
  const twelve = cfg.twelveDataApiKey ? new TwelveDataProvider(cfg.twelveDataApiKey, f) : null;
  const chain = (...ps: (MarketDataProvider | null)[]) => ps.filter((p): p is MarketDataProvider => !!p);

  return new MarketData({
    getQuote: chain(finnhub, twelve),
    getCandles: chain(twelve),
    search: chain(finnhub, twelve),
    getProfile: chain(finnhub),
    getMetrics: chain(finnhub),
    getNews: chain(finnhub),
  });
}
