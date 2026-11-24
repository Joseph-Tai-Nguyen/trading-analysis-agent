import { useState } from "react";
import { useAsync, usePolling } from "../hooks/useAsync";
import { api } from "../lib/api";
import { relTime } from "../lib/format";
import { Card, ErrorNote, Spinner } from "./ui";

const ENGINE_LABEL: Record<string, string> = {
  antigravity: "Antigravity CLI",
  "gemini-cli": "Gemini CLI",
  "claude-code": "Claude Code",
};

/** Settings → Local AI runner: status, one-time token and setup steps. */
export function RunnerCard() {
  const info = useAsync(() => api.runner(), []);
  const [token, setToken] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error>();
  const [copied, setCopied] = useState(false);
  usePolling(() => void info.reload(), 30_000, !!info.data);

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(undefined);
    try {
      await fn();
      await info.reload();
    } catch (e) {
      setError(e as Error);
    } finally {
      setBusy(false);
    }
  };

  const d = info.data;
  const online = d?.lastSeen ? Date.now() - Date.parse(d.lastSeen) < 30 * 60_000 : false;

  return (
    <Card title="Local AI runner">
      <p>
        {d?.engine === "runner" ? (
          <>
            <strong>AI engine: local runner.</strong> Analyses are queued here and answered on your PC by Antigravity CLI, Gemini CLI or Claude Code,
            using your subscriptions (no API keys).
          </>
        ) : (
          <>
            <strong>AI engine: cloud API keys.</strong> The Worker calls Gemini/Claude itself. Set <code>AI_ENGINE=runner</code> to use the local runner instead.
          </>
        )}
      </p>
      {!d && info.loading && <Spinner />}
      <ErrorNote error={info.error ?? error} />
      {d && (
        <ul className="status-list">
          <li className={online ? "ok" : "off"}>
            <span aria-hidden>{online ? "●" : "○"}</span> Runner{" "}
            <small>
              {d.lastSeen ? `last seen ${relTime(d.lastSeen)}` : d.hasToken ? "token created, not connected yet" : "not set up"}
              {d.engines.length > 0 && ` · ${d.engines.map((e) => ENGINE_LABEL[e] ?? e).join(" → ")}`}
            </small>
          </li>
          <li className={d.queued + d.running ? "ok" : "off"}>
            <span aria-hidden>{d.queued + d.running ? "●" : "○"}</span> Queue <small>{d.queued} waiting · {d.running} running</small>
          </li>
        </ul>
      )}

      {token ? (
        <>
          <p className="warn-text small">Copy this token now — it is shown only once. Anyone with it can run analyses as you (it cannot read your portfolio).</p>
          <div className="token-box">
            <code>{token}</code>
            <button
              className="btn ghost"
              onClick={async () => {
                await navigator.clipboard.writeText(token).catch(() => undefined);
                setCopied(true);
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <ol className="plain small">
            <li>
              Copy <code>apps/runner/runner.env.example</code> to <code>apps/runner/runner.env</code>, then set:
              <pre className="cmd">{`TAA_URL=${window.location.origin}\nTAA_RUNNER_TOKEN=${token}`}</pre>
            </li>
            <li>
              Check the CLIs are signed in: <pre className="cmd">npm run runner -- doctor --test</pre>
            </li>
            <li>
              Keep it running while you use the app: <pre className="cmd">npm run runner -- watch</pre>
              Or in Antigravity, run the <code>/runner</code> workflow.
            </li>
          </ol>
          <button className="btn ghost" onClick={() => setToken(undefined)}>Done</button>
        </>
      ) : (
        <div className="hero-actions">
          <button className="btn primary" disabled={busy} onClick={() => act(async () => setToken((await api.createRunnerToken()).token))}>
            {d?.hasToken ? "Create a new token" : "Create runner token"}
          </button>
          {d?.hasToken && (
            <button
              className="btn ghost"
              disabled={busy}
              onClick={() => {
                if (window.confirm("Revoke the runner token? The runner on your PC will stop working until you create a new one.")) {
                  void act(async () => void (await api.revokeRunnerToken()));
                }
              }}
            >
              Revoke
            </button>
          )}
        </div>
      )}
      {d?.hasToken && !token && <p className="fineprint">Creating a new token replaces the old one{d.tokenCreatedAt ? ` (created ${relTime(d.tokenCreatedAt)})` : ""}.</p>}
    </Card>
  );
}
