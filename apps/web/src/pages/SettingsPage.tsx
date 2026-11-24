import type { AppStatus } from "@taa/shared";
import { RunnerCard } from "../components/RunnerCard";
import { Card } from "../components/ui";
import { api } from "../lib/api";

const Ok = ({ on, label }: { on: boolean; label: string }) => (
  <li className={on ? "ok" : "off"}>
    <span aria-hidden>{on ? "●" : "○"}</span> {label} <small>{on ? "configured" : "not configured"}</small>
  </li>
);

export function SettingsPage({ status }: { status: AppStatus }) {
  const u = status.user;
  return (
    <div className="page">
      <div className="page-head">
        <h1>Settings</h1>
      </div>

      <Card title="Account">
        {u && (
          <div className="account">
            {u.picture && <img src={u.picture} alt="" width={48} height={48} referrerPolicy="no-referrer" />}
            <div>
              <strong>{u.name}</strong>
              <div className="muted">{u.email}</div>
            </div>
            <button
              className="btn ghost"
              onClick={async () => {
                await api.logout().catch(() => {});
                window.location.href = "/";
              }}
            >
              Sign out
            </button>
          </div>
        )}
      </Card>

      <Card title="Data storage">
        {status.storage === "google-sheets" ? (
          <p>
            Your transactions, watchlists and analyses are stored in a Google Sheet in your Drive.{" "}
            {status.spreadsheetUrl && (
              <a href={status.spreadsheetUrl} target="_blank" rel="noreferrer noopener">
                Open spreadsheet ↗
              </a>
            )}
          </p>
        ) : (
          <p className="warn-text">Dev mode: data is stored in local Cloudflare KV (DEV_AUTH_BYPASS=true). Google Sheets is not used.</p>
        )}
      </Card>

      <RunnerCard />

      <Card title="Integrations">
        <ul className="status-list">
          <Ok on={status.ai.gemini} label={`Gemini API key${status.ai.engine === "runner" ? " — not needed with the local runner" : status.ai.primary === "gemini" ? " (primary)" : " (fallback)"}`} />
          <Ok on={status.ai.claude} label={`Anthropic API key${status.ai.engine === "runner" ? " — not needed with the local runner" : status.ai.primary === "claude" ? " (primary)" : " (fallback)"}`} />
          <Ok on={status.market.finnhub} label="Finnhub — live quotes, fundamentals, news" />
          <Ok on={status.market.twelvedata} label="Twelve Data — price history, quote fallback" />
          <Ok on={status.notifications.telegram} label="Telegram daily report" />
        </ul>
        <p className="fineprint">API keys are set as Cloudflare Worker secrets — see README → Configuration.</p>
      </Card>

      <Card title="Install the app">
        <ul className="plain">
          <li><strong>Windows / macOS (Chrome, Edge):</strong> click the install icon in the address bar.</li>
          <li><strong>macOS Safari:</strong> File → Add to Dock.</li>
          <li><strong>iPhone / iPad:</strong> Share → Add to Home Screen.</li>
          <li><strong>Android:</strong> ⋮ menu → Install app.</li>
        </ul>
      </Card>

      <p className="fineprint">
        v{status.version} · For research and education only. Not financial advice. AI output can be wrong; verify before acting.
      </p>
    </div>
  );
}
