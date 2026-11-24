import type { AnalysisMode, AnalysisReport, CandleRange, RunnerJob } from "@taa/shared";
import { useEffect, useState } from "react";
import { DecisionCard } from "../components/DecisionCard";
import { PriceChart } from "../components/PriceChart";
import { TransactionForm } from "../components/TransactionForm";
import { Card, Change, Empty, ErrorNote, Spinner, Stat } from "../components/ui";
import { useAsync, usePolling } from "../hooks/useAsync";
import { api, isQueued } from "../lib/api";
import { compact, money, num, pct, relTime } from "../lib/format";

export function SymbolPage({ symbol }: { symbol: string }) {
  const [range, setRange] = useState<CandleRange>("1y");
  const ov = useAsync(() => api.overview(symbol), [symbol]);
  const candles = useAsync(() => api.candles(symbol, range), [symbol, range]);
  const history = useAsync(() => api.analyses(symbol, 20), [symbol]);
  const [report, setReport] = useState<AnalysisReport>();
  const [running, setRunning] = useState<AnalysisMode>();
  const [runError, setRunError] = useState<Error>();
  const [panel, setPanel] = useState<"none" | "tx">("none");
  const [watchMsg, setWatchMsg] = useState<string>();

  usePolling(async () => {
    const q = await api.quotes([symbol]).catch(() => null);
    const quote = q?.[symbol];
    if (quote && ov.data) ov.setData({ ...ov.data, quote });
  }, 15_000, !!ov.data);

  const latestSaved: AnalysisReport | undefined = (() => {
    const r = history.data?.[0];
    if (!r) return undefined;
    try {
      return JSON.parse(r.report_json) as AnalysisReport;
    } catch {
      return undefined;
    }
  })();
  const shown = report ?? latestSaved;

  // Local-runner mode: the analysis is queued and answered by the runner on the user's PC.
  const [job, setJob] = useState<RunnerJob>();

  // Re-attach to a job still in flight for this symbol (e.g. after navigating away and back).
  useEffect(() => {
    setJob(undefined);
    setRunning(undefined);
    api
      .jobs()
      .then((jobs) => {
        const open = jobs.filter((j) => j.symbol === symbol && (j.status === "queued" || j.status === "running")).pop();
        if (open) {
          setJob(open);
          setRunning(open.mode);
        }
      })
      .catch(() => undefined);
  }, [symbol]);

  useEffect(() => {
    if (!job) return;
    let stop = false;
    const id = window.setInterval(async () => {
      const j = await api.job(job.id).catch(() => null);
      if (stop || !j) return;
      if (j.status === "done") {
        const rows = await api.analyses(symbol, 20).catch(() => undefined);
        if (stop) return;
        if (rows) {
          history.setData(rows);
          const row = rows.find((r) => r.id === j.analysisId) ?? rows[0];
          try {
            if (row) setReport(JSON.parse(row.report_json) as AnalysisReport);
          } catch {
            /* ignore corrupt rows */
          }
        }
        setJob(undefined);
        setRunning(undefined);
      } else if (j.status === "failed") {
        setRunError(new Error(j.error ?? "The local runner could not finish this analysis"));
        setJob(undefined);
        setRunning(undefined);
      } else setJob(j);
    }, 3000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id, symbol]);

  const run = async (mode: AnalysisMode) => {
    setRunning(mode);
    setRunError(undefined);
    try {
      const res = await api.analyze(symbol, mode);
      if (isQueued(res)) {
        setJob(res.job); // `running` stays set until the job finishes
        return;
      }
      setReport(res);
      void history.reload();
      setRunning(undefined);
    } catch (e) {
      setRunError(e as Error);
      setRunning(undefined);
    }
  };

  const runningLabel = job
    ? job.status === "queued"
      ? "Queued — waiting for the local runner on your PC. Not moving? Start it with: npm run runner -- watch"
      : `Your local runner${job.engine ? ` (${job.engine})` : ""} is ${job.mode === "deep" ? "running the agent team — this can take a few minutes" : "analyzing…"}`
    : running === "deep"
      ? "Analysts, researchers, trader and risk manager are working… (up to a minute)"
      : "Analyzing…";

  const d = ov.data;
  const q = d?.quote;
  const t = d?.technicals;
  const m = d?.metrics;
  const cur = d?.profile?.currency ?? q?.currency;

  return (
    <div className="page">
      <section className="hero symbol-hero">
        <div className="symbol-title">
          {d?.profile?.logo && <img src={d.profile.logo} alt="" width={40} height={40} referrerPolicy="no-referrer" />}
          <div>
            <h1>{symbol}</h1>
            <div className="muted">{d?.profile ? `${d.profile.name} · ${d.profile.exchange ?? ""}` : " "}</div>
          </div>
        </div>
        <div className="hero-value">{q ? money(q.price, cur) : "—"}</div>
        {q && (
          <div className="hero-sub">
            <Change value={q.change} percent={q.changePercent} currency={cur} /> <span className="muted">today · {q.source} · {relTime(q.timestamp)}</span>
          </div>
        )}
        <div className="hero-actions">
          <button
            className="btn primary"
            disabled={!!running}
            onClick={() => run("quick")}
            title="Decision dashboard (daily_stock_analysis style): verdict, buy point, stop loss, target and checklist — 1 AI call"
          >
            {running === "quick" ? (job?.status === "queued" ? "Queued…" : "Analyzing…") : "Quick analysis"}
          </button>
          <button
            className="btn"
            disabled={!!running}
            onClick={() => run("deep")}
            title="Agent team (TradingAgents style): analysts → bull vs bear → trader → risk manager → portfolio manager's final decision — 8 AI calls"
          >
            {running === "deep" ? (job?.status === "queued" ? "Queued…" : "Agents debating…") : "Deep multi-agent"}
          </button>
          <button
            className="btn ghost"
            onClick={async () => {
              try {
                await api.addWatch("Watchlist", symbol);
                setWatchMsg("Added to Watchlist");
              } catch (e) {
                setWatchMsg((e as Error).message);
              }
            }}
          >
            ☆ Watch
          </button>
          <button className="btn ghost" onClick={() => setPanel(panel === "tx" ? "none" : "tx")}>
            + Transaction
          </button>
        </div>
        {watchMsg && <div className="muted small">{watchMsg}</div>}
      </section>

      <ErrorNote error={ov.error} />
      {panel === "tx" && (
        <Card title={`Record a ${symbol} transaction`}>
          <TransactionForm defaultSymbol={symbol} onCancel={() => setPanel("none")} onDone={() => setPanel("none")} />
        </Card>
      )}

      <Card>
        {candles.error && <ErrorNote error={candles.error} />}
        {!candles.data && candles.loading ? <Spinner label="Loading chart…" /> : <PriceChart candles={candles.data ?? []} range={range} onRange={setRange} currency={cur} />}
      </Card>

      {(running || runError || shown) && (
        <Card title="AI decision dashboard">
          {running && <Spinner label={runningLabel} />}
          <ErrorNote error={runError} />
          {shown && !running && <DecisionCard report={shown} currency={cur} />}
        </Card>
      )}

      <div className="grid-2">
        <Card title="Technicals">
          {!d && ov.loading && <Spinner />}
          {d && !t && <Empty title="No technical data" />}
          {t && (
            <>
              <div className="stats-grid">
                <Stat label="Trend (MA5/10/20)" value={<span className={`trend t-${t.maAlignment}`}>{t.maAlignment}</span>} />
                <Stat label="RSI 14" value={num(t.rsi14, 1)} />
                <Stat label="vs MA5 (bias)" value={pct(t.biasSma5Pct)} />
                <Stat label="SMA 20 / 50" value={`${num(t.sma20)} / ${num(t.sma50)}`} />
                <Stat label="SMA 200" value={num(t.sma200)} />
                <Stat label="ATR 14" value={num(t.atr14)} />
                <Stat label="52w range" value={`${num(t.low52w)} – ${num(t.high52w)}`} />
                <Stat label="1M / 3M / 1Y" value={`${pct(t.change1mPct, 1)} / ${pct(t.change3mPct, 1)} / ${pct(t.change1yPct, 1)}`} />
              </div>
              {t.signals.length > 0 && (
                <div className="signals">
                  {t.signals.map((s) => (
                    <span key={s} className="signal">{s}</span>
                  ))}
                </div>
              )}
            </>
          )}
        </Card>
        <Card title="Fundamentals">
          {d && !m && <Empty title="No fundamentals" />}
          {m && (
            <div className="stats-grid">
              <Stat label="Market cap" value={compact(d?.profile?.marketCap)} />
              <Stat label="P/E (TTM)" value={num(m.peTTM, 1)} />
              <Stat label="P/B" value={num(m.pbAnnual, 1)} />
              <Stat label="EPS (TTM)" value={num(m.epsTTM)} />
              <Stat label="Dividend yield" value={pct(m.dividendYield, 2, false)} />
              <Stat label="Beta" value={num(m.beta)} />
              <Stat label="Net margin" value={pct(m.netMarginTTM, 1, false)} />
              <Stat label="ROE" value={pct(m.roeTTM, 1, false)} />
            </div>
          )}
        </Card>
      </div>

      <div className="grid-2">
        <Card title="News (7 days)">
          {d && d.news.length === 0 && <Empty title="No recent news" />}
          <ul className="news">
            {d?.news.slice(0, 10).map((n) => (
              <li key={n.url}>
                <a href={n.url} target="_blank" rel="noreferrer noopener">{n.headline}</a>
                <small className="muted">{n.source} · {relTime(n.datetime)}</small>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Analysis history">
          {history.data && history.data.length === 0 && <Empty title="No analyses yet">Run a quick or deep analysis above.</Empty>}
          <ul className="history">
            {history.data?.map((h) => (
              <li key={h.id}>
                <button
                  className="linklike"
                  onClick={() => {
                    try {
                      setReport(JSON.parse(h.report_json) as AnalysisReport);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    } catch {
                      /* ignore corrupt rows */
                    }
                  }}
                >
                  <span className={`verdict sm v-${h.decision.toLowerCase()}`}>{h.decision.replace("_", " ")}</span>
                  <span>{h.summary}</span>
                </button>
                <small className="muted">
                  {h.mode} · {h.confidence}% · {money(h.price, cur)} · {relTime(h.created_at)}
                </small>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
