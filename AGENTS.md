# AGENTS.md — instructions for AI coding agents

This is the canonical guide for any AI assistant working in this repo: Claude Code, Antigravity, Gemini CLI, Codex, Cursor and others. Tool-specific files ([CLAUDE.md](CLAUDE.md), [GEMINI.md](GEMINI.md)) import this one. **Keep rules here, not there.**

Read [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) for the *why* and [REQUIREMENTS.md](REQUIREMENTS.md) for the *what*.

## Stack at a glance

- **Monorepo:** npm workspaces, TypeScript (strict), ESM everywhere.
- **`apps/web`:** React 19 + Vite 7 PWA. No UI framework, plain CSS (`src/styles.css`), and a hash router (`src/lib/router.ts`).
- **`apps/worker`:** a Cloudflare Worker on Hono 4. It serves `apps/web/dist` as static assets and exposes `/api/*` and `/auth/*`. Cron is the daily sweep.
- **`packages/shared`:** domain types, the Google Sheets schema, and portfolio math. It has **no dependencies** and is imported by both runtimes.
- **`packages/market-data`:** provider interface, Finnhub and Twelve Data providers, a fallback router with a TTL cache, and technical indicators.
- **`packages/agents`:** Gemini and Anthropic REST clients, the `FallbackLLM` router, prompts, the quick and deep pipelines, and the house rules (`rules.ts`).
- **`apps/runner`:** the local AI runner, a **Node** app for the user's PC. It claims queued jobs from the Worker and answers them with Antigravity CLI (`agy`), Gemini CLI or Claude Code. It runs with `tsx`.
- **Storage:** Google Sheets in the user's Drive (prod), or KV (`DEV_AUTH_BYPASS=true`). KV also holds sessions and encrypted Google tokens.

## Commands

```bash
npm install            # once
npm run dev            # worker :8787 + web :5173 (open 5173)
npm run typecheck      # must pass
npm test               # vitest — must pass
npm run build          # web → apps/web/dist
npm run check          # all of the above (CI)
npx wrangler deploy --dry-run   # (in apps/worker) validate the Worker bundle
npm run runner -- doctor        # local AI runner: check CLIs + connection (add --test to call each CLI)
```

Run `npm run check` before saying a change is done.

## Golden rules

1. **Workers runtime only.** Server code must run on Cloudflare Workers: use `fetch`, Web Crypto and Web Streams. Don't use Node built-ins (`fs`, `path`, `child_process`) in `apps/worker` or `packages/*`. Don't add SDKs that need Node, so call REST APIs with `fetch` instead (as the Gemini, Anthropic, Sheets and Drive clients already do).
   - **The one exception is `apps/runner`.** It runs on the user's PC and may use Node built-ins to spawn CLIs.
   - Even there, pass prompts through stdin or a single argv entry, never a shell string.
   - Keep the guard prompt and the tool-blocking flags.
2. **Numbers come from code, not LLMs.** Prices, indicators and P/L are computed in `packages/market-data` and `packages/shared`, then passed to agents as facts.
   - Prompts must forbid inventing numbers.
   - Model output is always normalized by `normalizeReport()`, then checked by `applyHouseRules()` (don't chase above MA5, sane levels, computed reward/risk). Never trust its shape.
   - Reports from the local runner are re-validated by the Worker against the context the Worker built.
3. **Transactions are the source of truth.** Positions are derived (`computePositions`) and never stored.
4. **Persistence goes through `Store`** (`apps/worker/src/lib/store.ts`). Routes never call the Sheets API or KV directly.
5. **Schema changes are additive.** Columns are matched by header name. To add a column, append it in `packages/shared/src/schema.ts` and bump `SCHEMA_VERSION`; `ensureSchema` will migrate existing sheets. Never rename or reorder columns without a migration plan in `docs/DATA_MODEL.md`.
6. **Providers are pluggable.** A new market-data source implements `MarketDataProvider` and gets wired into `createMarketData()`'s chains. A new LLM implements `LLMClient` and gets added in `createLLM()`.
7. **Security**
   - Never log or return tokens or API keys.
   - Google tokens are AES-GCM encrypted in KV (`lib/crypto.ts`).
   - Keep the `drive.file` scope. Don't request broader Google scopes.
   - Keep `ALLOWED_EMAILS` enforcement.
   - Keep the same-origin check on writes.
   - Validate every request field (`lib/http.ts` helpers).
8. **Not financial advice.** Every analysis surface shows `DISCLAIMER`. Don't add features that place trades or connect to brokerage order APIs.
9. **Secrets** live in `apps/worker/.dev.vars` (gitignored) or `wrangler secret put`. Never commit them. Add new vars to `.dev.vars.example`, `src/env.ts`, `README.md` and `wrangler.jsonc` `vars` (if non-secret).

## Conventions

- **TypeScript:** `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`. Use `import type` for types. Avoid `any`; at untyped boundaries, cast through `unknown`.
- **Files:** kebab or camel case as existing; React components are `PascalCase.tsx`. One route module per resource in `apps/worker/src/routes/`.
- **API:** JSON only. Errors are `{ error, detail? }` with the right HTTP status (throw `HttpError` and let `app.onError` handle it). Document new endpoints in [docs/API.md](docs/API.md).
- **UI:**
  - Mobile-first. The layout must work from 360 px wide up to desktop.
  - Reuse the components in `components/ui.tsx` and the CSS variables in `styles.css`. Support dark mode through those variables.
  - Live data polls through `usePolling`. Don't cache `/api` in the service worker.
- **Tests:** put pure logic next to its source as `*.test.ts` (Vitest). Mock `fetch` and `LLMClient`; never hit real APIs in tests.
- **Comments:** explain *why*, not *what*. Keep the header comments that explain design constraints.
- **Dependencies:** add them only with clear value. Prefer small and Workers-compatible. Pin to caret ranges.

## Where things go

| Task | Location |
|---|---|
| New API endpoint | `apps/worker/src/routes/*.ts` → mount in `src/index.ts` → `apps/web/src/lib/api.ts` → `docs/API.md` |
| New page | `apps/web/src/pages/` + route in `src/lib/router.ts` + `App.tsx` + `NavBar.tsx` |
| New indicator | `packages/market-data/src/indicators.ts` (+ test) → `TechnicalSnapshot` |
| New agent role | `packages/agents/src/prompts.ts` + `pipeline.ts` (+ test) → `docs/AI_AGENTS.md` |
| Change a house rule | `packages/agents/src/rules.ts` (+ `rules.test.ts`) and keep `prompts.ts → TRADING_RULES` consistent |
| New local CLI engine | `apps/runner/src/engines/engines.ts` (an `LLMClient` + output parser + test) → `config.ts` → `runner.env.example` |
| New table / column | `packages/shared/src/schema.ts` (bump `SCHEMA_VERSION`) → `docs/DATA_MODEL.md` |
| Architecture decision | `docs/decisions/NNNN-title.md` |

## Boundaries — ask the human first

- Deploying (`npm run deploy`, `wrangler deploy`), creating or deleting KV namespaces, or setting secrets.
- Changing OAuth scopes, auth or session logic (including the runner bearer-token scope), or encryption.
- Deleting data, or any migration that rewrites existing sheet rows.
- Adding paid services or new third-party data sources.
- Anything that executes trades or moves money. **This is never in scope.**
