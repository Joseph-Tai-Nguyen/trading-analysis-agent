import { describe, expect, it } from "vitest";
import { createLLM, FallbackLLM } from "./llm/router";
import { extractJson, normalizeReport } from "./json";
import { runDeepAnalysis, runQuickAnalysis } from "./pipeline";
import type { LLMClient, LLMRequest } from "./llm/types";
import type { AnalysisContext } from "./context";

const ctx: AnalysisContext = {
  symbol: "TEST",
  asOf: "2026-11-24",
  quote: { symbol: "TEST", price: 100, change: 1, changePercent: 1, open: 99, high: 101, low: 98, prevClose: 99, timestamp: 0, source: "mock" },
  technicals: null,
  profile: null,
  metrics: null,
  news: [],
  position: null,
};

const REPORT = JSON.stringify({
  decision: "buy",
  confidence: 72,
  oneLiner: "Constructive trend, buy pullbacks.",
  entryPrice: 97,
  targetPrice: 115,
  stopLoss: 92,
  keyReasons: ["a", "b"],
  risks: ["c"],
  checklist: [{ item: "Trend", status: "PASS" }],
});

class MockLLM implements LLMClient {
  readonly name = "mock";
  calls: LLMRequest[] = [];
  async generate(req: LLMRequest) {
    this.calls.push(req);
    return { text: req.json ? "```json\n" + REPORT + "\n```" : "note", provider: "mock", model: "m" };
  }
}

describe("json helpers", () => {
  it("extracts fenced JSON and normalizes fields", () => {
    const r = normalizeReport(extractJson(`Sure!\n\`\`\`json\n${REPORT}\n\`\`\``), {
      symbol: "TEST", mode: "quick", provider: "p", model: "m", price: 100,
    });
    expect(r.decision).toBe("BUY");
    expect(r.checklist[0]!.status).toBe("pass");
    expect(r.stopLoss).toBe(92);
  });

  it("defaults invalid decisions to HOLD and clamps confidence", () => {
    const r = normalizeReport({ decision: "moon", confidence: 500 }, { symbol: "X", mode: "quick", provider: "p", model: "m", price: null });
    expect(r.decision).toBe("HOLD");
    expect(r.confidence).toBe(100);
  });
});

describe("pipeline", () => {
  it("quick mode makes one JSON call", async () => {
    const llm = new MockLLM();
    const r = await runQuickAnalysis(ctx, llm);
    expect(llm.calls).toHaveLength(1);
    expect(r.decision).toBe("BUY");
  });

  it("deep mode runs the full agent team", async () => {
    const llm = new MockLLM();
    const r = await runDeepAnalysis(ctx, llm);
    expect(llm.calls).toHaveLength(8); // 3 analysts + bull + bear + trader + risk + PM
    expect(r.agentNotes.map((n) => n.role)).toContain("Risk Manager");
  });

  it("falls back to the next provider on failure", async () => {
    const failing: LLMClient = { name: "bad", generate: async () => { throw new Error("429"); } };
    const llm = new FallbackLLM([failing, new MockLLM()]);
    const r = await runQuickAnalysis(ctx, llm);
    expect(r.provider).toBe("mock");
  });

  it("createLLM orders providers by primary", () => {
    expect(createLLM({ geminiApiKey: "g", anthropicApiKey: "a" }).name).toBe("gemini→claude");
    expect(createLLM({ primary: "claude", geminiApiKey: "g", anthropicApiKey: "a" }).name).toBe("claude→gemini");
    expect(() => createLLM({})).toThrow();
  });
});
