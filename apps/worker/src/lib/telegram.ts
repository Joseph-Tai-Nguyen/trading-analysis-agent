import type { Env } from "../env";

export const telegramEnabled = (env: Env) => !!(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID);

/** Send a plain-text message to the configured Telegram chat (no-op if not configured). */
export async function sendTelegram(env: Env, text: string): Promise<void> {
  if (!telegramEnabled(env)) return;
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: text.slice(0, 4000), disable_web_page_preview: true }),
  });
  if (!res.ok) console.warn("telegram send failed", res.status);
}
