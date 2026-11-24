import type { ContentfulStatusCode } from "hono/utils/http-status";

export class HttpError extends Error {
  constructor(
    public readonly status: ContentfulStatusCode,
    message: string,
    public readonly detail?: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const badRequest = (msg: string) => new HttpError(400, msg);
export const unauthorized = (msg = "Not signed in") => new HttpError(401, msg);
export const forbidden = (msg = "Forbidden") => new HttpError(403, msg);
export const notFound = (msg = "Not found") => new HttpError(404, msg);

/** Map any thrown error (HttpError, ProviderError, LLMError) to an HTTP status. */
export function statusOf(e: unknown): ContentfulStatusCode {
  if (e instanceof HttpError) return e.status;
  const s = (e as { status?: number })?.status;
  if (typeof s === "number" && s >= 400 && s < 600) return (s === 401 || s === 403 ? 502 : s) as ContentfulStatusCode;
  return 500;
}

export function requireString(v: unknown, name: string, max = 200): string {
  if (typeof v !== "string" || !v.trim()) throw badRequest(`${name} is required`);
  if (v.length > max) throw badRequest(`${name} is too long`);
  return v.trim();
}

export function optionalString(v: unknown, max = 1000): string {
  if (v == null) return "";
  if (typeof v !== "string") throw badRequest("expected a string");
  return v.trim().slice(0, max);
}

export function requireNumber(v: unknown, name: string, { min = -Infinity } = {}): number {
  const n = typeof v === "string" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n) || n < min) throw badRequest(`${name} must be a number${min > -Infinity ? ` >= ${min}` : ""}`);
  return n;
}

export function requireSymbol(v: unknown): string {
  const s = requireString(v, "symbol", 20).toUpperCase();
  if (!/^[A-Z0-9.\-:^=/]{1,20}$/.test(s)) throw badRequest("invalid symbol");
  return s;
}
