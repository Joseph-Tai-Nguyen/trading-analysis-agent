import { LLMError, type LLMClient, type LLMRequest, type LLMResponse } from "./types";

/**
 * Google Gemini via the Gemini Developer API (REST, no SDK so it runs on
 * Cloudflare Workers). Get a key at https://aistudio.google.com/apikey.
 * Model IDs change often — configure them with GEMINI_MODEL_FAST /
 * GEMINI_MODEL_DEEP. The "-latest" aliases track Google's current models.
 */
export class GeminiClient implements LLMClient {
  readonly name = "gemini";

  constructor(
    private readonly apiKey: string,
    private readonly models: { fast: string; deep: string },
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async generate(req: LLMRequest): Promise<LLMResponse> {
    const model = this.models[req.tier ?? "fast"];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const body = {
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [{ role: "user", parts: [{ text: req.prompt }] }],
      generationConfig: {
        temperature: req.temperature ?? 0.3,
        maxOutputTokens: req.maxTokens ?? 4096,
        ...(req.json ? { responseMimeType: "application/json" } : {}),
      },
    };
    const res = await this.fetchFn(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      throw new LLMError(this.name, `HTTP ${res.status} (${model}): ${detail}`, res.status);
    }
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
      promptFeedback?: { blockReason?: string };
    };
    if (data.promptFeedback?.blockReason) {
      throw new LLMError(this.name, `blocked: ${data.promptFeedback.blockReason}`);
    }
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const text = parts
      .filter((p) => !p.thought)
      .map((p) => p.text ?? "")
      .join("")
      .trim();
    if (!text) throw new LLMError(this.name, `empty response (finish: ${data.candidates?.[0]?.finishReason ?? "?"})`);
    return { text, provider: this.name, model };
  }
}
