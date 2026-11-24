# Data model (Google Sheets)

Each user gets one spreadsheet, **"Trading Analysis Agent — Database"**, in their Drive. Each table is a tab. Row 1 holds the headers, and columns are matched **by header name**.

The source of truth is [`packages/shared/src/schema.ts`](../packages/shared/src/schema.ts).

## Tabs

### `transactions` (source of truth for holdings)
| column | type | notes |
|---|---|---|
| id | string | UUID |
| date | string | `YYYY-MM-DD` trade date |
| symbol | string | Upper-case ticker, e.g. `AAPL`, `SHOP.TO` |
| type | string | `BUY` · `SELL` · `DIVIDEND` |
| quantity | number | Shares. For DIVIDEND, 0 means `price` is the total cash amount |
| price | number | Price per share, or the dividend amount |
| fees | number | Commission and fees |
| account | string | Free text: `TFSA`, `RRSP`, `Margin`… |
| currency | string | ISO code, default `USD` |
| notes | string | |
| created_at | string | ISO timestamp; tie-breaker for same-day ordering |

Positions are **computed** (`computePositions`), never stored:

- Average-cost method per `symbol + account`.
- Buy fees are added to cost basis; sell fees reduce proceeds.

### `watchlists`
| column | type | notes |
|---|---|---|
| id | string | UUID |
| list | string | List name, e.g. `Watchlist`, `Tech` |
| symbol | string | |
| notes | string | |
| added_at | string | ISO timestamp |

### `analyses`
| column | type | notes |
|---|---|---|
| id | string | UUID |
| created_at | string | ISO timestamp |
| symbol | string | |
| mode | string | `quick` · `deep` |
| provider / model | string | Which LLM actually answered (after fallback) |
| decision | string | `STRONG_BUY` · `BUY` · `HOLD` · `REDUCE` · `SELL` |
| confidence | number | 0–100 |
| price | number | Quote at the time of the analysis |
| target_price / stop_loss | number | |
| summary | string | The one-liner |
| report_json | string | Full `AnalysisReport` JSON, truncated to fit the 50k-char cell limit |

### `settings`
| column | type | notes |
|---|---|---|
| id | string | |
| key / value | string | Reserved for user preferences (base currency, sweep list, and so on) |

## Migrations

Migrations are **additive only**:

1. Add a column or table in `schema.ts`.
2. Bump `SCHEMA_VERSION`.
3. On the next request, `SheetsApi.ensureSchema()` creates missing tabs and appends missing header cells. It then records the new `schemaVersion` on the user's KV record.

Renaming or removing columns needs a written migration plan here first. Existing sheets keep old columns, which are ignored once they are unused.

## Editing the sheet by hand

You can edit the sheet directly, for example to bulk-paste historical transactions:

- Keep the header row unchanged.
- Give every row a unique `id`; any string works, such as `=ROW()` pasted as values.
- Use `YYYY-MM-DD` dates.
- Keep numeric cells as numbers.
