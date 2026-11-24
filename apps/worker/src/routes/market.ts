import { technicalSnapshot } from "@taa/market-data";
import type { CandleRange } from "@taa/shared";
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { badRequest, requireSymbol } from "../lib/http";
import { marketData } from "../services/deps";

const RANGES: CandleRange[] = ["1m", "3m", "6m", "1y", "2y", "5y"];

export const market = new Hono<AppEnv>();

/** GET /api/market/quotes?symbols=AAPL,MSFT */
market.get("/quotes", async (c) => {
  const symbols = (c.req.query("symbols") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!symbols.length) throw badRequest("symbols is required");
  if (symbols.length > 50) throw badRequest("max 50 symbols");
  return c.json(await marketData(c.env).getQuotes(symbols.map(requireSymbol)));
});

/** GET /api/market/candles/:symbol?range=1y */
market.get("/candles/:symbol", async (c) => {
  const range = (c.req.query("range") ?? "1y") as CandleRange;
  if (!RANGES.includes(range)) throw badRequest(`range must be one of ${RANGES.join(", ")}`);
  const candles = await marketData(c.env).getCandles(requireSymbol(c.req.param("symbol")), "5y" === range ? "5y" : "2y");
  // Fetch a long window once (cached) and slice, so indicators stay stable.
  const days = { "1m": 22, "3m": 64, "6m": 127, "1y": 253, "2y": 505, "5y": 1260 }[range];
  return c.json(candles.slice(-days));
});

/** GET /api/market/search?q=apple */
market.get("/search", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  if (q.length < 1 || q.length > 40) throw badRequest("q must be 1-40 chars");
  return c.json(await marketData(c.env).search(q));
});

/** GET /api/market/overview/:symbol — quote + profile + metrics + technicals + news in one call. */
market.get("/overview/:symbol", async (c) => {
  const symbol = requireSymbol(c.req.param("symbol"));
  const md = marketData(c.env);
  const safe = <T>(p: Promise<T>) => p.catch(() => null);
  const [quote, profile, metrics, candles, news] = await Promise.all([
    safe(md.getQuote(symbol)),
    safe(md.getProfile(symbol)),
    safe(md.getMetrics(symbol)),
    safe(md.getCandles(symbol, "2y")),
    safe(md.getNews(symbol, 7)),
  ]);
  return c.json({
    symbol,
    quote,
    profile,
    metrics,
    technicals: candles?.length ? technicalSnapshot(candles) : null,
    news: news ?? [],
  });
});
