# CLAUDE.md

Claude Code instructions for this repo. The shared rules live in AGENTS.md, imported below. Don't duplicate them here.

@AGENTS.md
@PROJECT_CONTEXT.md

## Claude Code specifics

- **Verify before finishing:** run `npm run check` (typecheck + test + build). For Worker changes, also run `npx wrangler deploy --dry-run` in `apps/worker`.
- **Running the app:** `npm run dev`, then open http://localhost:5173. With `DEV_AUTH_BYPASS=true` in `apps/worker/.dev.vars`, no Google login is needed. Smoke-test the API with `curl http://localhost:8787/api/status`.
- **Slash commands** (`.claude/commands/`):
  - `/check` runs the full verification and summarizes failures.
  - `/add-market-provider <name>` scaffolds a new `MarketDataProvider`.
  - `/add-agent <role>` adds an agent role to the deep pipeline.
  - `/runner [watch|once|sweep|analyze SYM]` checks and starts the local AI runner.
- **Permissions:** `.claude/settings.json` allows the common read-only and npm commands. Deploy and secret commands are deliberately *not* allowed, so ask first (see AGENTS.md → Boundaries).
- **Claude as the app's AI fallback.** There are two paths:
  - **Local runner:** the runner calls `claude -p` (Claude Code, with your subscription) as one of its engines. Model aliases come from `CLAUDE_CODE_MODEL_FAST/DEEP` in `apps/runner/runner.env`.
  - **Cloud:** the Worker calls the Anthropic **Messages API** (`packages/agents/src/llm/anthropic.ts`) with `ANTHROPIC_API_KEY`. Model IDs come from `CLAUDE_MODEL_FAST/DEEP` in `apps/worker/wrangler.jsonc`.
- Keep personal overrides in `CLAUDE.local.md` or `.claude/settings.local.json`. Both are gitignored.
