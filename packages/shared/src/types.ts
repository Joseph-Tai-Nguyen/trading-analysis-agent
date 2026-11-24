// Domain types shared by the Worker API and the web UI.
// Keep this file dependency-free: it is imported by both runtimes.

export type ISODate = string;

/* ----------------------------- Market data ----------------------------- */

export interface Quote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  open: number | null;
  high: number | null;
  low: number | null;
  prevClose: number | null;
  /** Unix epoch seconds of the last trade/quote. */
  timestamp: number;
  currency?: string;
  /** Which provider produced this quote (e.g. "finnhub", "twelvedata"). */
  source: string;
}

export interface Candle {
  /** Unix epoch seconds (bar open). */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export type CandleRange = "1m" | "3m" | "6m" | "1y" | "2y" | "5y";

export interface SymbolMatch {
  symbol: string;
  description: string;
  type?: string;
  exchange?: string;
}

export interface CompanyProfile {
  symbol: string;
  name: string;
  exchange?: string;
  currency?: string;
  country?: string;
  industry?: string;
  marketCap?: number | null;
  logo?: string;
  weburl?: string;
}

export interface KeyMetrics {
  peTTM?: number | null;
  pbAnnual?: number | null;
  epsTTM?: number | null;
  dividendYield?: number | null;
  beta?: number | null;
  week52High?: number | null;
  week52Low?: number | null;
  revenueGrowthTTM?: number | null;
  netMarginTTM?: number | null;
  roeTTM?: number | null;
  debtToEquity?: number | null;
}

export interface NewsItem {
  headline: string;
  summary: string;
  source: string;
  url: string;
  datetime: number;
}

/* ------------------------------ Portfolio ------------------------------ */

export type TransactionType = "BUY" | "SELL" | "DIVIDEND";

export interface Transaction {
  id: string;
  date: ISODate;
  symbol: string;
  type: TransactionType;
  quantity: number;
  price: number;
  fees: number;
  account: string;
  currency: string;
  notes: string;
  created_at: ISODate;
}

export interface Position {
  symbol: string;
  account: string;
  currency: string;
  quantity: number;
  avgCost: number;
  costBasis: number;
  realizedPL: number;
  dividends: number;
  // Filled in when a live quote is available:
  price?: number;
  marketValue?: number;
  dayChange?: number;
  dayChangePercent?: number;
  unrealizedPL?: number;
  unrealizedPLPercent?: number;
  weight?: number;
}

export interface PortfolioSummary {
  marketValue: number;
  costBasis: number;
  unrealizedPL: number;
  unrealizedPLPercent: number;
  realizedPL: number;
  dividends: number;
  dayChange: number;
  dayChangePercent: number;
  positions: Position[];
  asOf: number;
}

export interface WatchItem {
  id: string;
  list: string;
  symbol: string;
  notes: string;
  added_at: ISODate;
}

/* ------------------------------- Analysis ------------------------------ */

export type AnalysisMode = "quick" | "deep";
export type Decision = "STRONG_BUY" | "BUY" | "HOLD" | "REDUCE" | "SELL";
export type CheckStatus = "pass" | "warn" | "fail";

export interface ChecklistItem {
  item: string;
  status: CheckStatus;
  note?: string;
}

export interface AgentNote {
  /** e.g. "Technical Analyst", "Bull Researcher", "Risk Manager". */
  role: string;
  content: string;
}

/** The "decision dashboard" produced by every analysis run. */
export interface AnalysisReport {
  symbol: string;
  mode: AnalysisMode;
  decision: Decision;
  /** 0-100 */
  confidence: number;
  oneLiner: string;
  timeHorizon: string;
  entryPrice: number | null;
  targetPrice: number | null;
  stopLoss: number | null;
  keyReasons: string[];
  risks: string[];
  checklist: ChecklistItem[];
  /** Per-agent notes (deep mode) — the "debate transcript". */
  agentNotes: AgentNote[];
  provider: string;
  model: string;
  priceAtAnalysis: number | null;
  /** Reward/risk computed in code from entry, target and stop (null = levels incomplete). */
  rewardRisk?: number | null;
  /** House rules the code enforced on the model's answer (e.g. the "don't chase" downgrade). */
  ruleNotes?: string[];
  createdAt: ISODate;
  disclaimer: string;
}

export interface AnalysisRecord {
  id: string;
  created_at: ISODate;
  symbol: string;
  mode: AnalysisMode;
  provider: string;
  model: string;
  decision: Decision;
  confidence: number;
  price: number | null;
  target_price: number | null;
  stop_loss: number | null;
  summary: string;
  report_json: string;
}

/* ------------------------------ Local runner ------------------------------ */

/**
 * "api" = the Worker calls Gemini/Claude REST APIs itself.
 * "runner" = jobs are queued and a local runner on the user's PC answers them
 * with Antigravity CLI, Gemini CLI or Claude Code (uses their subscriptions).
 */
export type AIEngine = "api" | "runner";
export type RunnerJobStatus = "queued" | "running" | "done" | "failed";

export interface RunnerJob {
  id: string;
  symbol: string;
  mode: AnalysisMode;
  status: RunnerJobStatus;
  source: "ui" | "sweep";
  /** Jobs from one daily sweep share a batch; the digest goes out when the batch finishes. */
  batchId?: string;
  createdAt: ISODate;
  claimedAt?: ISODate;
  finishedAt?: ISODate;
  error?: string;
  /** Set when done — the id of the saved row in the "analyses" tab. */
  analysisId?: string;
  decision?: Decision;
  confidence?: number;
  oneLiner?: string;
  /** Which local engine answered, e.g. "antigravity:gemini-3.8-flash-low". */
  engine?: string;
}

export interface RunnerInfo {
  hasToken: boolean;
  tokenCreatedAt: ISODate | null;
  lastSeen: ISODate | null;
  /** Engines the runner reported on its last check-in, e.g. ["antigravity", "claude-code"]. */
  engines: string[];
  queued: number;
  running: number;
}

/* --------------------------------- API --------------------------------- */

export interface UserInfo {
  sub: string;
  email: string;
  name: string;
  picture?: string;
}

export interface AppStatus {
  user: UserInfo | null;
  storage: "google-sheets" | "kv-dev";
  spreadsheetUrl: string | null;
  ai: { engine: AIEngine; primary: "gemini" | "claude"; gemini: boolean; claude: boolean };
  market: { finnhub: boolean; twelvedata: boolean };
  notifications: { telegram: boolean };
  version: string;
}

export interface ApiError {
  error: string;
  detail?: string;
}

export const DISCLAIMER =
  "For research and education only. Not financial advice. AI output can be wrong; verify before acting.";
