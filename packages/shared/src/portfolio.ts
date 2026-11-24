import type { PortfolioSummary, Position, Quote, Transaction } from "./types";

const EPS = 1e-9;

/**
 * Derive open positions from the transaction log (average-cost method).
 * Transactions are the single source of truth; positions are never stored.
 * Positions are keyed by symbol + account.
 */
export function computePositions(transactions: Transaction[]): Position[] {
  const sorted = [...transactions].sort(
    (a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at),
  );
  const map = new Map<string, Position>();

  for (const tx of sorted) {
    const symbol = tx.symbol.toUpperCase();
    const account = tx.account || "Default";
    const key = `${symbol}|${account}`;
    let p = map.get(key);
    if (!p) {
      p = {
        symbol,
        account,
        currency: tx.currency || "USD",
        quantity: 0,
        avgCost: 0,
        costBasis: 0,
        realizedPL: 0,
        dividends: 0,
      };
      map.set(key, p);
    }
    const qty = Math.abs(tx.quantity);
    const fees = tx.fees || 0;

    switch (tx.type) {
      case "BUY": {
        p.costBasis += qty * tx.price + fees;
        p.quantity += qty;
        p.avgCost = p.quantity > EPS ? p.costBasis / p.quantity : 0;
        break;
      }
      case "SELL": {
        const sellQty = Math.min(qty, p.quantity);
        const proceeds = sellQty * tx.price - fees;
        const cost = sellQty * p.avgCost;
        p.realizedPL += proceeds - cost;
        p.quantity -= sellQty;
        p.costBasis -= cost;
        if (p.quantity <= EPS) {
          p.quantity = 0;
          p.costBasis = 0;
          p.avgCost = 0;
        }
        break;
      }
      case "DIVIDEND": {
        // For dividends, `price` holds the total cash amount when quantity is 0,
        // otherwise amount = quantity * price (per-share dividend).
        const amount = qty > 0 ? qty * tx.price : tx.price;
        p.dividends += amount - fees;
        break;
      }
    }
  }
  return [...map.values()];
}

/** Attach live quotes and compute the portfolio summary. */
export function summarizePortfolio(
  transactions: Transaction[],
  quotes: Record<string, Quote | undefined>,
  now = Date.now(),
): PortfolioSummary {
  const all = computePositions(transactions);
  const realizedPL = all.reduce((s, p) => s + p.realizedPL, 0);
  const dividends = all.reduce((s, p) => s + p.dividends, 0);
  const open = all.filter((p) => p.quantity > EPS);

  let marketValue = 0;
  let costBasis = 0;
  let dayChange = 0;

  for (const p of open) {
    const q = quotes[p.symbol];
    const price = q?.price ?? p.avgCost; // fall back to cost if no quote
    p.price = price;
    p.marketValue = price * p.quantity;
    p.unrealizedPL = p.marketValue - p.costBasis;
    p.unrealizedPLPercent = p.costBasis > EPS ? (p.unrealizedPL / p.costBasis) * 100 : 0;
    p.dayChange = (q?.change ?? 0) * p.quantity;
    p.dayChangePercent = q?.changePercent ?? 0;
    marketValue += p.marketValue;
    costBasis += p.costBasis;
    dayChange += p.dayChange;
  }
  for (const p of open) {
    p.weight = marketValue > EPS ? ((p.marketValue ?? 0) / marketValue) * 100 : 0;
  }
  open.sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0));

  const prevValue = marketValue - dayChange;
  return {
    marketValue,
    costBasis,
    unrealizedPL: marketValue - costBasis,
    unrealizedPLPercent: costBasis > EPS ? ((marketValue - costBasis) / costBasis) * 100 : 0,
    realizedPL,
    dividends,
    dayChange,
    dayChangePercent: prevValue > EPS ? (dayChange / prevValue) * 100 : 0,
    positions: open,
    asOf: now,
  };
}
