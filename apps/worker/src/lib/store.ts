import { MAX_CELL_CHARS, TABLES, type TableName } from "@taa/shared";
import type { SheetsApi } from "./sheets";

export type Row = Record<string, string | number | null>;

/**
 * Persistence abstraction. Production uses Google Sheets in the user's Drive;
 * DEV_AUTH_BYPASS uses KV so the app runs offline without Google OAuth.
 * Routes must only talk to this interface — never to Sheets/KV directly.
 */
export interface Store {
  readonly kind: "google-sheets" | "kv-dev";
  list<T extends Row>(table: TableName): Promise<T[]>;
  insert<T extends Row>(table: TableName, row: T): Promise<T>;
  update<T extends Row>(table: TableName, id: string, patch: Partial<T>): Promise<T | null>;
  remove(table: TableName, id: string): Promise<boolean>;
}

/** Coerce a raw row to the table's declared column types. */
export function coerceRow(table: TableName, raw: Record<string, unknown>): Row {
  const out: Row = {};
  for (const [col, type] of Object.entries(TABLES[table].columns)) {
    const v = raw[col];
    if (type === "number") {
      const n = v === "" || v == null ? null : Number(v);
      out[col] = n != null && Number.isFinite(n) ? n : null;
    } else {
      const s = v == null ? "" : String(v);
      out[col] = s.length > MAX_CELL_CHARS ? s.slice(0, MAX_CELL_CHARS) : s;
    }
  }
  return out;
}

/* ------------------------------ Google Sheets ------------------------------ */

export class SheetsStore implements Store {
  readonly kind = "google-sheets" as const;
  constructor(
    private readonly api: SheetsApi,
    private readonly spreadsheetId: string,
  ) {}

  private async read(table: TableName) {
    const values = await this.api.getValues(this.spreadsheetId, `${TABLES[table].tab}!A1:ZZ`);
    const header = (values[0] ?? []).map(String);
    const rows = values.slice(1).map((r) => {
      const o: Record<string, unknown> = {};
      header.forEach((h, i) => (o[h] = r[i]));
      return coerceRow(table, o);
    });
    return { header, rows };
  }

  private toCells(header: string[], row: Row) {
    return header.map((h) => (row[h] === undefined ? null : row[h]!));
  }

  async list<T extends Row>(table: TableName): Promise<T[]> {
    return (await this.read(table)).rows.filter((r) => r.id) as T[];
  }

  async insert<T extends Row>(table: TableName, row: T): Promise<T> {
    const clean = coerceRow(table, row);
    const { header } = await this.read(table);
    await this.api.appendRow(this.spreadsheetId, TABLES[table].tab, this.toCells(header.length ? header : Object.keys(clean), clean));
    return clean as T;
  }

  async update<T extends Row>(table: TableName, id: string, patch: Partial<T>): Promise<T | null> {
    const { header, rows } = await this.read(table);
    const idx = rows.findIndex((r) => r.id === id);
    if (idx < 0) return null;
    const merged = coerceRow(table, { ...rows[idx], ...patch, id });
    await this.api.writeRow(this.spreadsheetId, TABLES[table].tab, idx + 2, this.toCells(header, merged));
    return merged as T;
  }

  async remove(table: TableName, id: string): Promise<boolean> {
    const { rows } = await this.read(table);
    const idx = rows.findIndex((r) => r.id === id);
    if (idx < 0) return false;
    await this.api.deleteRow(this.spreadsheetId, TABLES[table].tab, idx + 2);
    return true;
  }
}

/* --------------------------------- KV (dev) -------------------------------- */

export class KvStore implements Store {
  readonly kind = "kv-dev" as const;
  constructor(
    private readonly kv: KVNamespace,
    private readonly owner: string,
  ) {}

  private key(table: TableName) {
    return `db:${this.owner}:${table}`;
  }
  private async all(table: TableName): Promise<Row[]> {
    return ((await this.kv.get<Row[]>(this.key(table), "json")) ?? []).map((r) => coerceRow(table, r));
  }
  private save(table: TableName, rows: Row[]) {
    return this.kv.put(this.key(table), JSON.stringify(rows));
  }

  async list<T extends Row>(table: TableName): Promise<T[]> {
    return (await this.all(table)) as T[];
  }
  async insert<T extends Row>(table: TableName, row: T): Promise<T> {
    const rows = await this.all(table);
    const clean = coerceRow(table, row);
    rows.push(clean);
    await this.save(table, rows);
    return clean as T;
  }
  async update<T extends Row>(table: TableName, id: string, patch: Partial<T>): Promise<T | null> {
    const rows = await this.all(table);
    const idx = rows.findIndex((r) => r.id === id);
    if (idx < 0) return null;
    rows[idx] = coerceRow(table, { ...rows[idx], ...patch, id });
    await this.save(table, rows);
    return rows[idx] as T;
  }
  async remove(table: TableName, id: string): Promise<boolean> {
    const rows = await this.all(table);
    const next = rows.filter((r) => r.id !== id);
    if (next.length === rows.length) return false;
    await this.save(table, next);
    return true;
  }
}
