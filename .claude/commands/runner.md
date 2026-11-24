---
description: Check and start the local AI runner (Antigravity CLI / Gemini CLI / Claude Code answer the app's queued analyses)
argument-hint: "[watch | once | sweep [--deep] | analyze SYMBOL [--deep]]"
---

Help me run the local AI runner in `apps/runner`. The details are in docs/AI_AGENTS.md → "Local runner".

1. If `apps/runner/runner.env` is missing, copy `apps/runner/runner.env.example` to it. Then ask me to fill in `TAA_URL` and `TAA_RUNNER_TOKEN` myself (Settings → Local AI runner). Never read, print or invent the token.
2. Run `npm run runner -- doctor` and summarize which engines were found and whether the connection works.
3. Then run `npm run runner -- $ARGUMENTS`, or `watch` if I gave no argument. Run `watch` in the background, and tell me how to stop it.

Don't weaken the tool-blocking flags in `apps/runner/src/engines/engines.ts`.
