const moneyFmt = new Map<string, Intl.NumberFormat>();

export function money(n: number | null | undefined, currency = "USD"): string {
  if (n == null || !Number.isFinite(n)) return "—";
  let f = moneyFmt.get(currency);
  if (!f) {
    try {
      f = new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 });
    } catch {
      f = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" });
    }
    moneyFmt.set(currency, f);
  }
  return f.format(n);
}

export function signedMoney(n: number | null | undefined, currency = "USD"): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${money(Math.abs(n), currency)}`;
}

export function pct(n: number | null | undefined, digits = 2, signed = true): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const s = Math.abs(n).toFixed(digits);
  return `${signed ? (n > 0 ? "+" : n < 0 ? "−" : "") : ""}${s}%`;
}

export function num(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export function compact(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 2 }).format(n);
}

export function tone(n: number | null | undefined): "up" | "down" | "flat" {
  if (n == null || Math.abs(n) < 1e-9) return "flat";
  return n > 0 ? "up" : "down";
}

export function relTime(iso: string | number): string {
  const t = typeof iso === "number" ? iso * 1000 : Date.parse(iso);
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(t).toLocaleDateString();
}
