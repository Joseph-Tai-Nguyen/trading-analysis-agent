import type {
  Candle,
  CandleRange,
  CompanyProfile,
  KeyMetrics,
  NewsItem,
  Quote,
  SymbolMatch,
} from "@taa/shared";

/**
 * A market data provider. Every method is optional so providers can implement
 * only what their plan supports; the router (router.ts) chains providers and
 * falls back to the next one when a method is missing or throws.
 */
export interface MarketDataProvider {
  readonly name: string;
  getQuote?(symbol: string): Promise<Quote>;
  getCandles?(symbol: string, range: CandleRange): Promise<Candle[]>;
  search?(query: string): Promise<SymbolMatch[]>;
  getProfile?(symbol: string): Promise<CompanyProfile>;
  getMetrics?(symbol: string): Promise<KeyMetrics>;
  getNews?(symbol: string, days: number): Promise<NewsItem[]>;
}

export class ProviderError extends Error {
  constructor(
    public readonly provider: string,
    message: string,
    public readonly status?: number,
  ) {
    super(`[${provider}] ${message}`);
    this.name = "ProviderError";
  }
}

export type FetchLike = typeof fetch;

export const RANGE_DAYS: Record<CandleRange, number> = {
  "1m": 31,
  "3m": 92,
  "6m": 183,
  "1y": 366,
  "2y": 731,
  "5y": 1827,
};
