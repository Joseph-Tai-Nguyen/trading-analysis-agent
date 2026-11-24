import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface ProcResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

const isWin = process.platform === "win32";

/** npm-installed CLIs on Windows are .cmd shims, which Node can only start through a shell. */
export const needsShell = (bin: string) => isWin && /\.(cmd|bat)$/i.test(bin);

/** Find a CLI on PATH (or accept an explicit path). Returns null when it isn't installed. */
export function resolveCommand(name: string, override?: string): Promise<string | null> {
  if (override) return Promise.resolve(existsSync(override) ? override : null);
  return new Promise((resolve) => {
    execFile(isWin ? "where" : "which", [name], { windowsHide: true }, (err, stdout) => {
      if (err) return resolve(null);
      const hits = stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      // On Windows prefer a real executable, then a .cmd shim; skip extension-less sh scripts.
      const pick = isWin ? (hits.find((h) => /\.exe$/i.test(h)) ?? hits.find((h) => /\.(cmd|bat)$/i.test(h))) : hits[0];
      resolve(pick ?? null);
    });
  });
}

function killTree(pid: number | undefined) {
  if (!pid) return;
  if (isWin) spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
  else {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* already gone */
    }
  }
}

/**
 * Run a CLI and collect its output. Prompts go through stdin or a single argv
 * entry — never through a shell string — so headlines in the fact sheet can't
 * inject shell commands. Shell mode (Windows .cmd shims) only ever receives
 * fixed flags and validated model names.
 */
export function runProcess(bin: string, args: string[], opts: { cwd: string; timeoutMs: number; input?: string }): Promise<ProcResult> {
  return new Promise((resolve, reject) => {
    const shell = needsShell(bin);
    const child = spawn(shell ? `"${bin}"` : bin, args, {
      cwd: opts.cwd,
      shell,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child.pid);
    }, opts.timeoutMs);
    child.stdout.setEncoding("utf8").on("data", (d: string) => (stdout += d));
    child.stderr.setEncoding("utf8").on("data", (d: string) => (stderr += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });
    child.stdin.on("error", () => {
      /* the CLI may exit before reading stdin */
    });
    child.stdin.end(opts.input ?? "");
  });
}

/** A fresh, empty working directory per call, so the CLI agent sees no project files. */
export async function withWorkdir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "taa-runner-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
