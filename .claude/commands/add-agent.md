---
description: Add a new agent role to the deep multi-agent pipeline
argument-hint: <role, e.g. "Macro Analyst">
---

Add a **$ARGUMENTS** agent to the deep analysis pipeline.

1. Read `docs/AI_AGENTS.md`, `packages/agents/src/prompts.ts` and `packages/agents/src/pipeline.ts`.
2. In `prompts.ts`, add a system prompt that starts with `GROUND_RULES`, states a word limit, and ends with an explicit stance line.
3. In `runDeepAnalysis()`, call the agent at the right stage. Analysts run in parallel with the other analysts; reviewers run after the trader. Push its note to `notes`, and include its output in the Portfolio Manager prompt.
4. If it needs data that is not in `AnalysisContext`, add the data to `context.ts` and `renderContext()`. Gather it in `apps/worker/src/services/analysis.ts` (`buildContext`). Numbers must be computed by code, not by the LLM.
5. Update the LLM call count in `packages/agents/src/pipeline.test.ts`, and the "8 AI calls" text in `docs/AI_AGENTS.md`, `PROJECT_CONTEXT.md` and `apps/web/src/pages/SymbolPage.tsx`.
6. Run `npm run check`.
