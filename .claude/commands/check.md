---
description: Run typecheck, tests, build and a Worker dry-run; summarize any failures
---

Run the project's full verification and report the results concisely.

1. `npm run typecheck`
2. `npm test`
3. `npm run build`
4. `npx wrangler deploy --dry-run` (run it in `apps/worker`)

For each failure, show the file:line, the error, and a proposed fix. Only change code if I asked you to. If everything passes, say so in one line.
