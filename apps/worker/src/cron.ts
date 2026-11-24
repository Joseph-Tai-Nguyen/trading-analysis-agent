import { DISCLAIMER, type Decision, type RunnerJob, type WatchItem } from "@taa/shared";
import { isDevBypass, type Env } from "./env";
import { aiEngine, enqueueJobs } from "./lib/runner";
import { sendTelegram } from "./lib/telegram";
import { accessTokenFor, DEV_USER, isEmailAllowed, sheetsStoreFor, type UserRecord } from "./lib/session";
import { KvStore, type Store } from "./lib/store";
import { analyzeAndSave } from "./services/analysis";

const ICON: Record<Decision, string> = {
  STRONG_BUY: "🟢🟢",
  BUY: "🟢",
  HOLD: "🟡",
  REDUCE: "🟠",
  SELL: "🔴",
};

export const sweepLimit = (env: Env) => Math.max(1, Number(env.CRON_MAX_SYMBOLS ?? 10) || 10);

export function digestLine(symbol: string, r: { decision?: Decision; confidence?: number; oneLiner?: string } | null): string {
  if (!r?.decision) return `⚪ ${symbol} — analysis failed`;
  return `${ICON[r.decision]} ${symbol} ${r.decision} (${r.confidence ?? "?"}%) — ${r.oneLiner ?? ""}`;
}

const sendDigest = (env: Env, lines: string[]) =>
  sendTelegram(env, `📊 Daily watchlist report (${new Date().toISOString().slice(0, 10)})\n\n${lines.join("\n")}\n\n${DISCLAIMER}`);

/** Runner mode: send the digest once every job in a sweep batch has finished. */
export async function maybeSendBatchDigest(env: Env, jobs: RunnerJob[], batchId: string | undefined): Promise<void> {
  if (!batchId) return;
  const batch = jobs.filter((j) => j.batchId === batchId);
  if (!batch.length || batch.some((j) => j.status === "queued" || j.status === "running")) return;
  await sendDigest(env, batch.map((j) => digestLine(j.symbol, j.status === "done" ? j : null)));
}

/** Every allow-listed user with an open store (or the dev user). */
async function sweepTargets(env: Env): Promise<{ sub: string; label: string; store: Store }[]> {
  if (isDevBypass(env)) return [{ sub: DEV_USER.sub, label: DEV_USER.email, store: new KvStore(env.KV, DEV_USER.sub) }];
  const targets: { sub: string; label: string; store: Store }[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.KV.list({ prefix: "user:", cursor });
    for (const k of page.keys) {
      const user = await env.KV.get<UserRecord>(k.name, "json");
      if (!user || !isEmailAllowed(env, user.email)) continue;
      try {
        let token: Promise<string> | null = null;
        const { store } = await sheetsStoreFor(env, user, () => (token ??= accessTokenFor(env, user)));
        targets.push({ sub: user.sub, label: user.email, store });
      } catch (e) {
        console.error(`cron: cannot open store for ${user.email}`, e);
      }
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return targets;
}

/**
 * Daily watchlist sweep (daily_stock_analysis style): quick-analyze every
 * watchlist symbol for each user, save to their sheet, and push a Telegram digest.
 *
 * - AI engine "api": the Worker calls Gemini/Claude now and sends the digest.
 * - AI engine "runner": the Worker only queues the jobs; the local runner on the
 *   user's PC answers them and the digest goes out when the batch is finished.
 */
export async function runDailySweep(env: Env): Promise<void> {
  const engine = aiEngine(env);
  for (const { sub, label, store } of await sweepTargets(env)) {
    const items = (await store.list("watchlists")) as unknown as WatchItem[];
    const symbols = [...new Set(items.map((i) => i.symbol))].slice(0, sweepLimit(env));
    if (!symbols.length) continue;

    if (engine === "runner") {
      await enqueueJobs(env, sub, symbols.map((symbol) => ({ symbol, mode: "quick" as const })), {
        source: "sweep",
        batchId: crypto.randomUUID(),
      });
      console.log(`cron: ${label} queued ${symbols.length} symbols for the local runner`);
      continue;
    }

    const lines: string[] = [];
    for (const symbol of symbols) {
      try {
        lines.push(digestLine(symbol, await analyzeAndSave(env, store, symbol, "quick")));
      } catch (e) {
        lines.push(digestLine(symbol, null));
        console.error(`cron: ${symbol}`, e);
      }
    }
    await sendDigest(env, lines);
    console.log(`cron: ${label} analyzed ${symbols.length} symbols`);
  }
}
