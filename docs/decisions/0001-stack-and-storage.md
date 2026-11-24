# ADR 0001 — Stack: Cloudflare Workers + PWA + Google Sheets + Gemini/Claude

- **Status:** Accepted
- **Date:** 2026-11-24

## Context
We need a personal portfolio and watchlist app with live prices and AI analysis. It must:

- Run on Windows, macOS and mobile.
- Be hosted on Cloudflare Workers.
- Store data in Google Sheets in the user's Drive, behind Google login.
- Use the owner's Google AI plan, with Claude as the fallback.

## Decision
| Concern | Choice | Alternatives considered |
|---|---|---|
| Hosting | One Worker with static assets, Hono router, cron trigger | Pages + Functions (older model); Vercel (not CF) |
| Client | React 19 + Vite PWA, no UI framework | Native apps (3 codebases); Next.js (needs Node runtime) |
| Storage | Google Sheets via REST, `drive.file` scope, behind a `Store` interface | D1 (not user-owned); Supabase (extra service; an empty `supabase/` folder was removed) |
| Sessions | KV + AES-GCM-encrypted tokens | JWT cookies (can't hold the refresh token safely) |
| Market data | Finnhub (quotes, fundamentals, news) + Twelve Data (candles) behind `MarketDataProvider` | yfinance (unofficial, Python, not Workers-compatible); Alpha Vantage (25/day free) |
| LLM | Gemini Developer API primary, Anthropic Messages API fallback, REST only | Vertex AI (service-account setup); SDKs (Node dependencies) |

## Consequences
- Everything server-side must be Workers-compatible, so we use `fetch` + REST and no Node SDKs.
- Sheets limits (about 60 req/min per user, no indexes) are acceptable at personal scale. The `Store` interface keeps a later move to D1 cheap.
- Gemini model IDs change often, so they are configuration (`-latest` aliases by default), not code.
- The PWA covers every platform. Native-only features, such as background push on iOS, come later through Web Push.
