---
description: Start the local AI runner so analyses run on this PC with Antigravity CLI / Gemini CLI / Claude Code (no API keys)
---

The local runner answers the app's queued analyses with the user's own subscriptions. Read `apps/runner/runner.env.example` and docs/AI_AGENTS.md → "Local runner" if anything is unclear.

1. If `apps/runner/runner.env` does not exist, copy `apps/runner/runner.env.example` to `apps/runner/runner.env`. **Never read or print the token in that file.** Ask the user to paste `TAA_URL` and `TAA_RUNNER_TOKEN` into it themselves. They create the token in the app under Settings → Local AI runner. Do not invent a token.
// turbo
2. Check the setup: `npm run runner -- doctor`. If an engine shows "not installed", tell the user how to install it. If the token or connection fails, stop and tell the user.
3. Ask the user whether to send each CLI a one-word health check (it uses a little of their quota): `npm run runner -- doctor --test`. If a CLI fails to authenticate, ask the user to open it once and sign in.
4. Start the runner: `npm run runner -- watch`. It is long-running, so keep it in the background. It prints each job, the engine and model used per call, and the final decision with buy point, target, stop and any house-rule notes.
5. To analyze the whole watchlist now instead: `npm run runner -- sweep` (add `--deep` for the 8-agent team). For one symbol: `npm run runner -- analyze NVDA --deep`.

Do not change the engine flags that block tool use (`--mode plan --sandbox` for agy, `--disallowedTools` for claude). They keep the CLIs acting as plain models.
