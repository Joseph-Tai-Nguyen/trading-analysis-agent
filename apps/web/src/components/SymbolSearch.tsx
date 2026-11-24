import type { SymbolMatch } from "@taa/shared";
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

/** Debounced symbol search with keyboard support. Enter on raw text picks it as-is. */
export function SymbolSearch({ onPick, placeholder = "Symbol (e.g. AAPL)", autoFocus }: { onPick: (symbol: string) => void; placeholder?: string; autoFocus?: boolean }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SymbolMatch[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const timer = useRef<number>(undefined);

  useEffect(() => {
    window.clearTimeout(timer.current);
    const term = q.trim();
    if (term.length < 1) {
      setResults([]);
      return;
    }
    timer.current = window.setTimeout(() => {
      api.search(term).then((r) => {
        setResults(r.slice(0, 8));
        setActive(0);
      }).catch(() => setResults([]));
    }, 250);
    return () => window.clearTimeout(timer.current);
  }, [q]);

  const pick = (s: string) => {
    onPick(s.toUpperCase());
    setQ("");
    setResults([]);
    setOpen(false);
  };

  return (
    <div className="search">
      <input
        type="search"
        value={q}
        placeholder={placeholder}
        autoFocus={autoFocus}
        aria-label="Search symbol"
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, results.length - 1));
          else if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
          else if (e.key === "Enter") {
            e.preventDefault();
            const r = results[active];
            if (open && r) pick(r.symbol);
            else if (q.trim()) pick(q.trim());
          } else if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && results.length > 0 && (
        <ul className="search-results" role="listbox">
          {results.map((r, i) => (
            <li
              key={`${r.symbol}-${r.exchange ?? i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? "active" : ""}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(r.symbol);
              }}
            >
              <strong>{r.symbol}</strong>
              <span>{r.description}</span>
              {r.exchange && <small>{r.exchange}</small>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
