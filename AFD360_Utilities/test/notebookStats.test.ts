import { describe, expect, it } from "vitest";
import { cellStats, formatBytes, statsByCell } from "../shared/notebookStats.ts";
import type { WireEntry } from "../shared/types.ts";

let n = 0;
const entry = (label: string, p: Partial<WireEntry> = {}): WireEntry => ({
  id: `w${++n}`,
  turn: 2,
  label,
  startedAt: "2026-10-20T00:13:02Z",
  method: "POST",
  url: "https://x",
  requestHeaders: {},
  status: 200,
  ...p,
});

// The shape of a live finsdc3 /api/v2/query response (rows cut to 50 on the wire).
const query = (p: Partial<WireEntry> = {}) =>
  entry("Query (v2)", {
    requestBody: { sql: "  SELECT ssot__Id__c FROM UnifiedssotAccountAcc__dlm\n" },
    responseHeaders: { "x-trace-id": "trace-1", "x-ratelimit-remaining": "998", "x-ratelimit-limit": "1000, 1000;w=1, 1000;w=86400" },
    responseBody: {
      data: [["a"], ["b"]],
      startTime: "2026-10-20T00:13:02.41104693Z",
      endTime: "2026-10-20T00:13:02.665218495Z",
      rowCount: 20884,
      queryId: "MTAu_fc89",
      nextBatchId: null,
      done: true,
      metadata: { ssot__Id__c: { type: "VARCHAR", placeInOrder: 0 } },
    },
    durationMs: 653,
    responseBytes: 1_200_000,
    ...p,
  });

describe("cellStats", () => {
  it("reads rows, Data Cloud time, transfer, size, ids and rate limit from a query response", () => {
    const s = cellStats([entry("OAuth token", { durationMs: 241 }), entry("Data Cloud token exchange", { durationMs: 116 }), entry("Revoke core token", { durationMs: 91 }), query()]);
    expect(s).toMatchObject({ turn: 2, calls: 4, httpMs: 1101, signInMs: 448, rows: 20884, dataCloudMs: 254, transferMs: 399, bytes: 1_200_000 });
    expect(s.queries).toHaveLength(1);
    expect(s.queries[0]).toMatchObject({
      sql: "SELECT ssot__Id__c FROM UnifiedssotAccountAcc__dlm",
      columns: 1,
      pages: 1,
      queryId: "MTAu_fc89",
      traceId: "trace-1",
      error: null,
      rateLimit: { remaining: "998", limit: "1000, 1000;w=1, 1000;w=86400", reset: null },
    });
  });

  it("folds next-batch pages into their query", () => {
    const first = query({ responseBody: { ...(query().responseBody as object), done: false, nextBatchId: "b1" } });
    const batch = entry("Query next batch", { method: "GET", durationMs: 300, responseBytes: 800_000, responseBody: { rowCount: 20884, done: true, endTime: "2026-10-20T00:13:03.000Z" } });
    const s = cellStats([first, batch, query()]);
    expect(s.queries.map((q) => q.pages)).toEqual([2, 1]);
    expect(s.queries[0]).toMatchObject({ totalMs: 953, bytes: 2_000_000, dataCloudMs: 589 });
    expect(s.rows).toBe(41768);
  });

  it("reports a failed query's message and no timings", () => {
    const s = cellStats([query({ status: 400, responseBody: [{ errorCode: "QUERY_ERROR", message: "Cross Joins are not supported." }], responseBytes: undefined })]);
    expect(s.queries[0]).toMatchObject({ status: 400, error: "Cross Joins are not supported.", rows: null, dataCloudMs: null, transferMs: null, bytes: null });
    expect(s.rows).toBeNull();
  });

  it("has no queries or sign-in for a cell without connector calls", () => {
    expect(cellStats([])).toMatchObject({ turn: null, calls: 0, httpMs: 0, signInMs: null, queries: [], rows: null });
  });
});

describe("statsByCell", () => {
  it("groups the wire by execution count in run order", () => {
    const s = statsByCell([query({ turn: 1 }), query({ turn: 3 }), entry("Metadata", { turn: 1 }), query({ turn: null })]);
    expect(s.map((c) => [c.turn, c.calls])).toEqual([[1, 2], [3, 1]]);
  });
});

describe("formatBytes", () => {
  it("picks B, KB or MB", () => {
    expect([formatBytes(512), formatBytes(2048), formatBytes(12.5 * 1024 ** 2)]).toEqual(["512 B", "2.0 KB", "12.5 MB"]);
  });
});
