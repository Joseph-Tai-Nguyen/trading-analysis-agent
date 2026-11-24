import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type EngineName = "antigravity" | "gemini-cli" | "claude-code";
export const ENGINE_NAMES: EngineName[] = ["antigravity", "gemini-cli", "claude-code"];

export interface Models {
  fast?: string;
  deep?: string;
}

export interface RunnerConfig {
  url: string;
  token: string;
  engines: EngineName[];
  models: Record<EngineName, Models>;
  bins: Record<EngineName, string | undefined>;
  pollMs: number;
  timeoutMs: number;
  maxParallel: number;
}

export const CONFIG_FILE = join(dirname(fileURLToPath(import.meta.url)), "..", "runner.env");

/** Minimal KEY=VALUE parser (comments, blank lines, optional quotes). */
export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 1) continue;
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[line.slice(0, i).trim()] = v;
  }
  return out;
}

const MODEL_RE = /^[\w.\-:/]{1,80}$/;

export function loadConfig(env: NodeJS.ProcessEnv = process.env, file = CONFIG_FILE): RunnerConfig {
  const fromFile = existsSync(file) ? parseEnvFile(readFileSync(file, "utf8")) : {};
  const get = (k: string) => (env[k] ?? fromFile[k] ?? "").trim() || undefined;
  const model = (k: string) => {
    const v = get(k);
    if (v && !MODEL_RE.test(v)) throw new Error(`${k} has an invalid model name: ${v}`);
    return v;
  };
  const int = (k: string, def: number, min: number) => Math.max(min, Number(get(k) ?? def) || def);

  const engines = (get("RUNNER_ENGINES") ?? ENGINE_NAMES.join(","))
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is EngineName => (ENGINE_NAMES as string[]).includes(s));

  return {
    url: (get("TAA_URL") ?? "http://localhost:8787").replace(/\/+$/, ""),
    token: get("TAA_RUNNER_TOKEN") ?? "",
    engines: engines.length ? engines : ENGINE_NAMES,
    models: {
      antigravity: { fast: model("AGY_MODEL_FAST"), deep: model("AGY_MODEL_DEEP") },
      "gemini-cli": { fast: model("GEMINI_CLI_MODEL_FAST"), deep: model("GEMINI_CLI_MODEL_DEEP") },
      "claude-code": { fast: model("CLAUDE_CODE_MODEL_FAST"), deep: model("CLAUDE_CODE_MODEL_DEEP") },
    },
    bins: { antigravity: get("AGY_BIN"), "gemini-cli": get("GEMINI_BIN"), "claude-code": get("CLAUDE_BIN") },
    pollMs: int("RUNNER_POLL_SECONDS", 15, 5) * 1000,
    timeoutMs: int("RUNNER_TIMEOUT_SECONDS", 300, 30) * 1000,
    maxParallel: int("RUNNER_MAX_PARALLEL", 3, 1),
  };
}
