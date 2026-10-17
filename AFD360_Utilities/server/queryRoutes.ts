import { Router, type Request, type Response } from "express";
import { SfError } from "./salesforce.ts";
import { cancel, catalog, dataSpaces, queryError, rows, status, submit } from "./query.ts";
import type { WireSink } from "./wire.ts";
import type { WireEntry } from "../shared/types.ts";

export const queryApi = Router();

type Handler = (body: Record<string, any>, wire: WireSink) => Promise<Record<string, unknown>>;

const DEFAULT_ROW_LIMIT = 100;
const MAX_ROW_LIMIT = 5000;
const limit = (n: unknown) => Math.max(1, Math.min(MAX_ROW_LIMIT, Number(n) || DEFAULT_ROW_LIMIT));
const space = (s: unknown) => (typeof s === "string" && s !== "default" ? s : "");

// Like the MCP routes, every reply carries the Wire entries for the calls it made, errors included. A SQL error also
// carries its parsed detail: the caret line, SQL state and trace id.
const route = (fn: Handler) => async (req: Request, res: Response) => {
  const wire: WireEntry[] = [];
  // sfJson reports an entry when it starts and again when it completes; keep each once.
  const sink: WireSink = (entry) => void (wire.includes(entry) || wire.push(entry));
  try {
    res.json({ ...(await fn(req.body ?? {}, sink)), wire });
  } catch (e) {
    const sf = e instanceof SfError;
    res.status(sf ? 502 : 400).json({ ...queryError(sf ? e.body : undefined, (e as Error).message), status: sf ? e.status : undefined, wire });
  }
};

queryApi.post("/data-spaces", route(async ({ orgId }, wire) => ({ dataSpaces: await dataSpaces(orgId, wire) })));

queryApi.post(
  "/catalog",
  route(async ({ orgId, dataspace, refresh }, wire) => ({ catalog: await catalog(orgId, space(dataspace), Boolean(refresh), wire) })),
);

queryApi.post(
  "/run",
  route(async ({ orgId, sql, dataspace, rowLimit }, wire) => {
    if (typeof sql !== "string" || !sql.trim()) throw new Error("Write a SQL statement first");
    return { page: await submit(orgId, sql.trim(), space(dataspace), limit(rowLimit), wire) };
  }),
);

queryApi.post(
  "/status",
  route(async ({ orgId, queryId, dataspace, waitTimeMs }, wire) => ({ status: await status(orgId, String(queryId), space(dataspace), Number(waitTimeMs) || 0, wire) })),
);

queryApi.post(
  "/rows",
  route(async ({ orgId, queryId, dataspace, offset, rowLimit }, wire) => ({
    page: await rows(orgId, String(queryId), space(dataspace), Number(offset) || 0, limit(rowLimit), wire),
  })),
);

queryApi.post(
  "/cancel",
  route(async ({ orgId, queryId, dataspace }, wire) => {
    await cancel(orgId, String(queryId), space(dataspace), wire);
    return { ok: true };
  }),
);
