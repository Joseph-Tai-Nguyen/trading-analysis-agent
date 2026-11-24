import type { Quote } from "@taa/shared";
import { useMemo, useState } from "react";
import { SymbolSearch } from "../components/SymbolSearch";
import { Card, Change, Empty, ErrorNote, Spinner } from "../components/ui";
import { useAsync, usePolling } from "../hooks/useAsync";
import { api } from "../lib/api";
import { money, relTime } from "../lib/format";
import { href, navigate } from "../lib/router";

export function WatchlistsPage() {
  const items = useAsync(() => api.watchlists(), []);
  const lists = useMemo(() => {
    const names = [...new Set((items.data ?? []).map((i) => i.list))];
    return names.length ? names : ["Watchlist"];
  }, [items.data]);
  const [current, setCurrent] = useState<string>();
  const [newList, setNewList] = useState("");
  const [error, setError] = useState<Error>();
  const list = current && (lists.includes(current) || current === newList) ? current : lists[0]!;
  const rows = (items.data ?? []).filter((i) => i.list === list);
  const symbols = rows.map((r) => r.symbol);

  const quotes = useAsync(
    () => (symbols.length ? api.quotes(symbols) : Promise.resolve<Record<string, Quote | undefined>>({})),
    [symbols.join(",")],
  );
  usePolling(() => void quotes.reload(), 15_000, symbols.length > 0);
  const analyses = useAsync(() => api.analyses(undefined, 100), []);
  const latest = useMemo(() => {
    const m = new Map<string, NonNullable<typeof analyses.data>[number]>();
    for (const a of analyses.data ?? []) if (!m.has(a.symbol)) m.set(a.symbol, a);
    return m;
  }, [analyses.data]);

  const add = async (symbol: string) => {
    setError(undefined);
    try {
      await api.addWatch(list, symbol);
      await items.reload();
    } catch (e) {
      setError(e as Error);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>Watchlists</h1>
      </div>

      <div className="chips" role="tablist">
        {[...new Set([...lists, ...(current && !lists.includes(current) ? [current] : [])])].map((l) => (
          <button key={l} role="tab" aria-selected={l === list} className={`chip ${l === list ? "active" : ""}`} onClick={() => setCurrent(l)}>
            {l}
          </button>
        ))}
        <form
          className="chip-new"
          onSubmit={(e) => {
            e.preventDefault();
            const n = newList.trim();
            if (n) {
              setCurrent(n);
              setNewList("");
            }
          }}
        >
          <input value={newList} onChange={(e) => setNewList(e.target.value)} placeholder="+ New list" maxLength={40} aria-label="New list name" />
        </form>
      </div>

      <Card title={list} actions={<div className="add-symbol"><SymbolSearch placeholder="Add symbol…" onPick={add} /></div>}>
        <ErrorNote error={error ?? items.error ?? quotes.error} />
        {!items.data && items.loading && <Spinner />}
        {items.data && rows.length === 0 && <Empty title="This list is empty">Search for a symbol above to add it.</Empty>}
        {rows.length > 0 && (
          <div className="table-wrap">
            <table className="table hover">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th className="r">Price</th>
                  <th className="r">Change</th>
                  <th className="hide-sm">Last AI call</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const q = quotes.data?.[r.symbol];
                  const a = latest.get(r.symbol);
                  return (
                    <tr key={r.id} onClick={() => navigate(href.symbol(r.symbol))}>
                      <td>
                        <a href={href.symbol(r.symbol)} className="sym" onClick={(e) => e.stopPropagation()}>
                          <strong>{r.symbol}</strong>
                          {r.notes && <small>{r.notes}</small>}
                        </a>
                      </td>
                      <td className="r">{q ? money(q.price, q.currency) : "—"}</td>
                      <td className="r">{q ? <Change value={q.change} percent={q.changePercent} currency={q.currency} /> : "—"}</td>
                      <td className="hide-sm">
                        {a ? (
                          <span className={`verdict sm v-${a.decision.toLowerCase()}`} title={a.summary}>
                            {a.decision.replace("_", " ")} · {relTime(a.created_at)}
                          </span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td className="r">
                        <button
                          className="icon-btn"
                          aria-label={`Remove ${r.symbol}`}
                          onClick={async (e) => {
                            e.stopPropagation();
                            await api.removeWatch(r.id);
                            await items.reload();
                          }}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="fineprint">Prices refresh every 15 seconds while this tab is visible. The daily AI sweep analyzes your watchlist symbols after the US market close.</p>
    </div>
  );
}
