import { DISCLAIMER, type AnalysisMode, type AnalysisReport, type CheckStatus, type Decision } from "@taa/shared";

/** Pull the first JSON object out of an LLM response (handles ``` fences and stray prose). */
export function extractJson<T = unknown>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1]! : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON object in model output");
  return JSON.parse(candidate.slice(start, end + 1)) as T;
}

const DECISIONS: Decision[] = ["STRONG_BUY", "BUY", "HOLD", "REDUCE", "SELL"];
const STATUSES: CheckStatus[] = ["pass", "warn", "fail"];

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v.replace(/[^0-9.\-]/g, "")) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n !== 0 ? n : null;
};
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String).filter(Boolean).slice(0, 8) : []);

/** Coerce arbitrary model JSON into a valid AnalysisReport (never trust model output shape). */
export function normalizeReport(
  raw: Record<string, unknown>,
  meta: { symbol: string; mode: AnalysisMode; provider: string; model: string; price: number | null },
): AnalysisReport {
  const decisionRaw = String(raw.decision ?? "HOLD").toUpperCase().replace(/[\s-]+/g, "_");
  const decision = (DECISIONS as string[]).includes(decisionRaw) ? (decisionRaw as Decision) : "HOLD";
  const confidence = Math.max(0, Math.min(100, Math.round(Number(raw.confidence) || 50)));
  const checklist = Array.isArray(raw.checklist)
    ? raw.checklist.slice(0, 10).map((c) => {
        const o = (c ?? {}) as Record<string, unknown>;
        const status = String(o.status ?? "warn").toLowerCase() as CheckStatus;
        return {
          item: String(o.item ?? ""),
          status: STATUSES.includes(status) ? status : "warn",
          note: o.note ? String(o.note) : undefined,
        };
      }).filter((c) => c.item)
    : [];

  return {
    symbol: meta.symbol,
    mode: meta.mode,
    decision,
    confidence,
    oneLiner: String(raw.oneLiner ?? raw.one_liner ?? raw.summary ?? "").slice(0, 400),
    timeHorizon: String(raw.timeHorizon ?? raw.time_horizon ?? "swing (weeks)"),
    entryPrice: num(raw.entryPrice ?? raw.entry_price),
    targetPrice: num(raw.targetPrice ?? raw.target_price),
    stopLoss: num(raw.stopLoss ?? raw.stop_loss),
    keyReasons: strArr(raw.keyReasons ?? raw.key_reasons),
    risks: strArr(raw.risks),
    checklist,
    agentNotes: [],
    provider: meta.provider,
    model: meta.model,
    priceAtAnalysis: meta.price,
    createdAt: new Date().toISOString(),
    disclaimer: DISCLAIMER,
  };
}
