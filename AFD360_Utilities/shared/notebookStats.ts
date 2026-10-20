import type { WireEntry } from "./types.ts";

export interface QueryStats {
  id: string; // the first page's wire entry
  sql: string | null;
  status: number | null;
  error: string | null;
  rows: number | null; // the response's rowCount
  columns: number | null;
  pages: number;
  dataCloudMs: number | null; // endTime - startTime, on Data Cloud's clock
  totalMs: number | null; // our measured time, all pages
  transferMs: number | null; // totalMs - dataCloudMs: network, download and parsing
  bytes: number | null; // decompressed response size
  queryId: string | null;
  traceId: string | null;
  rateLimit: { remaining: string; limit: string | null; reset: string | null } | null;
}

export interface CellStats {
  turn: number | null;
  calls: number;
  httpMs: number;
  signInMs: number | null; // OAuth token + Data Cloud token exchange + revoke
  queries: QueryStats[];
  rows: number | null;
  dataCloudMs: number | null;
  transferMs: number | null;
  bytes: number | null;
}

const SIGN_IN = new Set(["OAuth token", "Data Cloud token exchange", "Revoke core token"]);
const QUERY = /^Query \(v\d\)$/;
const NEXT_BATCH = "Query next batch";

type Body = Record<string, any>;
const obj = (v: unknown): Body => (v && typeof v === "object" && !Array.isArray(v) ? (v as Body) : {});

// Data Cloud times have nanoseconds; Date.parse wants milliseconds at most.
const parseTime = (s: unknown) => (typeof s === "string" ? Date.parse(s.replace(/(\.\d{3})\d+/, "$1")) : NaN);

const header = (w: WireEntry, name: string) => {
  const key = Object.keys(w.responseHeaders ?? {}).find((k) => k.toLowerCase() === name);
  return key ? w.responseHeaders![key] : null;
};

const sum = (xs: (number | null)[]) => (xs.some((x) => x !== null) ? xs.reduce<number>((a, x) => a + (x ?? 0), 0) : null);

// The error text from a failed query response: the first "message" anywhere in the body, else its text.
function errorText(body: unknown): string | null {
  if (typeof body === "string") return body.slice(0, 500) || null;
  if (Array.isArray(body)) return body.map(errorText).find((m) => m) ?? null;
  const b = obj(body);
  if (typeof b.message === "string") return b.message;
  return Object.values(b).map(errorText).find((m) => m) ?? null;
}

function queryStats(first: WireEntry, batches: WireEntry[]): QueryStats {
  const pages = [first, ...batches];
  const bodies = pages.map((p) => obj(p.responseBody));
  const failed = pages.find((p) => p.error || (p.status ?? 0) >= 400);
  const rowCounts = bodies.map((b) => b.rowCount).filter((n): n is number => typeof n === "number");
  const start = parseTime(bodies[0].startTime);
  const end = Math.max(...bodies.map((b) => parseTime(b.endTime)).filter(Number.isFinite));
  const dataCloudMs = Number.isFinite(start) && Number.isFinite(end) && end >= start ? end - start : null;
  const totalMs = sum(pages.map((p) => p.durationMs ?? null));
  const remaining = header(first, "x-ratelimit-remaining");
  const meta = bodies[0].metadata;
  return {
    id: first.id,
    sql: typeof obj(first.requestBody).sql === "string" ? obj(first.requestBody).sql.trim() : null,
    status: failed?.status ?? first.status ?? null,
    error: failed ? (failed.error ?? errorText(failed.responseBody) ?? `HTTP ${failed.status}`) : null,
    rows: rowCounts.length ? Math.max(...rowCounts) : null,
    columns: meta && typeof meta === "object" ? Object.keys(meta).length : null,
    pages: pages.length,
    dataCloudMs,
    totalMs,
    transferMs: totalMs !== null && dataCloudMs !== null ? Math.max(0, totalMs - dataCloudMs) : null,
    bytes: sum(pages.map((p) => p.responseBytes ?? null)),
    queryId: typeof bodies[0].queryId === "string" ? bodies[0].queryId : null,
    traceId: header(first, "x-trace-id"),
    rateLimit: remaining ? { remaining, limit: header(first, "x-ratelimit-limit"), reset: header(first, "x-ratelimit-reset") } : null,
  };
}

// Telemetry for one notebook cell, from the connector calls it made (all recorded on the wire, so no extra calls).
export function cellStats(wire: WireEntry[]): CellStats {
  const queries: QueryStats[] = [];
  let open: { first: WireEntry; batches: WireEntry[] } | null = null;
  const close = () => open && queries.push(queryStats(open.first, open.batches));
  for (const w of wire) {
    if (QUERY.test(w.label)) {
      close();
      open = { first: w, batches: [] };
    } else if (w.label === NEXT_BATCH && open) open.batches.push(w);
  }
  close();
  const signIn = wire.filter((w) => SIGN_IN.has(w.label));
  return {
    turn: wire[0]?.turn ?? null,
    calls: wire.length,
    httpMs: wire.reduce((n, w) => n + (w.durationMs ?? 0), 0),
    signInMs: signIn.length ? signIn.reduce((n, w) => n + (w.durationMs ?? 0), 0) : null,
    queries,
    rows: sum(queries.map((q) => q.rows)),
    dataCloudMs: sum(queries.map((q) => q.dataCloudMs)),
    transferMs: sum(queries.map((q) => q.transferMs)),
    bytes: sum(queries.map((q) => q.bytes)),
  };
}

// One CellStats per execution count, in run order.
export function statsByCell(wire: WireEntry[]): CellStats[] {
  const turns = new Map<number, WireEntry[]>();
  for (const w of wire) if (w.turn !== null) turns.set(w.turn, [...(turns.get(w.turn) ?? []), w]);
  return [...turns.values()].map(cellStats);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 ** 2).toFixed(1)} MB`;
}
