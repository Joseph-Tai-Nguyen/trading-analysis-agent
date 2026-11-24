import { createLLM, type FallbackLLM } from "@taa/agents";
import { createMarketData, type MarketData } from "@taa/market-data";
import type { Env } from "../env";

// One MarketData per isolate so its in-memory cache is shared across requests.
let md: { key: string; value: MarketData } | null = null;

export function marketData(env: Env): MarketData {
  const key = `${env.FINNHUB_API_KEY ?? ""}|${env.TWELVEDATA_API_KEY ?? ""}`;
  if (!md || md.key !== key) {
    md = {
      key,
      value: createMarketData({ finnhubApiKey: env.FINNHUB_API_KEY, twelveDataApiKey: env.TWELVEDATA_API_KEY }),
    };
  }
  return md.value;
}

export function llm(env: Env): FallbackLLM {
  return createLLM({
    primary: env.AI_PRIMARY === "claude" ? "claude" : "gemini",
    geminiApiKey: env.GEMINI_API_KEY,
    geminiModels: env.GEMINI_MODEL_FAST && env.GEMINI_MODEL_DEEP ? { fast: env.GEMINI_MODEL_FAST, deep: env.GEMINI_MODEL_DEEP } : undefined,
    anthropicApiKey: env.ANTHROPIC_API_KEY,
    claudeModels: env.CLAUDE_MODEL_FAST && env.CLAUDE_MODEL_DEEP ? { fast: env.CLAUDE_MODEL_FAST, deep: env.CLAUDE_MODEL_DEEP } : undefined,
  });
}
