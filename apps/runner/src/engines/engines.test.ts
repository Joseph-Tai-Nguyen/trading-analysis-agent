import type { LLMClient, LLMRequest } from "@taa/agents";
import { describe, expect, it } from "vitest";
import { loadConfig, parseEnvFile } from "../config";
import { parseAntigravity, parseClaudeCode, parseGeminiCli } from "./engines";
import { LimitedLLM } from "./index";
import { composePrompt, parseCliJson } from "./prompt";
import type { ProcResult } from "./process";

const proc = (stdout: string, extra: Partial<ProcResult> = {}): ProcResult => ({ code: 0, stdout, stderr: "", timedOut: false, ...extra });

describe("CLI output parsing", () => {
  it("reads Antigravity's JSON result, even after log lines", () => {
    const out = `some log line\n{"conversation_id":"x","status":"SUCCESS","response":"{\\"ok\\":true}\\n","num_turns":1}`;
    expect(parseAntigravity(proc(out))).toBe('{"ok":true}\n');
  });

  it("reports blocked tool use from Antigravity", () => {
    const out = `{"status":"SUCCESS","response":"","denied_actions":[{"action":"command"}]}`;
    expect(() => parseAntigravity(proc(out))).toThrow(/tried to use a tool/);
  });

  it("reads Gemini CLI JSON and surfaces its errors", () => {
    expect(parseGeminiCli(proc(`{"response":"hello","stats":{}}`))).toBe("hello");
    expect(() => parseGeminiCli(proc(`{"error":{"message":"Quota exceeded"}}`, { code: 1 }))).toThrow(/Quota exceeded/);
  });

  it("reads Claude Code JSON and treats is_error as a failure", () => {
    expect(parseClaudeCode(proc(`{"type":"result","is_error":false,"result":"hi"}`))).toBe("hi");
    expect(() => parseClaudeCode(proc(`{"type":"result","is_error":true,"result":"Failed to authenticate"}`))).toThrow(/authenticate/);
  });

  it("flags timeouts", () => {
    expect(() => parseClaudeCode(proc("", { timedOut: true, code: null }))).toThrow(/timed out/);
  });

  it("parseCliJson returns null for non-JSON", () => {
    expect(parseCliJson("nothing here")).toBeNull();
  });
});

describe("prompt composition", () => {
  it("adds the guard, the role and the JSON instruction", () => {
    const text = composePrompt({ system: "ROLE", prompt: "FACTS", json: true }, { includeSystem: true });
    expect(text).toMatch(/Do NOT use tools/);
    expect(text.indexOf("ROLE")).toBeLessThan(text.indexOf("FACTS"));
    expect(text).toMatch(/single JSON object/);
  });
});

describe("config", () => {
  it("parses KEY=VALUE files with comments and quotes", () => {
    expect(parseEnvFile(`# c\nA=1\nB="two words"\n\nC='x'\nbad line`)).toEqual({ A: "1", B: "two words", C: "x" });
  });

  it("environment variables win, unknown engines are dropped, bad model names rejected", () => {
    const cfg = loadConfig({ TAA_URL: "http://x/", RUNNER_ENGINES: "claude-code,nope", TAA_RUNNER_TOKEN: "t" }, "/no/such/file");
    expect(cfg.url).toBe("http://x");
    expect(cfg.engines).toEqual(["claude-code"]);
    expect(() => loadConfig({ AGY_MODEL_FAST: "bad model; rm -rf" }, "/no/such/file")).toThrow(/invalid model/);
  });
});

describe("LimitedLLM", () => {
  it("never runs more than max calls at once", async () => {
    let active = 0;
    let peak = 0;
    const slow: LLMClient = {
      name: "slow",
      generate: async (_req: LLMRequest) => {
        peak = Math.max(peak, ++active);
        await new Promise((r) => setTimeout(r, 10));
        active--;
        return { text: "x", provider: "slow", model: "m" };
      },
    };
    const llm = new LimitedLLM(slow, 2);
    await Promise.all(Array.from({ length: 6 }, () => llm.generate({ system: "", prompt: "" })));
    expect(peak).toBe(2);
  });
});
