/** "fast" = cheap/quick model (Flash / Haiku); "deep" = reasoning model (Pro / Sonnet). */
export type ModelTier = "fast" | "deep";

export interface LLMRequest {
  system: string;
  prompt: string;
  tier?: ModelTier;
  /** Ask the provider for a JSON-only response. */
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
}

export interface LLMResponse {
  text: string;
  provider: string;
  model: string;
}

export interface LLMClient {
  readonly name: string;
  generate(req: LLMRequest): Promise<LLMResponse>;
}

export class LLMError extends Error {
  constructor(
    public readonly provider: string,
    message: string,
    public readonly status?: number,
  ) {
    super(`[${provider}] ${message}`);
    this.name = "LLMError";
  }
}
