import { useState } from "react";
import { Card, Change, Empty, ErrorNote, Spinner, Stat } from "../components/ui";
import { TransactionForm } from "../components/TransactionForm";
import { useAsync, usePolling } from "../hooks/useAsync";
import { api } from "../lib/api";
import { money, num, pct, signedMoney } from "../lib/format";
import { href } from "../lib/router";

const PALETTE = ["#10b981", "#3b82f6", "#f59e0b", "#8b5cf6", "#ef4444", "#14b8a6", "#ec4899", "#64748b"];

export function PortfolioPage() {
  const pf = useAsync(() => api.portfolio(), []);
  const txs = useAsync(() => api.transactions(), []);
  const [adding, setAdding] = useState(false);
  usePolling(() => void pf.reload(), 30_000);

  const refresh = () => {
    void pf.reload();
    void txs.reload();
  };
  const s = pf.data;

  return (
    <div className="page">
      <section className="hero">
        <div className="hero-label">Total value</div>
        <div className="hero-value">{s ? money(s.marketValue) : "—"}</div>
        {s && (
          <div className="hero-sub">
            <Change value={s.dayChange} percent={s.dayChangePercent} /> <span className="muted">today</span>
          </div>
        )}
      </section>

      <ErrorNote error={pf.error} />
      {!s && pf.loading && <Spinner />}

      {s && (
        <div className="stats-row">
          <Stat label="Unrealized P/L" value={<Change value={s.unrealizedPL} percent={s.unrealizedPLPercent} />} />
          <Stat label="Realized P/L" value={<Change value={s.realizedPL} />} />
          <Stat label="Dividends" value={money(s.dividends)} />
          <Stat label="Cost basis" value={money(s.costBasis)} />
        </div>
      )}

      {s && s.positions.length > 0 && (
        <div className="alloc" aria-label="Allocation">
          {s.positions.map((p, i) => (
            <span key={`${p.symbol}-${p.account}`} title={`${p.symbol} ${pct(p.weight, 1, false)}`} style={{ width: `${p.weight}%`, background: PALETTE[i % PALETTE.length] }} />
          ))}
        </div>
      )}

      <Card
        title="Holdings"
        actions={
          <button className="btn primary sm" onClick={() => setAdding((a) => !a)}>
            {adding ? "Close" : "+ Transaction"}
          </button>
        }
      >
        {adding && (
          <div className="inset">
            <TransactionForm
              onCancel={() => setAdding(false)}
              onDone={() => {
                setAdding(false);
                refresh();
              }}
            />
          </div>
        )}
        {s && s.positions.length === 0 && !adding && (
          <Empty title="No holdings yet">Add a BUY transaction to start tracking your portfolio.</Empty>
        )}
        {s && s.positions.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th className="r">Qty</th>
                  <th className="r hide-sm">Avg cost</th>
                  <th className="r">Price</th>
                  <th className="r">Today</th>
                  <th className="r">Value</th>
                  <th className="r hide-sm">Total P/L</th>
                  <th className="r hide-sm">Weight</th>
                </tr>
              </thead>
              <tbody>
                {s.positions.map((p, i) => (
                  <tr key={`${p.symbol}-${p.account}`}>
                    <td>
                      <a href={href.symbol(p.symbol)} className="sym">
                        <span className="dot" style={{ background: PALETTE[i % PALETTE.length] }} />
                        <strong>{p.symbol}</strong>
                        <small>{p.account}</small>
                      </a>
                    </td>
                    <td className="r">{num(p.quantity, 4)}</td>
                    <td className="r hide-sm">{money(p.avgCost, p.currency)}</td>
                    <td className="r">{money(p.price, p.currency)}</td>
                    <td className="r"><Change percent={p.dayChangePercent} /></td>
                    <td className="r">{money(p.marketValue, p.currency)}</td>
                    <td className="r hide-sm"><Change value={p.unrealizedPL} percent={p.unrealizedPLPercent} currency={p.currency} /></td>
                    <td className="r hide-sm">{pct(p.weight, 1, false)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Activity">
        <ErrorNote error={txs.error} />
        {txs.data && txs.data.length === 0 && <Empty title="No transactions" />}
        {txs.data && txs.data.length > 0 && (
          <ul className="activity">
            {txs.data.slice(0, 50).map((t) => (
              <li key={t.id}>
                <span className={`pill t-${t.type.toLowerCase()}`}>{t.type}</span>
                <a href={href.symbol(t.symbol)}><strong>{t.symbol}</strong></a>
                <span className="muted">
                  {t.type === "DIVIDEND" ? signedMoney(t.quantity ? t.quantity * t.price : t.price, t.currency) : `${num(t.quantity, 4)} @ ${money(t.price, t.currency)}`}
                </span>
                <span className="muted hide-sm">{t.account}</span>
                <span className="muted">{t.date}</span>
                <button
                  className="icon-btn"
                  aria-label={`Delete ${t.type} ${t.symbol} on ${t.date}`}
                  onClick={async () => {
                    if (!confirm(`Delete ${t.type} ${t.symbol} on ${t.date}?`)) return;
                    await api.deleteTransaction(t.id);
                    refresh();
                  }}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
