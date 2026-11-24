---
description: Deploy TradeAgent to Cloudflare Workers (always confirm with the user first)
---

1. Run the `/check` workflow. Stop if anything fails.
2. Confirm that `apps/worker/wrangler.jsonc` has:
   - a real KV namespace id,
   - `APP_URL` set to the production URL,
   - `ALLOWED_EMAILS` set,
   - `DEV_AUTH_BYPASS` set to `"false"`.
3. Ask the user to confirm that the secrets are set (`npx wrangler secret list` in `apps/worker`). Never print secret values.
4. **Ask the user for explicit approval to deploy.**
5. `npm run deploy`
6. Open `<APP_URL>/api/health` and confirm `{"ok":true}`.
