# Requirements

Status key: ✅ implemented in v0.1 · 🟡 partial · ⬜ planned

## 1. Functional requirements

### 1.1 Authentication and access
| ID | Requirement | Status |
|---|---|---|
| AUTH-1 | Sign in with Google (OAuth 2.0 authorization-code flow, offline access) | ✅ |
| AUTH-2 | Only accounts in `ALLOWED_EMAILS` may sign in or use the API | ✅ |
| AUTH-3 | Sessions last 30 days through an HttpOnly, Secure, SameSite=Lax cookie; sign-out revokes the token | ✅ |
| AUTH-4 | Dev mode (`DEV_AUTH_BYPASS`) runs fully offline without Google | ✅ |

### 1.2 Portfolio
| ID | Requirement | Status |
|---|---|---|
| PF-1 | Record BUY, SELL and DIVIDEND transactions (symbol, date, qty, price, fees, account, currency, notes) | ✅ |
| PF-2 | Derive positions per symbol and account using the average-cost method; realized P/L on sells | ✅ |
| PF-3 | Show live market value, today's change, unrealized P/L, weight and allocation | ✅ |
| PF-4 | Delete transactions | ✅ |
| PF-5 | Edit transactions | ⬜ |
| PF-6 | Multi-currency totals with FX conversion to a base currency | ⬜ (today totals assume one currency) |
| PF-7 | CSV import/export (Wealthsimple, Questrade, IBKR formats) | ⬜ |
| PF-8 | Performance chart over time (time-weighted return) | ⬜ |

### 1.3 Watchlists
| ID | Requirement | Status |
|---|---|---|
| WL-1 | Multiple named watchlists; add or remove symbols through search | ✅ |
| WL-2 | Live quotes refreshed every 15 s while visible | ✅ |
| WL-3 | Show the latest AI verdict per symbol | ✅ |
| WL-4 | Per-symbol notes (API exists; UI editing planned) | 🟡 |
| WL-5 | Price alerts (above/below, % move) with push or Telegram notification | ⬜ |

### 1.4 Market data
| ID | Requirement | Status |
|---|---|---|
| MD-1 | Live quotes from a reputable licensed API (Finnhub), with Twelve Data fallback | ✅ |
| MD-2 | Daily OHLCV history from 1M to 5Y | ✅ |
| MD-3 | Symbol search, company profile, key fundamentals, 7-day company news | ✅ |
| MD-4 | Cache responses to respect provider rate limits | ✅ (per-isolate memory) |
| MD-5 | Streaming real-time quotes (WebSocket through a Durable Object) | ⬜ |
| MD-6 | Shared cache across isolates (Cache API or KV) | ⬜ |

### 1.5 AI analysis
| ID | Requirement | Status |
|---|---|---|
| AI-1 | Quick analysis: one call returns the decision dashboard JSON | ✅ |
| AI-2 | Deep analysis: analysts → bull/bear debate → trader → risk → PM | ✅ |
| AI-3 | Gemini primary, automatic Claude fallback; primary is configurable | ✅ |
| AI-4 | LLMs receive only computed facts; output is normalized and validated | ✅ |
| AI-5 | Save every analysis (summary + full JSON) to the user's sheet; history view | ✅ |
| AI-6 | Daily scheduled sweep of watchlists, plus an optional Telegram digest | ✅ |
| AI-7 | Streaming agent progress to the UI (SSE) | ⬜ |
| AI-8 | Scorecard: compare past calls with the price that followed | ⬜ |
| AI-9 | Multi-round debate and a configurable research depth | ⬜ |
| AI-10 | House rules enforced in code: no BUY when price is more than 5% above MA5 (buy point moves to MA5), the stop sits below the buy point and the target above it, and reward/risk and the trend and chasing checks are computed | ✅ |
| AI-11 | Local runner: answer analyses on the user's PC with Antigravity CLI, Gemini CLI or Claude Code (subscriptions, no API keys), with fallback between them | ✅ |
| AI-12 | Runner token scoped to `/api/runner/*`; the Worker re-validates every runner report before saving it | ✅ |

### 1.6 Storage
| ID | Requirement | Status |
|---|---|---|
| ST-1 | Store all user data in a Google Sheet in the user's own Drive | ✅ |
| ST-2 | Auto-create the spreadsheet on first login; additive schema migrations | ✅ |
| ST-3 | Least-privilege Google scope (`drive.file`) | ✅ |
| ST-4 | Encrypt OAuth tokens at rest (AES-GCM) | ✅ |

## 2. Non-functional requirements

| ID | Requirement |
|---|---|
| NF-1 | **Platforms:** works in current Chrome, Edge, Safari and Firefox on Windows, macOS, iOS and Android. Installable as a PWA. |
| NF-2 | **Responsive:** usable from 360 px wide up; bottom tab bar on mobile. Supports dark mode. |
| NF-3 | **Performance:** first load under 100 kB gzipped JS. Portfolio API p50 under 1.5 s with quotes. Quick analysis under 20 s; deep analysis under 90 s. |
| NF-4 | **Hosting:** a single Cloudflare Worker with static assets. Runs on the free tier at personal scale. |
| NF-5 | **Security:** no secrets in the repo or client; CSP headers; same-origin check on writes; input validation on every endpoint. |
| NF-6 | **Reliability:** provider failures degrade gracefully (fallback chain, partial data with lower confidence). |
| NF-7 | **Quality:** strict TypeScript; unit tests for financial math, indicators and the agent pipeline; CI must pass. |
| NF-8 | **Compliance:** a "not financial advice" disclaimer on every analysis. No order execution. Respect provider terms (no scraping). |
| NF-9 | **Accessibility:** keyboard navigable, visible focus, semantic tables and roles, WCAG AA color contrast. |

## 3. Out of scope

- Placing or routing trades, or connecting to brokerage order APIs.
- Social or sharing features, and public profiles.
- Options or crypto analytics (could be added later through new providers).

## 4. Roadmap

1. **v0.2:** edit transactions, CSV import, multi-currency with FX, watchlist notes UI, PNG icons.
2. **v0.3:** price alerts (cron + Telegram/Web Push), shared cache, SSE progress for deep analysis.
3. **v0.4:** streaming quotes (Durable Objects), performance chart, AI scorecard and backtest.
4. **Later:** a portfolio-level AI review (diversification, risk), and earnings-calendar awareness.
