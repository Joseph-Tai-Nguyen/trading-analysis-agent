import { AnthropicClient } from "./anthropic";
import { GeminiClient } from "./gemini";
import { LLMError, type LLMClient, type LLMRequest, type LLMResponse } from "./types";

/** Tries each client in order; moves to the next on any error. */
export class FallbackLLM implements LLMClient {
  readonly name: string;

  constructor(private readonly clients: LLMClient[]) {
    if (!clients.length) throw new LLMError("router", "no AI provider configured (set GEMINI_API_KEY and/or ANTHROPIC_API_KEY)", 503);
    this.name = clients.map((c) => c.name).join("→");
  }

  async generate(req: LLMRequest): Promise<LLMResponse> {
    const errors: string[] = [];
    for (const client of this.clients) {
      try {
        return await client.generate(req);
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }
    throw new LLMError("router", `all providers failed: ${errors.join(" | ")}`, 502);
  }
}

export interface LLMConfig {
  primary?: "gemini" | "claude";
  geminiApiKey?: string;
  geminiModels?: { fast: string; deep: string };
  anthropicApiKey?: string;
  claudeModels?: { fast: string; deep: string };
  fetchFn?: typeof fetch;
}

export const DEFAULT_GEMINI_MODELS = { fast: "gemini-flash-latest", deep: "gemini-pro-latest" };
export const DEFAULT_CLAUDE_MODELS = { fast: "claude-haiku-5-5", deep: "claude-sonnet-5-5" };

export function createLLM(cfg: LLMConfig): FallbackLLM {
  const f = cfg.fetchFn ?? fetch;
  const gemini: LLMClient | null = cfg.geminiApiKey ? new GeminiClient(cfg.geminiApiKey, cfg.geminiModels ?? DEFAULT_GEMINI_MODELS, f) : null;
  const claude: LLMClient | null = cfg.anthropicApiKey ? new AnthropicClient(cfg.anthropicApiKey, cfg.claudeModels ?? DEFAULT_CLAUDE_MODELS, f) : null;
  const ordered = cfg.primary === "claude" ? [claude, gemini] : [gemini, claude];
  return new FallbackLLM(ordered.filter((c): c is LLMClient => !!c));
}
