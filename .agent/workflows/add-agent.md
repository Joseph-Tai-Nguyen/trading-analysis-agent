---
description: Add a new agent role (e.g. Macro Analyst) to the deep multi-agent pipeline
---

1. Ask the user for the role name and what it should evaluate.
2. Read `docs/AI_AGENTS.md`, `packages/agents/src/prompts.ts` and `packages/agents/src/pipeline.ts`.
3. Add a system prompt in `prompts.ts`. It must start with `GROUND_RULES`, set a word limit, and end with a stance line.
4. Wire the agent into `runDeepAnalysis()` at the right stage. Push its note, and include its output in the Portfolio Manager prompt.
5. If new data is needed, extend `AnalysisContext` and `renderContext()`, and gather the data in `apps/worker/src/services/analysis.ts`. Code computes the numbers.
6. Update the call count in `packages/agents/src/pipeline.test.ts` and in the docs that mention "8 AI calls".
// turbo
7. Run `npm run check`.
