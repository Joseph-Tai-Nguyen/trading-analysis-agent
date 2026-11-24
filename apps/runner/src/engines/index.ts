import { FallbackLLM, type LLMClient, type LLMRequest, type LLMResponse } from "@taa/agents";
import type { EngineName, RunnerConfig } from "../config";
import { createEngine, ENGINE_BIN } from "./engines";
import { resolveCommand } from "./process";

/** Caps how many CLI processes run at once (deep mode fans out to parallel analysts). */
export class LimitedLLM implements LLMClient {
  readonly name: string;
  private active = 0;
  private waiting: (() => void)[] = [];

  constructor(
    private readonly inner: LLMClient,
    private readonly max: number,
    private readonly onCall?: (req: LLMRequest, res: LLMResponse | null, ms: number, err?: unknown) => void,
  ) {
    this.name = inner.name;
  }

  async generate(req: LLMRequest): Promise<LLMResponse> {
    if (this.active >= this.max) await new Promise<void>((r) => this.waiting.push(r));
    this.active++;
    const t0 = Date.now();
    try {
      const res = await this.inner.generate(req);
      this.onCall?.(req, res, Date.now() - t0);
      return res;
    } catch (e) {
      this.onCall?.(req, null, Date.now() - t0, e);
      throw e;
    } finally {
      this.active--;
      this.waiting.shift()?.();
    }
  }
}

export interface Engines {
  llm: LimitedLLM;
  found: { name: EngineName; bin: string; client: LLMClient }[];
  missing: EngineName[];
}

/** Build the fallback chain from the CLIs that are actually installed. */
export async function createEngines(cfg: RunnerConfig, onCall?: ConstructorParameters<typeof LimitedLLM>[2]): Promise<Engines> {
  const found: Engines["found"] = [];
  const missing: EngineName[] = [];
  for (const name of cfg.engines) {
    const bin = await resolveCommand(ENGINE_BIN[name], cfg.bins[name]);
    if (!bin) {
      missing.push(name);
      continue;
    }
    found.push({ name, bin, client: createEngine(name, bin, cfg.models[name], cfg.timeoutMs) });
  }
  if (!found.length) {
    throw new Error(
      `None of the engines in RUNNER_ENGINES (${cfg.engines.join(", ")}) is installed. ` +
        "Install Antigravity (agy), Gemini CLI (npm i -g @google/gemini-cli) or Claude Code, sign in once, then retry.",
    );
  }
  return { llm: new LimitedLLM(new FallbackLLM(found.map((f) => f.client)), cfg.maxParallel, onCall), found, missing };
}
