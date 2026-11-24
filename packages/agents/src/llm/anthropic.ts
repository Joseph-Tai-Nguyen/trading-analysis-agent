import { LLMError, type LLMClient, type LLMRequest, type LLMResponse } from "./types";

/**
 * Anthropic Claude via the Messages API (REST). Used as the fallback when
 * Gemini fails or is rate limited (or as primary with AI_PRIMARY=claude).
 * Get a key at https://console.anthropic.com/. Model IDs are configured with
 * CLAUDE_MODEL_FAST / CLAUDE_MODEL_DEEP.
 */
export class AnthropicClient implements LLMClient {
  readonly name = "claude";

  constructor(
    private readonly apiKey: string,
    private readonly models: { fast: string; deep: string },
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async generate(req: LLMRequest): Promise<LLMResponse> {
    const model = this.models[req.tier ?? "fast"];
    const system = req.json
      ? `${req.system}\n\nRespond with a single valid JSON object only — no prose, no markdown fences.`
      : req.system;
    const res = await this.fetchFn("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: req.maxTokens ?? 4096,
        system,
        messages: [{ role: "user", content: req.prompt }],
      }),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      throw new LLMError(this.name, `HTTP ${res.status} (${model}): ${detail}`, res.status);
    }
    const data = (await res.json()) as { content?: { type: string; text?: string }[]; stop_reason?: string };
    const text = (data.content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("")
      .trim();
    if (!text) throw new LLMError(this.name, `empty response (stop: ${data.stop_reason ?? "?"})`);
    return { text, provider: this.name, model };
  }
}
