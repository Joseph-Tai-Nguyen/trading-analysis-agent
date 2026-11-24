---
description: Install dependencies and run TradeAgent locally (Worker :8787 + UI :5173)
---

1. Make sure Node.js 20+ is installed: `node -v`.
// turbo
2. Install dependencies: `npm install`
3. If `apps/worker/.dev.vars` does not exist, copy `apps/worker/.dev.vars.example` to `apps/worker/.dev.vars`. Keep `DEV_AUTH_BYPASS=true` for offline development. Ask the user to fill in any API keys they have; do not invent keys.
4. Start the dev servers: `npm run dev` (long-running; keep it in the background).
5. Open http://localhost:5173 in the browser. Verify that the Portfolio, Watchlists and Settings pages load.
