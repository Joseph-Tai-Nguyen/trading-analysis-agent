import type { ReactNode } from "react";
import { pct, signedMoney, tone } from "../lib/format";

export function Change({ value, percent, currency, size }: { value?: number | null; percent?: number | null; currency?: string; size?: "lg" }) {
  const t = tone(percent ?? value);
  return (
    <span className={`change ${t} ${size === "lg" ? "lg" : ""}`}>
      {value != null && signedMoney(value, currency)}
      {value != null && percent != null && " "}
      {percent != null && (value != null ? `(${pct(percent)})` : pct(percent))}
    </span>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className ?? ""}`}>
      {(title || actions) && (
        <header className="card-head">
          {title && <h2>{title}</h2>}
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children && <div>{children}</div>}
    </div>
  );
}

export function ErrorNote({ error }: { error?: Error }) {
  if (!error) return null;
  const detail = (error as { detail?: string }).detail;
  return (
    <div className="error-note" role="alert">
      {error.message}
      {detail && <small>{detail}</small>}
    </div>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="spinner" role="status">
      <span className="spinner-dot" /> {label}
    </div>
  );
}
