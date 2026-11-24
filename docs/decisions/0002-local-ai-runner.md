# 0002 — Local AI runner for subscription CLIs

- **Status:** accepted
- **Date:** 2026-11-24

## Context

The owner pays for a Google AI plan (and a Claude plan) and wants the analysis to use those, not pay-per-token APIs. The subscriptions do **not** include a Gemini API key. They do include higher limits in **Antigravity CLI** (`agy`) and **Gemini CLI**, and Claude Code uses the Claude plan. These are local CLIs signed in with the user's account. A Cloudflare Worker cannot run them.

The two reference projects use API keys: daily_stock_analysis uses `GEMINI_API_KEY` from the AI Studio free tier, and TradingAgents uses `GOOGLE_API_KEY`. Their *methods* (the agent team and the decision dashboard with its trading discipline) don't depend on how the model is reached.

## Decision

Add `apps/runner`, a Node app on the user's PC, and a job queue in the Worker:

- `AI_ENGINE` sets where analysis runs:
  - `api` means the Worker calls the REST APIs, as before.
  - `runner` means jobs are queued.
  - Unset means `api` if an AI key is set, otherwise `runner`.
- The Worker keeps owning the facts. At claim time it builds the fact sheet from live market data and code-computed indicators. It saves that sheet, then re-normalizes every returned report and re-applies `applyHouseRules` against it before saving.
- The runner implements `LLMClient` over each CLI and reuses the same `runAnalysis()`, so quick and deep mode, the prompts and the house rules are identical in both engines.
- **Auth:**
  - A per-user bearer token is created in Settings. It is shown once and only its SHA-256 hash is stored.
  - The token is valid **only** on `/api/runner/*`, and those paths accept **only** the token. A leaked token can run analyses but cannot read or change the portfolio.
- **Safety:**
  - Every CLI call runs in an empty temp folder, with tools blocked (`agy --mode plan --sandbox`, `claude --disallowedTools …`) and a guard prompt.
  - Prompts go through stdin or a single argv entry, never a shell string.
  - News text in the fact sheet is marked as data.

## Consequences

- **Good:** uses what the owner already pays for. No AI keys in the Worker. The same rules and audit trail apply in both modes.
- **Bad:** analyses only run while the PC and runner are on. The daily cron only queues the jobs, and the digest is sent when the runner finishes the batch.
- **KV limits:**
  - Polls never write, and heartbeats are throttled to one every 15 minutes, to stay within the KV free tier (1k writes/day).
  - The queue is one KV document per user. That is simple and consistent enough at personal scale, but concurrent enqueues could race.
- **Terms:** the CLIs' terms of use apply. This is single-user, personal automation of the owner's own accounts.
