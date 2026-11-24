# Project context

## What this is

TradeAgent is a **personal investing cockpit** for one self-directed investor, or a small allow-listed group. It combines three things:

1. **Portfolio tracking.** You log buys, sells and dividends, and the app shows live value, today's change and P/L by account.
2. **Watchlists** with live quotes.
3. **An AI research team** that turns live market data into a clear, auditable **decision dashboard**, on demand or every trading day.

It is a research assistant, **not** a broker or an advisor. It never places trades.

## Inspirations and what we took from each

| Source | What we borrow |
|---|---|
| **Wealthsimple** | A calm, uncluttered UI. Big, readable numbers. One primary action per screen. Mobile-first. |
| **Yahoo Finance** | Information density where it helps: quote stats, charts with ranges, news and key fundamentals on one symbol page. |
| **[TradingAgents](https://github.com/TauricResearch/TradingAgents)** | The multi-agent organization: specialized analysts (technical, fundamentals, news/sentiment), a bull vs. bear research debate, then trader, risk management, and a portfolio manager for the final decision. |
| **[daily_stock_analysis](https://github.com/ZhuLinsen/daily_stock_analysis)** | The decision dashboard: a one-line conclusion, entry/target/stop levels and a checklist. It also gives us trend-trading discipline (bullish MA alignment, *don't chase* more than 5% above MA5) and the scheduled daily watchlist report pushed to a chat app. |

## Key decisions and why

See [docs/decisions/](docs/decisions/) for the ADRs.

- **Cloudflare Workers + static assets:** one deploy, a global edge, a generous free tier, built-in cron, and KV for sessions. **Constraint:** no Node APIs, so every integration is plain `fetch` + REST.
- **Google Sheets as the database:**
  - The user owns their data and can inspect, edit or export it in a familiar tool. No database to run.
  - We use the `drive.file` scope, so the app only sees the sheet it created.
  - **Trade-offs:** about 60 requests/min per user, no transactions or indexes, and rows matched by header name. That is fine for personal scale (thousands of rows).
- **Local runner for subscriptions:** the owner's Google AI plan does not come with a Gemini API key, but it does raise the Antigravity and Gemini CLI limits.
  - `apps/runner` runs on the owner's PC and answers queued analyses with `agy`, `gemini` or `claude`, so it uses the subscriptions, not paid APIs.
  - The Worker still builds the fact sheet and re-checks every report.
  - **Trade-off:** analyses only run while the PC and runner are on. See [ADR 0002](docs/decisions/0002-local-ai-runner.md).
- **Gemini primary, Claude fallback:** this uses the owner's Google AI investment. Gemini Flash is cheap and fast for daily sweeps, and Pro handles deep runs. Claude adds resilience when Gemini is rate-limited or down. Both are called through a common `LLMClient` interface.
- **Finnhub + Twelve Data:** reputable APIs with official keys and free tiers. Finnhub covers real-time US quotes, fundamentals and news. Twelve Data covers daily history, because Finnhub candles are premium. We avoid scraping or unofficial endpoints, which keeps the data "trusted".
- **PWA instead of native apps:** one codebase installs on Windows, macOS, iOS and Android.
- **Numbers from code, judgment from LLMs:** indicators and P/L are deterministic and tested. LLMs only interpret. This cuts hallucinated numbers and makes reports auditable.

## Users and usage

- **Primary user:** the owner, signed in with Google and checking on phone and desktop.
- **Typical day:** glance at the portfolio, then check the watchlist. Next, read the daily Telegram digest after the close and open a symbol for a deep analysis before acting.
- **Scale:** 1–5 users, fewer than 100 symbols, fewer than 10k transactions.

## Current status (v0.1 — scaffold + MVP)

**Done:**

- Monorepo, Worker API, Google OAuth, Sheets store with additive migrations, and the KV dev store.
- Market data router with fallback, plus indicators.
- Quick and deep agent pipelines with Gemini→Claude fallback.
- React PWA with Portfolio, Watchlists, Symbol and Settings pages.
- Daily cron with a Telegram digest, unit tests, and CI.

**Next (see [REQUIREMENTS.md](REQUIREMENTS.md) → Roadmap):**

- Multi-currency with FX conversion.
- CSV import from brokers.
- Price alerts.
- Streaming quotes through a Durable Object WebSocket.
- PNG app icons for iOS.
- Backtesting the agent's past calls against the price that followed.

## Glossary

- **Bias rate:** the percentage distance of the price from MA5. Above 5% means "chasing".
- **MA alignment:** MA5 > MA10 > MA20 is bullish; the reverse is bearish.
- **Decision dashboard:** the structured `AnalysisReport` (verdict, confidence, levels, reasons, risks, checklist).
- **Quick vs deep:** quick is 1 LLM call; deep is 8 calls through the full agent team.
- **Sweep:** the scheduled quick analysis of every watchlist symbol.
