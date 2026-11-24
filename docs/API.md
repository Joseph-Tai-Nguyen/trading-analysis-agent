# HTTP API

All endpoints return JSON. Errors look like `{ "error": string, "detail"?: string }` with the appropriate status code.

Every `/api/*` route except `/api/health` requires a session cookie (or `DEV_AUTH_BYPASS=true`). Write requests must be same-origin.

## Auth
| Method | Path | Notes |
|---|---|---|
| GET | `/auth/login` | Redirects to Google consent |
| GET | `/auth/callback` | OAuth redirect target; sets `taa_sid` and redirects to `/` (or `/?auth_error=…`) |
| POST | `/auth/logout` | Revokes the token and clears the session |

## App
| Method | Path | Response |
|---|---|---|
| GET | `/api/health` | `{ ok, version }` (public) |
| GET | `/api/status` | `AppStatus`: user, storage kind, spreadsheet URL, which integrations are configured |

## Market data
| Method | Path | Response |
|---|---|---|
| GET | `/api/market/quotes?symbols=AAPL,MSFT` | `Record<symbol, Quote \| undefined>` (max 50) |
| GET | `/api/market/candles/:symbol?range=1m\|3m\|6m\|1y\|2y\|5y` | `Candle[]` (daily, oldest first) |
| GET | `/api/market/search?q=apple` | `SymbolMatch[]` |
| GET | `/api/market/overview/:symbol` | `{ quote, profile, metrics, technicals, news }`. Each part may be `null` |

## Portfolio
| Method | Path | Body / Response |
|---|---|---|
| GET | `/api/portfolio` | `PortfolioSummary` (positions + live quotes) |
| GET | `/api/transactions` | `Transaction[]` newest first |
| POST | `/api/transactions` | `{ symbol, type, quantity, price, fees?, date?, account?, currency?, notes? }` → `201 Transaction` |
| DELETE | `/api/transactions/:id` | `{ ok: true }` |

## Watchlists
| Method | Path | Body / Response |
|---|---|---|
| GET | `/api/watchlists` | `WatchItem[]` |
| POST | `/api/watchlists` | `{ list?, symbol, notes? }` → `201 WatchItem` (400 if the symbol is already in that list) |
| PATCH | `/api/watchlists/:id` | `{ notes }` → `WatchItem` |
| DELETE | `/api/watchlists/:id` | `{ ok: true }` |

## Analysis
| Method | Path | Body / Response |
|---|---|---|
| POST | `/api/analysis` | `{ symbol, mode: "quick" \| "deep" }`. With AI engine `api` it returns `200 AnalysisReport` (also saved to the sheet). With engine `runner` it returns `202 { queued: true, job: RunnerJob }` |
| GET | `/api/analysis?symbol=AAPL&limit=20` | `AnalysisRecord[]` newest first |
| GET | `/api/analysis/jobs` | `RunnerJob[]`: queued, running, and those finished in the last 24 h |
| GET | `/api/analysis/jobs/:id` | `RunnerJob`. Poll it until `status` is `done` (then `analysisId` is set) or `failed` (then `error` is set) |
| POST | `/api/cron/run` | Dev only (`DEV_AUTH_BYPASS=true`): runs the daily sweep now |

## Local runner: token management (browser session)
| Method | Path | Body / Response |
|---|---|---|
| GET | `/api/settings/runner` | `{ engine, hasToken, tokenCreatedAt, lastSeen, engines, queued, running }` |
| POST | `/api/settings/runner/token` | `{ token }`. The token is shown once; creating a new one replaces the old one. Only a SHA-256 hash is stored |
| DELETE | `/api/settings/runner/token` | `{ ok: true }` |

## Local runner: runner endpoints (`Authorization: Bearer taa_rt_…`)
A runner token works **only** on these paths, and these paths accept **only** a runner token, never a browser session.

| Method | Path | Body / Response |
|---|---|---|
| POST | `/api/runner/hello` | `{ engines }` → `{ user, storage, workerEngine, queued }` |
| POST | `/api/runner/jobs/claim` | `{ engines }` → `{ job, context }`, or `{ job: null }`. If the fact sheet can't be built, the job fails and the response is `{ job: null, skipped, retry: true }` |
| POST | `/api/runner/jobs/:id/result` | `{ report, engine }` → `{ ok, analysisId, decision, ruleNotes }`. The Worker re-normalizes the report and re-applies the house rules before saving |
| POST | `/api/runner/jobs/:id/fail` | `{ error }` → `{ ok: true }` |
| POST | `/api/runner/enqueue` | `{ symbol, mode? }` → `{ job }` |
| POST | `/api/runner/sweep` | `{ mode? }` → `{ queued, jobs }`. Queues every watchlist symbol, up to `CRON_MAX_SYMBOLS` |

All types are defined in [`packages/shared/src/types.ts`](../packages/shared/src/types.ts).
