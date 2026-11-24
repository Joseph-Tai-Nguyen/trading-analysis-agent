import type {
  AnalysisMode,
  AnalysisRecord,
  AnalysisReport,
  AppStatus,
  Candle,
  CandleRange,
  CompanyProfile,
  KeyMetrics,
  NewsItem,
  PortfolioSummary,
  Quote,
  RunnerInfo,
  RunnerJob,
  SymbolMatch,
  Transaction,
  WatchItem,
} from "@taa/shared";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly detail?: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new ApiError(res.status, (data as { error?: string }).error ?? res.statusText, (data as { detail?: string }).detail);
    if (res.status === 401) window.dispatchEvent(new CustomEvent("taa:unauthorized"));
    throw err;
  }
  return data as T;
}

export interface Technicals {
  lastClose: number | null;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  rsi14: number | null;
  macd: number | null;
  macdSignal: number | null;
  atr14: number | null;
  biasSma5Pct: number | null;
  volumeRatio: number | null;
  high52w: number | null;
  low52w: number | null;
  change1mPct: number | null;
  change3mPct: number | null;
  change1yPct: number | null;
  maAlignment: "bullish" | "bearish" | "neutral";
  signals: string[];
}

export interface Overview {
  symbol: string;
  quote: Quote | null;
  profile: CompanyProfile | null;
  metrics: KeyMetrics | null;
  technicals: Technicals | null;
  news: NewsItem[];
}

/** POST /api/analysis answers with a report (cloud AI) or a queued job (local runner). */
export type AnalyzeResult = AnalysisReport | { queued: true; job: RunnerJob };
export const isQueued = (r: AnalyzeResult): r is { queued: true; job: RunnerJob } => "queued" in r;

export type RunnerSettings = RunnerInfo & { engine: AppStatus["ai"]["engine"] };

export type NewTransaction = Omit<Transaction, "id" | "created_at">;

export const api = {
  status: () => request<AppStatus>("GET", "/api/status"),
  logout: () => request<{ ok: true }>("POST", "/auth/logout"),

  portfolio: () => request<PortfolioSummary>("GET", "/api/portfolio"),
  transactions: () => request<Transaction[]>("GET", "/api/transactions"),
  addTransaction: (tx: NewTransaction) => request<Transaction>("POST", "/api/transactions", tx),
  deleteTransaction: (id: string) => request<{ ok: true }>("DELETE", `/api/transactions/${encodeURIComponent(id)}`),

  watchlists: () => request<WatchItem[]>("GET", "/api/watchlists"),
  addWatch: (list: string, symbol: string, notes = "") => request<WatchItem>("POST", "/api/watchlists", { list, symbol, notes }),
  removeWatch: (id: string) => request<{ ok: true }>("DELETE", `/api/watchlists/${encodeURIComponent(id)}`),

  quotes: (symbols: string[]) =>
    request<Record<string, Quote | undefined>>("GET", `/api/market/quotes?symbols=${encodeURIComponent(symbols.join(","))}`),
  candles: (symbol: string, range: CandleRange) =>
    request<Candle[]>("GET", `/api/market/candles/${encodeURIComponent(symbol)}?range=${range}`),
  search: (q: string) => request<SymbolMatch[]>("GET", `/api/market/search?q=${encodeURIComponent(q)}`),
  overview: (symbol: string) => request<Overview>("GET", `/api/market/overview/${encodeURIComponent(symbol)}`),

  analyze: (symbol: string, mode: AnalysisMode) => request<AnalyzeResult>("POST", "/api/analysis", { symbol, mode }),
  job: (id: string) => request<RunnerJob>("GET", `/api/analysis/jobs/${encodeURIComponent(id)}`),
  jobs: () => request<RunnerJob[]>("GET", "/api/analysis/jobs"),
  runner: () => request<RunnerSettings>("GET", "/api/settings/runner"),
  createRunnerToken: () => request<{ token: string }>("POST", "/api/settings/runner/token"),
  revokeRunnerToken: () => request<{ ok: true }>("DELETE", "/api/settings/runner/token"),
  analyses: (symbol?: string, limit = 20) =>
    request<AnalysisRecord[]>("GET", `/api/analysis?limit=${limit}${symbol ? `&symbol=${encodeURIComponent(symbol)}` : ""}`),
};
