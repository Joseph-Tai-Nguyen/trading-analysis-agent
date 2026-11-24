import type { AnalysisReport } from "@taa/shared";
import { money, relTime } from "../lib/format";

const LABEL: Record<AnalysisReport["decision"], string> = {
  STRONG_BUY: "Strong buy",
  BUY: "Buy",
  HOLD: "Hold",
  REDUCE: "Reduce",
  SELL: "Sell",
};
const STATUS_ICON = { pass: "✓", warn: "!", fail: "✕" } as const;

/** The "decision dashboard": verdict, levels, reasons, risks, checklist and agent debate. */
export function DecisionCard({ report, currency }: { report: AnalysisReport; currency?: string }) {
  // Saved reports carry reward/risk computed by the house rules; older ones are computed here.
  const rr =
    report.rewardRisk !== undefined
      ? report.rewardRisk
      : report.entryPrice && report.targetPrice && report.stopLoss && report.entryPrice > report.stopLoss
        ? (report.targetPrice - report.entryPrice) / (report.entryPrice - report.stopLoss)
        : null;
  const deep = report.mode === "deep";

  return (
    <article className="decision">
      <div className="decision-method muted small">
        {deep
          ? "Agent team (TradingAgents method): analysts → bull vs bear debate → trader → risk manager → portfolio manager's final decision"
          : "Decision dashboard (daily_stock_analysis method): one-line verdict, buy point, stop loss, target and checklist"}
      </div>
      <header className="decision-head">
        <span className={`verdict v-${report.decision.toLowerCase()}`}>{LABEL[report.decision]}</span>
        <div className="confidence" title={`Confidence ${report.confidence}%`}>
          <div className="confidence-bar">
            <span style={{ width: `${report.confidence}%` }} />
          </div>
          <small>{report.confidence}% confidence</small>
        </div>
      </header>
      <p className="one-liner">{report.oneLiner}</p>

      <div className="levels">
        <div>
          <small title="Ideal level to buy — near MA5/MA10, never more than 5% above MA5">Buy point</small>
          <strong>{money(report.entryPrice, currency)}</strong>
        </div>
        <div>
          <small>Target</small>
          <strong className="up">{money(report.targetPrice, currency)}</strong>
        </div>
        <div>
          <small>Stop loss</small>
          <strong className="down">{money(report.stopLoss, currency)}</strong>
        </div>
        <div>
          <small>Reward / risk</small>
          <strong>{rr != null ? rr.toFixed(1) : "—"}</strong>
        </div>
      </div>

      {report.ruleNotes && report.ruleNotes.length > 0 && (
        <div className="rule-notes" role="note">
          <strong>House rules applied</strong>
          <ul>{report.ruleNotes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </div>
      )}

      <div className="two-col">
        <div>
          <h4>Why</h4>
          <ul>{report.keyReasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </div>
        <div>
          <h4>Risks</h4>
          <ul>{report.risks.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </div>
      </div>

      {report.checklist.length > 0 && (
        <>
          <h4>Checklist</h4>
          <ul className="checklist">
            {report.checklist.map((c, i) => (
              <li key={i} className={`check-${c.status}`}>
                <span className="check-icon">{STATUS_ICON[c.status]}</span>
                <span>
                  {c.item}
                  {c.note && <small> — {c.note}</small>}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {report.agentNotes.length > 0 && (
        <details className="agent-notes">
          <summary>Agent debate ({report.agentNotes.length} agents)</summary>
          {report.agentNotes.map((n, i) => (
            <div key={i} className="agent-note">
              <h5>{n.role}</h5>
              <p>{n.content}</p>
            </div>
          ))}
        </details>
      )}

      <footer className="decision-foot">
        <span>
          {deep ? "Deep · final call by the Portfolio Manager" : "Quick · decision dashboard"} · {report.model} ({report.provider}) · {relTime(report.createdAt)} · {report.timeHorizon}
        </span>
        <span className="disclaimer">{report.disclaimer}</span>
      </footer>
    </article>
  );
}
