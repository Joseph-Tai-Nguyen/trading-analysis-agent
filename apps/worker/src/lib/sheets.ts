import { headersOf, SPREADSHEET_TITLE, TABLES, type TableName } from "@taa/shared";
import { HttpError } from "./http";

type Cell = string | number | boolean | null;

/** Thin REST client for Google Sheets v4 + Drive v3 (no SDK — Workers friendly). */
export class SheetsApi {
  constructor(
    private readonly getToken: () => Promise<string>,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  private async req<T>(method: string, url: string, body?: unknown): Promise<T> {
    const res = await this.fetchFn(url, {
      method,
      headers: {
        Authorization: `Bearer ${await this.getToken()}`,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      throw new HttpError(res.status === 401 ? 401 : 502, `Google API ${res.status}`, detail);
    }
    return (await res.json()) as T;
  }

  private static readonly S = "https://sheets.googleapis.com/v4/spreadsheets";

  /** Find the app's spreadsheet. With drive.file scope only app-created files are visible. */
  async findSpreadsheet(title = SPREADSHEET_TITLE): Promise<string | null> {
    const q = `name = '${title.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`;
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive&pageSize=5`;
    const r = await this.req<{ files?: { id: string }[] }>("GET", url);
    return r.files?.[0]?.id ?? null;
  }

  async createSpreadsheet(title = SPREADSHEET_TITLE): Promise<string> {
    const sheets = (Object.keys(TABLES) as TableName[]).map((t) => sheetWithHeader(t));
    const r = await this.req<{ spreadsheetId: string }>("POST", SheetsApi.S, { properties: { title }, sheets });
    return r.spreadsheetId;
  }

  async sheetProps(id: string): Promise<{ title: string; sheetId: number }[]> {
    const r = await this.req<{ sheets: { properties: { title: string; sheetId: number } }[] }>(
      "GET",
      `${SheetsApi.S}/${id}?fields=sheets.properties(title,sheetId)`,
    );
    return r.sheets.map((s) => s.properties);
  }

  /** Create missing tabs and append missing header columns (additive migrations). */
  async ensureSchema(id: string): Promise<void> {
    const existing = new Set((await this.sheetProps(id)).map((s) => s.title));
    const missing = (Object.keys(TABLES) as TableName[]).filter((t) => !existing.has(TABLES[t].tab));
    if (missing.length) {
      await this.req("POST", `${SheetsApi.S}/${id}:batchUpdate`, {
        requests: missing.map((t) => ({ addSheet: { properties: { title: TABLES[t].tab, gridProperties: { frozenRowCount: 1 } } } })),
      });
      for (const t of missing) await this.writeRow(id, TABLES[t].tab, 1, headersOf(t));
    }
    for (const t of Object.keys(TABLES) as TableName[]) {
      if (missing.includes(t)) continue;
      const header = ((await this.getValues(id, `${TABLES[t].tab}!1:1`))[0] ?? []).map(String);
      const want = headersOf(t);
      const add = want.filter((h) => !header.includes(h));
      if (add.length) await this.writeRow(id, TABLES[t].tab, 1, [...header, ...add]);
    }
  }

  async getValues(id: string, range: string): Promise<Cell[][]> {
    const r = await this.req<{ values?: Cell[][] }>(
      "GET",
      `${SheetsApi.S}/${id}/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE`,
    );
    return r.values ?? [];
  }

  async appendRow(id: string, tab: string, row: Cell[]): Promise<void> {
    await this.req(
      "POST",
      `${SheetsApi.S}/${id}/values/${encodeURIComponent(`${tab}!A1`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      { values: [row] },
    );
  }

  /** rowNumber is 1-based (row 1 = header). */
  async writeRow(id: string, tab: string, rowNumber: number, row: Cell[]): Promise<void> {
    await this.req(
      "PUT",
      `${SheetsApi.S}/${id}/values/${encodeURIComponent(`${tab}!A${rowNumber}`)}?valueInputOption=RAW`,
      { values: [row] },
    );
  }

  /** rowNumber is 1-based. */
  async deleteRow(id: string, tab: string, rowNumber: number): Promise<void> {
    const sheet = (await this.sheetProps(id)).find((s) => s.title === tab);
    if (!sheet) throw new HttpError(500, `tab ${tab} missing`);
    await this.req("POST", `${SheetsApi.S}/${id}:batchUpdate`, {
      requests: [{ deleteDimension: { range: { sheetId: sheet.sheetId, dimension: "ROWS", startIndex: rowNumber - 1, endIndex: rowNumber } } }],
    });
  }
}

function sheetWithHeader(t: TableName) {
  return {
    properties: { title: TABLES[t].tab, gridProperties: { frozenRowCount: 1 } },
    data: [
      {
        startRow: 0,
        startColumn: 0,
        rowData: [{ values: headersOf(t).map((h) => ({ userEnteredValue: { stringValue: h }, userEnteredFormat: { textFormat: { bold: true } } })) }],
      },
    ],
  };
}

export const spreadsheetUrl = (id: string) => `https://docs.google.com/spreadsheets/d/${id}/edit`;
