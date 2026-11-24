import type { TransactionType } from "@taa/shared";
import { useState, type FormEvent } from "react";
import { api } from "../lib/api";

export function TransactionForm({ defaultSymbol = "", onDone, onCancel }: { defaultSymbol?: string; onDone: () => void; onCancel?: () => void }) {
  const [form, setForm] = useState({
    type: "BUY" as TransactionType,
    symbol: defaultSymbol,
    date: new Date().toISOString().slice(0, 10),
    quantity: "",
    price: "",
    fees: "0",
    account: "Default",
    currency: "USD",
    notes: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await api.addTransaction({
        type: form.type,
        symbol: form.symbol.trim().toUpperCase(),
        date: form.date,
        quantity: Number(form.quantity || 0),
        price: Number(form.price),
        fees: Number(form.fees || 0),
        account: form.account,
        currency: form.currency.toUpperCase(),
        notes: form.notes,
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const isDiv = form.type === "DIVIDEND";
  return (
    <form className="form-grid" onSubmit={submit}>
      <div className="seg full" role="radiogroup" aria-label="Type">
        {(["BUY", "SELL", "DIVIDEND"] as const).map((t) => (
          <button type="button" key={t} className={form.type === t ? "active" : ""} aria-pressed={form.type === t} onClick={() => setForm((f) => ({ ...f, type: t }))}>
            {t[0] + t.slice(1).toLowerCase()}
          </button>
        ))}
      </div>
      <label>
        Symbol
        <input required value={form.symbol} onChange={set("symbol")} placeholder="AAPL" autoCapitalize="characters" />
      </label>
      <label>
        Date
        <input type="date" required value={form.date} onChange={set("date")} />
      </label>
      <label>
        {isDiv ? "Shares (optional)" : "Quantity"}
        <input type="number" inputMode="decimal" step="any" min="0" required={!isDiv} value={form.quantity} onChange={set("quantity")} />
      </label>
      <label>
        {isDiv ? "Amount (total, or per share)" : "Price per share"}
        <input type="number" inputMode="decimal" step="any" min="0" required value={form.price} onChange={set("price")} />
      </label>
      <label>
        Fees
        <input type="number" inputMode="decimal" step="any" min="0" value={form.fees} onChange={set("fees")} />
      </label>
      <label>
        Account
        <input value={form.account} onChange={set("account")} placeholder="TFSA, RRSP, Margin…" />
      </label>
      <label>
        Currency
        <input value={form.currency} onChange={set("currency")} maxLength={3} />
      </label>
      <label className="full">
        Notes
        <input value={form.notes} onChange={set("notes")} placeholder="Optional" />
      </label>
      {error && <div className="error-note full">{error}</div>}
      <div className="form-actions full">
        {onCancel && (
          <button type="button" className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button className="btn primary" disabled={busy}>
          {busy ? "Saving…" : "Save transaction"}
        </button>
      </div>
    </form>
  );
}
