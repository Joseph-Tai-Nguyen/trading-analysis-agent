import { describe, expect, it, vi } from "vitest";
import type { Env } from "../env";
import {
  aiEngine,
  claimNextJob,
  createRunnerToken,
  enqueueJobs,
  getJob,
  resolveRunnerToken,
  revokeRunnerToken,
  STALE_RUNNING_MS,
} from "./runner";

/** In-memory stand-in for the KV binding (only what runner.ts uses). */
function memoryKV() {
  const m = new Map<string, string>();
  return {
    get: async (k: string, type?: string) => {
      const v = m.get(k);
      return v == null ? null : type === "json" ? JSON.parse(v) : v;
    },
    put: async (k: string, v: string) => void m.set(k, v),
    delete: async (k: string) => void m.delete(k),
    size: () => m.size,
  };
}

const envWith = (over: Partial<Env> = {}) => ({ KV: memoryKV(), ...over }) as unknown as Env;

describe("runner tokens", () => {
  it("creates, resolves, rotates and revokes", async () => {
    const env = envWith();
    const t1 = await createRunnerToken(env, "u1");
    expect(t1).toMatch(/^taa_rt_/);
    expect(await resolveRunnerToken(env, t1)).toBe("u1");

    const t2 = await createRunnerToken(env, "u1");
    expect(await resolveRunnerToken(env, t1)).toBeNull(); // rotated out
    expect(await resolveRunnerToken(env, t2)).toBe("u1");

    await revokeRunnerToken(env, "u1");
    expect(await resolveRunnerToken(env, t2)).toBeNull();
  });

  it("rejects tokens without the prefix", async () => {
    expect(await resolveRunnerToken(envWith(), "something-else")).toBeNull();
  });
});

describe("runner queue", () => {
  it("dedupes queued work and claims UI jobs before sweep jobs", async () => {
    const env = envWith();
    await enqueueJobs(env, "u", [{ symbol: "AAA", mode: "quick" }, { symbol: "BBB", mode: "quick" }], { source: "sweep", batchId: "b" });
    const [ui] = await enqueueJobs(env, "u", [{ symbol: "CCC", mode: "deep" }], { source: "ui" });
    const [dup] = await enqueueJobs(env, "u", [{ symbol: "AAA", mode: "quick" }], { source: "ui" });
    expect(dup!.source).toBe("sweep"); // reused, not duplicated

    const first = await claimNextJob(env, "u", "antigravity");
    expect(first!.id).toBe(ui!.id);
    expect(first!.status).toBe("running");
    expect((await claimNextJob(env, "u", "antigravity"))!.symbol).toBe("AAA");
  });

  it("fails jobs that have been running too long", async () => {
    const env = envWith();
    const [job] = await enqueueJobs(env, "u", [{ symbol: "AAA", mode: "quick" }], { source: "ui" });
    await claimNextJob(env, "u", "agy");
    vi.useFakeTimers({ now: Date.now() + STALE_RUNNING_MS + 1000 });
    try {
      const j = await getJob(env, "u", job!.id);
      expect(j!.status).toBe("failed");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("aiEngine", () => {
  it("is runner without AI keys, api with one, and AI_ENGINE overrides", () => {
    expect(aiEngine(envWith())).toBe("runner");
    expect(aiEngine(envWith({ GEMINI_API_KEY: "k" }))).toBe("api");
    expect(aiEngine(envWith({ GEMINI_API_KEY: "k", AI_ENGINE: "runner" }))).toBe("runner");
  });
});
