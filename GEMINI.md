# GEMINI.md

Instructions for **Google Antigravity** and **Gemini CLI**. The shared rules live in AGENTS.md, imported below. Don't duplicate them here.

@./AGENTS.md
@./PROJECT_CONTEXT.md

## Antigravity / Gemini CLI specifics

- **Rules:** `.agent/rules/project.md` is always on and mirrors the golden rules in AGENTS.md.
- **Workflows** (`.agent/workflows/`, run with `/`):
  - `/dev` installs and starts the app locally.
  - `/check` runs typecheck, tests and build.
  - `/add-agent` adds an agent role to the deep pipeline.
  - `/deploy` is the deploy checklist. It always asks before deploying.
  - `/runner` checks and starts the **local AI runner**, which answers the app's analyses with `agy`, `gemini` or `claude` on this PC.
- **Gemini CLI** reads this file plus AGENTS.md (configured in `.gemini/settings.json` → `contextFileName`).
- **Browser verification (Antigravity):** start `npm run dev` and open http://localhost:5173. Check the Portfolio, Watchlists, Symbol and Settings pages at mobile (390 px) and desktop widths.
- **Gemini in the app vs. Gemini for coding:**
  - Your Google AI Pro/Ultra plan gives higher limits in Antigravity and Gemini CLI. You use them while you *develop*, and the **local runner** (`apps/runner`) uses them to run the app's analyses with no API key.
  - Alternatively, the Worker calls the **Gemini Developer API** with `GEMINI_API_KEY` from AI Studio (`packages/agents/src/llm/gemini.ts`). `AI_ENGINE` picks `api` or `runner`.
  - Runner model names come from `AGY_MODEL_FAST/DEEP` and `GEMINI_CLI_MODEL_FAST/DEEP` in `apps/runner/runner.env`. List Antigravity's models with `agy models`.
  - Model IDs come from `GEMINI_MODEL_FAST/DEEP` in `apps/worker/wrangler.jsonc`. Prefer the `-latest` aliases or check `GET /v1beta/models`; never hard-code model IDs in source.
- Terminal commands on Windows run in PowerShell. Use `npm run …` scripts, which work on Windows, macOS and Linux, instead of shell-specific one-liners.
