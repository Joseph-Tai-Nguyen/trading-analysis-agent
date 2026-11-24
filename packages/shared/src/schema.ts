// Google Sheets "database" schema. One spreadsheet per user, one tab per table.
// Row 1 of every tab is the header row; columns are matched BY NAME, so new
// columns can be appended safely. Never rename/reorder existing columns
// without a migration (see docs/DATA_MODEL.md).

export type ColumnType = "string" | "number";

export interface TableSpec {
  /** Tab title in the spreadsheet. */
  tab: string;
  columns: Record<string, ColumnType>;
}

export const SPREADSHEET_TITLE = "Trading Analysis Agent — Database";
export const SCHEMA_VERSION = 1;

export const TABLES = {
  transactions: {
    tab: "transactions",
    columns: {
      id: "string",
      date: "string",
      symbol: "string",
      type: "string",
      quantity: "number",
      price: "number",
      fees: "number",
      account: "string",
      currency: "string",
      notes: "string",
      created_at: "string",
    },
  },
  watchlists: {
    tab: "watchlists",
    columns: {
      id: "string",
      list: "string",
      symbol: "string",
      notes: "string",
      added_at: "string",
    },
  },
  analyses: {
    tab: "analyses",
    columns: {
      id: "string",
      created_at: "string",
      symbol: "string",
      mode: "string",
      provider: "string",
      model: "string",
      decision: "string",
      confidence: "number",
      price: "number",
      target_price: "number",
      stop_loss: "number",
      summary: "string",
      report_json: "string",
    },
  },
  settings: {
    tab: "settings",
    columns: {
      id: "string",
      key: "string",
      value: "string",
    },
  },
} as const satisfies Record<string, TableSpec>;

export type TableName = keyof typeof TABLES;

export function headersOf(table: TableName): string[] {
  return Object.keys(TABLES[table].columns);
}

/** Google Sheets cells hold max 50,000 chars. Keep a margin. */
export const MAX_CELL_CHARS = 45_000;
