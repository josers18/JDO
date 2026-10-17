import { getOrgCredentials } from "./orgStore.ts";
import { SfError, restUrl, sfJson } from "./salesforce.ts";
import type { WireSink } from "./wire.ts";
import type { QueryCatalog, QueryField, QueryObject, QueryPage, QueryStatus } from "../shared/types.ts";

// The Data 360 Query API (/ssot/query-sql) and the metadata the object browser and autocomplete read.

const CATALOG_TTL_MS = 30 * 60_000;
const catalogs = new Map<string, QueryCatalog>(); // `${orgId}|${dataspace}` -> catalog

type MetaField = { name: string; displayName?: string; type?: string };
type MetaEntity = {
  name: string;
  displayName?: string;
  category?: string;
  fields?: MetaField[];
  dimensions?: MetaField[];
  measures?: MetaField[];
};

const field = (f: MetaField): QueryField => ({ name: f.name, label: f.displayName ?? f.name, type: f.type ?? "" });

// DMOs, DLOs and calculated insights in one list; unified and link objects (Unified*__dlm) are DMOs, split out by name.
export function buildCatalog(dmos: MetaEntity[], dlos: MetaEntity[], cis: MetaEntity[]): QueryObject[] {
  const objects: QueryObject[] = [
    ...dmos.map((e) => ({
      name: e.name,
      label: e.displayName ?? e.name,
      type: (/^Unified/.test(e.name) ? "Unified" : "DMO") as QueryObject["type"],
      category: e.category ?? "",
      fields: (e.fields ?? []).map(field),
    })),
    ...dlos.map((e) => ({ name: e.name, label: e.displayName ?? e.name, type: "DLO" as const, category: e.category ?? "", fields: (e.fields ?? []).map(field) })),
    ...cis.map((e) => ({
      name: e.name,
      label: e.displayName ?? e.name,
      type: "CI" as const,
      category: "Calculated Insight",
      fields: [...(e.dimensions ?? []), ...(e.measures ?? [])].map(field),
    })),
  ];
  return objects.sort((a, b) => a.label.localeCompare(b.label));
}

const scope = (dataspace?: string) => (dataspace ? `dataspace=${encodeURIComponent(dataspace)}` : "");
const withQuery = (path: string, ...params: string[]) => {
  const q = params.filter(Boolean).join("&");
  return q ? `${path}?${q}` : path;
};

async function metadata(orgId: string, entityType: string, dataspace: string, wire?: WireSink): Promise<MetaEntity[]> {
  const { myDomain } = getOrgCredentials(orgId);
  try {
    const res = await sfJson<{ metadata?: MetaEntity[] }>({
      orgId,
      label: `Metadata (${entityType})`,
      method: "GET",
      url: restUrl(myDomain, withQuery("/ssot/metadata", `entityType=${entityType}`, scope(dataspace))),
      wire,
    });
    return res?.metadata ?? [];
  } catch (e) {
    // One entity type missing in an org (e.g. no calculated insights) leaves the rest of the catalog usable.
    if (e instanceof SfError && (e.status === 400 || e.status === 404)) return [];
    throw e;
  }
}

export async function catalog(orgId: string, dataspace: string, refresh: boolean, wire?: WireSink): Promise<QueryCatalog> {
  const key = `${orgId}|${dataspace}`;
  const hit = catalogs.get(key);
  if (hit && !refresh && Date.now() - Date.parse(hit.loadedAt) < CATALOG_TTL_MS) return hit;
  const [dmos, dlos, cis] = await Promise.all(
    ["DataModelObject", "DataLakeObject", "CalculatedInsight"].map((t) => metadata(orgId, t, dataspace, wire)),
  );
  const result = { dataspace, loadedAt: new Date().toISOString(), objects: buildCatalog(dmos, dlos, cis) };
  catalogs.set(key, result);
  return result;
}

export async function dataSpaces(orgId: string, wire?: WireSink): Promise<string[]> {
  const { myDomain } = getOrgCredentials(orgId);
  const res = await sfJson<{ dataSpaces?: { name: string }[] }>({
    orgId,
    label: "Data spaces",
    method: "GET",
    url: restUrl(myDomain, "/ssot/data-spaces"),
    wire,
  });
  return (res?.dataSpaces ?? []).map((d) => d.name);
}

export async function submit(orgId: string, sql: string, dataspace: string, rowLimit: number, wire?: WireSink): Promise<QueryPage> {
  const { myDomain } = getOrgCredentials(orgId);
  return sfJson<QueryPage>({
    orgId,
    label: "Submit SQL query",
    method: "POST",
    url: restUrl(myDomain, withQuery("/ssot/query-sql", scope(dataspace))),
    body: { sql, rowLimit },
    wire,
  });
}

// queryId comes from the browser and goes into the path, so it is always encoded.
const queryPath = (queryId: string, rest = "") => `/ssot/query-sql/${encodeURIComponent(queryId)}${rest}`;

export async function status(orgId: string, queryId: string, dataspace: string, waitTimeMs: number, wire?: WireSink): Promise<QueryStatus> {
  const { myDomain } = getOrgCredentials(orgId);
  const wait = Math.max(0, Math.min(10_000, Math.round(waitTimeMs)));
  return sfJson<QueryStatus>({
    orgId,
    label: "Query status",
    method: "GET",
    url: restUrl(myDomain, withQuery(queryPath(queryId), scope(dataspace), `waitTimeMs=${wait}`)),
    wire,
  });
}

export async function rows(orgId: string, queryId: string, dataspace: string, offset: number, rowLimit: number, wire?: WireSink): Promise<QueryPage> {
  const { myDomain } = getOrgCredentials(orgId);
  return sfJson<QueryPage>({
    orgId,
    label: `Query rows (offset ${offset})`,
    method: "GET",
    url: restUrl(myDomain, withQuery(queryPath(queryId, "/rows"), scope(dataspace), `offset=${Math.max(0, offset)}`, `rowLimit=${Math.max(1, rowLimit)}`)),
    wire,
  });
}

export async function cancel(orgId: string, queryId: string, dataspace: string, wire?: WireSink): Promise<void> {
  const { myDomain } = getOrgCredentials(orgId);
  await sfJson({ orgId, label: "Cancel query", method: "DELETE", url: restUrl(myDomain, withQuery(queryPath(queryId), scope(dataspace))), wire });
}

export interface QueryErrorDetail {
  message: string;
  detail?: string; // the SQL line with a caret under the problem
  sqlState?: string;
  traceId?: string;
}

// A SQL error arrives as [{errorCode, message}] where message is itself JSON: {primaryMessage, customerDetail, sqlState, traceId}.
export function queryError(body: unknown, fallback: string): QueryErrorDetail {
  const first = Array.isArray(body) ? body[0] : body;
  const raw = first && typeof first === "object" ? (first as { message?: unknown }).message : undefined;
  if (typeof raw !== "string") return { message: fallback };
  try {
    const inner = JSON.parse(raw) as Record<string, string>;
    return {
      message: inner.primaryMessage || inner.errorMessage || raw,
      detail: inner.customerDetail?.replace(/^\n/, "") || undefined,
      sqlState: inner.sqlState || undefined,
      traceId: inner.traceId || undefined,
    };
  } catch {
    return { message: raw };
  }
}
