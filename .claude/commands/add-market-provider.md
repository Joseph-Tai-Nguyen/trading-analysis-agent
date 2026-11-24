---
description: Scaffold a new market data provider (e.g. polygon, tiingo, alphavantage)
argument-hint: <provider-name>
---

Add a new market data provider named **$ARGUMENTS**.

1. Read `packages/market-data/src/types.ts` (the `MarketDataProvider` interface) and `providers/finnhub.ts` as the reference implementation.
2. Create `packages/market-data/src/providers/$ARGUMENTS.ts`:
   - Implement only the methods this provider's free or paid plan actually supports.
   - Use `fetch` + REST only, so it works on Workers. Send the API key in a header when the provider supports that.
   - Throw `ProviderError` with the HTTP status on failure, and map responses to the shared types.
3. Export it from `packages/market-data/src/index.ts`. Add an optional key to `MarketDataConfig` and put it in the right chains in `createMarketData()` (`router.ts`).
4. Add the secret to:
   - `apps/worker/src/env.ts`
   - `apps/worker/src/services/deps.ts`
   - `apps/worker/.dev.vars.example`
   - `README.md` (Configuration table)
   - `docs/SETUP.md`
   - `AppStatus.market` and the Settings page, if it should appear there
5. Add a unit test with a mocked `fetch` (`packages/market-data/src/providers/$ARGUMENTS.test.ts`).
6. Run `npm run check`.
