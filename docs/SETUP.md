# Setup guide

## 0. Prerequisites
- Node.js 20+ and npm 10+ (`node -v`).
- A Cloudflare account (free).
- A Google account. Use a Google Cloud project for OAuth.
- API keys: Gemini (AI Studio), optionally Anthropic, Finnhub and Twelve Data.

## 1. Local development (offline)

```bash
npm install
cp apps/worker/.dev.vars.example apps/worker/.dev.vars
npm run dev            # → http://localhost:5173
```

With `DEV_AUTH_BYPASS=true`:

- You are signed in as "Dev User".
- Data goes to local KV in `apps/worker/.wrangler/state`.
- Add market and AI keys to `.dev.vars` to get prices and analysis.

To trigger the daily sweep manually, run `curl -X POST http://localhost:8787/api/cron/run`.

## 2. Google OAuth + Sheets

1. Go to <https://console.cloud.google.com/> and create a project, e.g. *tradeagent*.
2. Under **APIs & Services → Library**, enable **Google Sheets API** and **Google Drive API**.
3. Under **APIs & Services → OAuth consent screen** (Google Auth Platform):
   - User type: **External**. Add an app name, support email and developer email.
   - **Data access / Scopes:** `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`, `.../auth/drive.file`.
   - **Audience / Test users:** add every Google account listed in `ALLOWED_EMAILS`.
   - You can leave the app in **Testing** for personal use. `drive.file` is non-sensitive, so you can publish without a security review if you want. Note that in Testing mode, refresh tokens expire after 7 days, so you must sign in again weekly. Publish the app to avoid that.
4. Under **Credentials → Create credentials → OAuth client ID → Web application**:
   - Authorized redirect URIs: `http://localhost:5173/auth/callback` and `https://<worker-name>.<subdomain>.workers.dev/auth/callback`, plus your custom domain if you have one.
5. Copy the client ID and secret into `.dev.vars` and set `DEV_AUTH_BYPASS=false` to test real sign-in locally.

On first sign-in, the app creates **"Trading Analysis Agent — Database"** in your Drive.

## 3. Market data keys
- **Finnhub:** sign up at finnhub.io and copy the API key from the dashboard. The free tier covers US real-time quotes, fundamentals and news.
- **Twelve Data:** sign up at twelvedata.com and copy the API key. The free tier covers daily history for US and many international exchanges.

Symbols use each provider's format: US `AAPL`; Canada `SHOP.TO` (Finnhub) or `SHOP:TSX` (Twelve Data). The router tries both.

## 4. AI: local runner or API keys

### Option A: local runner (uses your subscriptions, no API keys)
1. Install and sign in to at least one CLI on your PC:
   - **Antigravity CLI** (`agy`) ships with Antigravity. Run `agy models` to confirm you're signed in.
   - **Gemini CLI:** run `npm i -g @google/gemini-cli`, then `gemini`, and choose *Login with Google*.
   - **Claude Code:** run `claude` once and sign in. If `doctor --test` reports "OAuth session expired", run `claude` again and sign in.
2. Leave `GEMINI_API_KEY` and `ANTHROPIC_API_KEY` empty. The engine switches to the runner automatically; to force it, set `AI_ENGINE=runner`.
3. In the app, open **Settings → Local AI runner → Create runner token**.
4. Run `copy apps\runner\runner.env.example apps\runner\runner.env` (on macOS or Linux, `cp`). Set `TAA_URL`: use `http://localhost:5173` or `:8787` in dev, or your `workers.dev` URL in prod. Set `TAA_RUNNER_TOKEN` too.
5. Run `npm run runner -- doctor --test` to check each CLI and the connection, then `npm run runner -- watch`.
6. Optional: have it start with Windows. In Task Scheduler, add a task that runs `npm run runner -- watch` in the repo folder at log on. Or run `npm run runner -- sweep` once a day after the close.

The runner only processes jobs while it is running. Jobs queued while your PC is off wait in the queue, and are marked failed 20 minutes after a runner claims them without finishing.

### Option B: cloud API keys
- **Gemini:** get a key at <https://aistudio.google.com/apikey>. There is a free tier; Google AI Pro includes monthly Cloud credits you can claim in AI Studio.
- **Claude:** get a key at <https://console.anthropic.com/settings/keys>. This is optional but recommended as the fallback.
- Set `AI_PRIMARY=claude` to make Claude primary and Gemini the fallback.

## 5. Deploy to Cloudflare

```bash
npx wrangler login
npx wrangler kv namespace create KV
# paste the returned id into apps/worker/wrangler.jsonc → kv_namespaces[0].id
```

Edit `apps/worker/wrangler.jsonc` → `vars`:
- `APP_URL`: `https://trading-analysis-agent.<your-subdomain>.workers.dev`
- `ALLOWED_EMAILS`: `you@gmail.com`
- `DEV_AUTH_BYPASS`: `"false"`

Then set secrets and deploy:

```bash
cd apps/worker
npx wrangler secret put SESSION_SECRET        # e.g. output of: node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put FINNHUB_API_KEY
npx wrangler secret put TWELVEDATA_API_KEY
npx wrangler secret put TELEGRAM_BOT_TOKEN    # optional
npx wrangler secret put TELEGRAM_CHAT_ID      # optional
cd ../..
npm run deploy
```

Use `npx wrangler tail` (in `apps/worker`) to stream logs.

**Custom domain:** in the Cloudflare dashboard, go to Workers → your worker → Settings → Domains & Routes. Then update `APP_URL` and the Google redirect URI.

## 6. Telegram daily digest (optional)
1. Message **@BotFather**, send `/newbot`, and copy the token.
2. Send any message to your bot. Open `https://api.telegram.org/bot<TOKEN>/getUpdates` and copy `chat.id`.
3. Set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`.

## Troubleshooting
| Symptom | Fix |
|---|---|
| `redirect_uri_mismatch` | The redirect URI in Google Cloud must exactly equal `APP_URL + /auth/callback` |
| "not in ALLOWED_EMAILS" | Add the account to `ALLOWED_EMAILS` (comma-separated) |
| `auth_error=no_refresh_token` | Remove the app at <https://myaccount.google.com/permissions> and sign in again |
| Prices show "—" | Check `FINNHUB_API_KEY` / `TWELVEDATA_API_KEY` in Settings → Integrations; check the symbol format |
| Analysis fails with 502 | Both AI providers failed. Check the keys and model IDs (`GET https://generativelanguage.googleapis.com/v1beta/models?key=…`) |
| `wrangler dev` complains about the assets dir | Run `npm run build` once, or `node scripts/ensure-web-dist.mjs` |
