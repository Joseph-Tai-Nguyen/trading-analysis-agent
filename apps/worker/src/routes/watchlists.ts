import type { WatchItem } from "@taa/shared";
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { badRequest, notFound, optionalString, requireSymbol } from "../lib/http";
import type { Row } from "../lib/store";

export const watchlists = new Hono<AppEnv>();

/** GET /api/watchlists — all items (UI groups them by `list`). */
watchlists.get("/", async (c) => {
  const items = (await c.var.store.list("watchlists")) as unknown as WatchItem[];
  items.sort((a, b) => a.list.localeCompare(b.list) || a.added_at.localeCompare(b.added_at));
  return c.json(items);
});

watchlists.post("/", async (c) => {
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
  const list = optionalString(b.list, 40) || "Watchlist";
  const symbol = requireSymbol(b.symbol);
  const items = (await c.var.store.list("watchlists")) as unknown as WatchItem[];
  if (items.some((i) => i.list === list && i.symbol === symbol)) throw badRequest(`${symbol} is already in ${list}`);
  const item: WatchItem = {
    id: crypto.randomUUID(),
    list,
    symbol,
    notes: optionalString(b.notes, 500),
    added_at: new Date().toISOString(),
  };
  await c.var.store.insert("watchlists", item as unknown as Row);
  return c.json(item, 201);
});

watchlists.patch("/:id", async (c) => {
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
  const updated = await c.var.store.update("watchlists", c.req.param("id"), { notes: optionalString(b.notes, 500) });
  if (!updated) throw notFound();
  return c.json(updated);
});

watchlists.delete("/:id", async (c) => {
  if (!(await c.var.store.remove("watchlists", c.req.param("id")))) throw notFound();
  return c.json({ ok: true });
});
