---
trigger: always_on
description: Core project rules for TradeAgent (mirrors AGENTS.md golden rules)
---

# TradeAgent project rules

Full guide: `AGENTS.md`. Context: `PROJECT_CONTEXT.md`. Requirements: `REQUIREMENTS.md`.

1. **Cloudflare Workers runtime.** No Node built-ins or Node-only SDKs in `apps/worker` or `packages/*`. Use `fetch` + REST.
   - The only exception is `apps/runner`, the local AI runner on the user's PC. It may spawn CLIs.
   - Even there, prompts go through stdin or a single argv entry, never a shell string.
   - Keep its tool-blocking flags.
2. **Numbers come from code, not LLMs.** Indicators and P/L are computed in `packages/market-data` and `packages/shared`.
   - Always normalize model output with `normalizeReport()`, then `applyHouseRules()`.
   - The rules: don't chase more than 5% above MA5, keep the levels sane, and compute reward/risk in code.
3. **Transactions are the source of truth.** Positions are derived, never stored.
4. **Persistence only through the `Store` interface** (`apps/worker/src/lib/store.ts`).
5. **Sheet schema changes are additive.** Edit `packages/shared/src/schema.ts` and bump `SCHEMA_VERSION`.
6. **Security:**
   - Keep the `drive.file` scope only, and keep `ALLOWED_EMAILS` and the same-origin write check.
   - Never log or return secrets or tokens.
7. **Secrets** live in `apps/worker/.dev.vars` and `apps/runner/runner.env` (both gitignored) or `wrangler secret put`. Never commit them, and never read or print the runner token.
8. **Every analysis shows the disclaimer.** Never add trade execution.
9. **UI:** mobile-first (360 px and up), dark mode through the CSS variables in `apps/web/src/styles.css`, and existing components from `components/ui.tsx`.
10. **Before you finish:** run `npm run check` (typecheck + test + build) and make sure it passes.
11. **Ask the human before** deploying, changing secrets or KV, changing auth or scopes, or running data migrations.
