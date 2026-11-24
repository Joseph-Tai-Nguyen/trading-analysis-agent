import type { AnalysisContext } from "@taa/agents";
import type { AnalysisMode, AnalysisReport, RunnerJob } from "@taa/shared";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Client for the Worker's /api/runner/* endpoints (bearer token, JSON). */
export class RunnerApi {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {
    if (!token) throw new Error("TAA_RUNNER_TOKEN is not set — create one in the app under Settings → Local AI runner");
  }

  private async call<T>(path: string, body: unknown = {}): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/api/runner${path}`, {
        method: "POST",
        headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      });
    } catch (e) {
      throw new ApiError(0, `cannot reach ${this.baseUrl} (${e instanceof Error ? e.message : String(e)})`);
    }
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new ApiError(res.status, data.error ?? res.statusText);
    return data as T;
  }

  hello(engines: string[]) {
    return this.call<{ user: string; storage: string; workerEngine: string; queued: number }>("/hello", { engines });
  }

  claim(engines: string[]) {
    return this.call<{ job: RunnerJob | null; context?: AnalysisContext; skipped?: { symbol: string; error: string }; retry?: boolean }>(
      "/jobs/claim",
      { engines },
    );
  }

  result(id: string, report: AnalysisReport, engine: string) {
    return this.call<{ ok: true; analysisId: string; decision: string; ruleNotes: string[] }>(`/jobs/${encodeURIComponent(id)}/result`, { report, engine });
  }

  fail(id: string, error: string) {
    return this.call<{ ok: true }>(`/jobs/${encodeURIComponent(id)}/fail`, { error: error.slice(0, 500) });
  }

  enqueue(symbol: string, mode: AnalysisMode) {
    return this.call<{ job: RunnerJob }>("/enqueue", { symbol, mode });
  }

  sweep(mode: AnalysisMode) {
    return this.call<{ queued: number; jobs: RunnerJob[] }>("/sweep", { mode });
  }
}
