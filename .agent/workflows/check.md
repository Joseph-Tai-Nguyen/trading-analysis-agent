---
description: Verify the project (typecheck, unit tests, build, Worker dry-run)
---

// turbo
1. `npm run typecheck`
// turbo
2. `npm test`
// turbo
3. `npm run build`
// turbo
4. In `apps/worker`, run `npx wrangler deploy --dry-run`.
5. Summarize the results. For each failure, give the file:line and a proposed fix.
