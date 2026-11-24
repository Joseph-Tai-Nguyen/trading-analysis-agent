import { summarizePortfolio, type Transaction, type TransactionType } from "@taa/shared";
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { badRequest, notFound, optionalString, requireNumber, requireSymbol } from "../lib/http";
import type { Row } from "../lib/store";
import { marketData } from "../services/deps";

const TYPES: TransactionType[] = ["BUY", "SELL", "DIVIDEND"];

export const portfolio = new Hono<AppEnv>();

/** GET /api/portfolio — positions derived from transactions + live quotes. */
portfolio.get("/portfolio", async (c) => {
  const txs = (await c.var.store.list("transactions")) as unknown as Transaction[];
  const symbols = [...new Set(txs.map((t) => t.symbol.toUpperCase()))];
  const quotes = symbols.length ? await marketData(c.env).getQuotes(symbols) : {};
  return c.json(summarizePortfolio(txs, quotes));
});

portfolio.get("/transactions", async (c) => {
  const txs = (await c.var.store.list("transactions")) as unknown as Transaction[];
  txs.sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));
  return c.json(txs);
});

portfolio.post("/transactions", async (c) => {
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
  const type = String(b.type ?? "").toUpperCase() as TransactionType;
  if (!TYPES.includes(type)) throw badRequest("type must be BUY, SELL or DIVIDEND");
  const date = String(b.date ?? new Date().toISOString().slice(0, 10));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw badRequest("date must be YYYY-MM-DD");

  const tx: Transaction = {
    id: crypto.randomUUID(),
    date,
    symbol: requireSymbol(b.symbol),
    type,
    quantity: requireNumber(b.quantity ?? 0, "quantity", { min: 0 }),
    price: requireNumber(b.price, "price", { min: 0 }),
    fees: requireNumber(b.fees ?? 0, "fees", { min: 0 }),
    account: optionalString(b.account, 40) || "Default",
    currency: (optionalString(b.currency, 3) || "USD").toUpperCase(),
    notes: optionalString(b.notes, 500),
    created_at: new Date().toISOString(),
  };
  if (type !== "DIVIDEND" && tx.quantity <= 0) throw badRequest("quantity must be > 0");
  await c.var.store.insert("transactions", tx as unknown as Row);
  return c.json(tx, 201);
});

portfolio.delete("/transactions/:id", async (c) => {
  if (!(await c.var.store.remove("transactions", c.req.param("id")))) throw notFound();
  return c.json({ ok: true });
});
