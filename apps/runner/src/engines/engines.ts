import { LLMError, type LLMClient, type LLMRequest, type LLMResponse } from "@taa/agents";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { EngineName, Models } from "../config";
import { firstLine, composePrompt, GUARD, JSON_ONLY, parseCliJson } from "./prompt";
import { needsShell, runProcess, withWorkdir, type ProcResult } from "./process";

/** Windows caps a command line at 32,767 chars; longer prompts go through a file. */
const MAX_ARG_PROMPT = 24_000;

const pickModel = (m: Models, req: LLMRequest) => (req.tier === "deep" ? m.deep : m.fast);

function failure(engine: string, r: ProcResult, detail?: string): LLMError {
  if (r.timedOut) return new LLMError(engine, "timed out", 504);
  const msg = detail || firstLine(r.stderr) || firstLine(r.stdout) || `exit code ${r.code}`;
  const status = /quota|rate|429|exhausted/i.test(msg) ? 429 : /auth|log ?in|sign ?in|credential/i.test(msg) ? 401 : 502;
  return new LLMError(engine, msg, status);
}

/* ----------------------------- Antigravity CLI ----------------------------- */

/** Parse `agy --output-format json`: {"status":"SUCCESS","response":"…",…}. */
export function parseAntigravity(r: ProcResult): string {
  const out = parseCliJson(r.stdout);
  const response = typeof out?.response === "string" ? out.response : "";
  if (out?.status === "SUCCESS" && response.trim()) return response;
  const denied = Array.isArray(out?.denied_actions) && out.denied_actions.length ? "the model tried to use a tool, which the runner blocks" : "";
  throw failure("antigravity", r, denied || (out?.status ? `status ${String(out.status)}` : undefined));
}

/**
 * Antigravity CLI (`agy`), signed in with your Google account. Uses your Google
 * AI plan quota. Runs in plan mode + sandbox in an empty temp folder, so the
 * agent can't change anything.
 */
export class AntigravityEngine implements LLMClient {
  readonly name = "antigravity";
  constructor(
    private readonly bin: string,
    private readonly models: Models,
    private readonly timeoutMs: number,
  ) {}

  generate(req: LLMRequest): Promise<LLMResponse> {
    const model = pickModel(this.models, req);
    const text = composePrompt(req, { includeSystem: true });
    return withWorkdir(async (dir) => {
      let prompt = text;
      if (text.length > MAX_ARG_PROMPT) {
        await writeFile(join(dir, "task.md"), text, "utf8");
        prompt = `${GUARD}\nRead the file task.md in the current working directory and do exactly what it asks. Reply with the answer only.`;
      }
      const args = [
        ...(model ? ["--model", model] : []),
        "--output-format", "json",
        "--mode", "plan",
        "--sandbox",
        "--print-timeout", `${Math.round(this.timeoutMs / 1000)}s`,
        "-p", prompt,
      ];
      const r = await runProcess(this.bin, args, { cwd: dir, timeoutMs: this.timeoutMs + 15_000 });
      return { text: parseAntigravity(r), provider: this.name, model: model ?? "default" };
    });
  }
}

/* ------------------------------- Gemini CLI -------------------------------- */

/** Parse `gemini --output-format json`: {"response":"…","stats":{…}} or {"error":{…}}. */
export function parseGeminiCli(r: ProcResult): string {
  const out = parseCliJson(r.stdout);
  const response = typeof out?.response === "string" ? out.response : "";
  if (response.trim() && !out?.error) return response;
  const err = out?.error as { message?: string } | undefined;
  throw failure("gemini-cli", r, err?.message);
}

/**
 * Gemini CLI (`gemini`), signed in with "Login with Google". Google AI Pro/Ultra
 * subscribers get higher daily limits. The prompt goes in on stdin; in headless
 * mode tools that need approval are refused.
 */
export class GeminiCliEngine implements LLMClient {
  readonly name = "gemini-cli";
  constructor(
    private readonly bin: string,
    private readonly models: Models,
    private readonly timeoutMs: number,
  ) {}

  generate(req: LLMRequest): Promise<LLMResponse> {
    const model = pickModel(this.models, req);
    return withWorkdir(async (dir) => {
      const args = [...(model ? ["-m", model] : []), "--output-format", "json"];
      const r = await runProcess(this.bin, args, {
        cwd: dir,
        timeoutMs: this.timeoutMs,
        input: composePrompt(req, { includeSystem: true }),
      });
      return { text: parseGeminiCli(r), provider: this.name, model: model ?? "default" };
    });
  }
}

/* ------------------------------- Claude Code ------------------------------- */

/** Parse `claude -p --output-format json`: {"type":"result","is_error":false,"result":"…"}. */
export function parseClaudeCode(r: ProcResult): string {
  const out = parseCliJson(r.stdout);
  const result = typeof out?.result === "string" ? out.result : "";
  if (out && out.is_error !== true && result.trim()) return result;
  throw failure("claude-code", r, out?.is_error ? result : undefined);
}

const CLAUDE_BLOCKED_TOOLS = "Bash Edit Write Read Glob Grep WebFetch WebSearch NotebookEdit Agent Task";

/**
 * Claude Code (`claude -p`), signed in with your Claude subscription. All tools
 * are disallowed, MCP servers are skipped and nothing is saved to session history.
 */
export class ClaudeCodeEngine implements LLMClient {
  readonly name = "claude-code";
  constructor(
    private readonly bin: string,
    private readonly models: Models,
    private readonly timeoutMs: number,
  ) {}

  generate(req: LLMRequest): Promise<LLMResponse> {
    const model = pickModel(this.models, req);
    // A .cmd shim runs through a shell, which can't safely take a long free-text
    // argument, so the system prompt then travels on stdin with the input.
    const viaArg = !needsShell(this.bin);
    return withWorkdir(async (dir) => {
      const args = [
        "-p",
        "--output-format", "json",
        ...(model ? ["--model", model] : []),
        ...(viaArg ? ["--system-prompt", `${GUARD}\n\n${req.system}`] : []),
        "--disallowedTools", CLAUDE_BLOCKED_TOOLS,
        "--strict-mcp-config",
        "--no-session-persistence",
      ];
      const input = viaArg ? `${req.prompt}${req.json ? `\n\n${JSON_ONLY}` : ""}` : composePrompt(req, { includeSystem: true });
      const r = await runProcess(this.bin, args, { cwd: dir, timeoutMs: this.timeoutMs, input });
      return { text: parseClaudeCode(r), provider: this.name, model: model ?? "default" };
    });
  }
}

export const ENGINE_BIN: Record<EngineName, string> = {
  antigravity: "agy",
  "gemini-cli": "gemini",
  "claude-code": "claude",
};

export function createEngine(name: EngineName, bin: string, models: Models, timeoutMs: number): LLMClient {
  switch (name) {
    case "antigravity":
      return new AntigravityEngine(bin, models, timeoutMs);
    case "gemini-cli":
      return new GeminiCliEngine(bin, models, timeoutMs);
    case "claude-code":
      return new ClaudeCodeEngine(bin, models, timeoutMs);
  }
}
