import { getOrgCredentials } from "./orgStore.ts";
import { SfError, restUrl, sfJson } from "./salesforce.ts";
import type { WireSink } from "./wire.ts";
import type { QueryApiCall, QueryCatalog, QueryField, QueryObject, QueryPage, QueryRunOptions, QueryStatus } from "../shared/types.ts";

// The Data 360 Query API (/ssot/query-sql), the REST reads beside it (data graphs, insights, profiles, universal ID
// lookup) and the metadata the object browser and autocomplete read.

const CATALOG_TTL_MS = 30 * 60_000;
const catalogs = new Map<string, QueryCatalog>(); // `${orgId}|${dataspace}` -> catalog

type MetaField = { name: string; displayName?: string; type?: string };
type MetaEntity = {
  name: string;
  displayName?: string;
  category?: string;
  fields?: MetaField[];
  primaryKeys?: { name: string }[];
  dimensions?: MetaField[];
  measures?: MetaField[];
};

type DataGraphMeta = {
  developerName: string;
  primaryObjectName?: string;
  status?: string;
  dgObject?: { developerName?: string; fields?: { developerName: string; dataType?: string; keyCol?: string }[] };
};
const nameish = (n: string) => /Name__c$/i.test(n) && !/^KQ_/.test(n);

// The fields that name a record, to search and show: one full name if there is one (Name, then PersonName); else
// first and last name; else any name fields.
function shown(names: string[]): string[] {
  const full = names.find((n) => /^(ssot__)?Name__c$/i.test(n)) ?? names.find((n) => /PersonName__c$/i.test(n));
  const parts = names.filter((n) => /(First|Last)Name__c$/i.test(n)).sort((a, b) => (/First/i.test(a) ? -1 : 1) - (/First/i.test(b) ? -1 : 1));
  return full ? [full] : parts.length ? parts : names.slice(0, 3);
}

// The root's primary key, and the name fields to search and show:
// the graph's own, else the root DMO's, since the search reads the DMO.
function graphRoot(g: DataGraphMeta, dmoFields: Map<string, QueryField[]>): { root?: QueryObject["root"] } {
  const object = g.primaryObjectName ?? g.dgObject?.developerName;
  const fields = g.dgObject?.fields ?? [];
  const key = fields.find((f) => f.keyCol === "true")?.developerName;
  if (!object || !key) return {};
  let names = fields.map((f) => f.developerName).filter(nameish);
  if (!names.length) names = (dmoFields.get(object) ?? []).map((f) => f.name).filter(nameish);
  return { root: { object, key, show: shown(names) } };
}

// A profile DMO's records are found the same way, for the Profile API's record ID.
function profileRoot(e: MetaEntity): { root?: QueryObject["root"] } {
  const key = e.primaryKeys?.[0]?.name;
  if (e.category !== "Profile" || !key) return {};
  return { root: { object: e.name, key, show: shown((e.fields ?? []).map((f) => f.name).filter(nameish)) } };
}

type SearchIndexMeta = {
  developerName: string;
  label?: string;
  searchType?: string; // HYBRID | VECTOR
  runtimeStatus?: string | null;
  vectorDmoDeveloperName?: string;
  chunkDmoDeveloperName?: string | null;
};

const field = (f: MetaField): QueryField => ({ name: f.name, label: f.displayName ?? f.name, type: f.type ?? "" });

// DMOs, DLOs, calculated insights, data graphs and search indexes in one list; unified and link objects
// (Unified*__dlm) are DMOs, split out by name. A search index is listed under its index DMO, the name SQL reads it by.
export function buildCatalog(
  dmos: MetaEntity[],
  dlos: MetaEntity[],
  cis: MetaEntity[],
  graphs: DataGraphMeta[] = [],
  indexes: SearchIndexMeta[] = [],
): QueryObject[] {
  const dmoFields = new Map(dmos.map((e) => [e.name, (e.fields ?? []).map(field)]));
  const objects: QueryObject[] = [
    ...dmos.map((e) => ({
      name: e.name,
      label: e.displayName ?? e.name,
      type: (/^Unified/.test(e.name) ? "Unified" : "DMO") as QueryObject["type"],
      category: e.category ?? "",
      fields: (e.fields ?? []).map(field),
      ...profileRoot(e),
    })),
    ...dlos.map((e) => ({ name: e.name, label: e.displayName ?? e.name, type: "DLO" as const, category: e.category ?? "", fields: (e.fields ?? []).map(field) })),
    ...cis.map((e) => ({
      name: e.name,
      label: e.displayName ?? e.name,
      type: "CI" as const,
      category: "Calculated Insight",
      fields: [...(e.dimensions ?? []), ...(e.measures ?? [])].map(field),
      measures: (e.measures ?? []).map((m) => m.name),
    })),
    ...graphs.map((g) => ({
      name: g.developerName,
      label: g.developerName,
      type: "DG" as const,
      category: g.primaryObjectName ?? "",
      fields: (g.dgObject?.fields ?? []).map((f) => ({ name: f.developerName, label: f.developerName, type: f.dataType ?? "" })),
      ...graphRoot(g, dmoFields),
    })),
    ...indexes
      .filter((i) => i.vectorDmoDeveloperName)
      .map((i) => ({
        name: i.vectorDmoDeveloperName!,
        label: `${i.label ?? i.developerName}${i.runtimeStatus && i.runtimeStatus !== "READY" ? ` (${i.runtimeStatus.toLowerCase()})` : ""}`,
        type: "SI" as const,
        category: i.searchType === "VECTOR" ? "Vector search" : "Hybrid search",
        fields: dmoFields.get(i.vectorDmoDeveloperName!) ?? [],
        searchFunction: (i.searchType === "VECTOR" ? "vector_search" : "hybrid_search") as QueryObject["searchFunction"],
        ...(i.chunkDmoDeveloperName ? { chunk: i.chunkDmoDeveloperName } : {}),
      })),
  ];
  return objects.sort((a, b) => a.label.localeCompare(b.label));
}

const scope = (dataspace?: string) => (dataspace ? `dataspace=${encodeURIComponent(dataspace)}` : "");
const withQuery = (path: string, ...params: string[]) => {
  const q = params.filter(Boolean).join("&");
  return q ? `${path}?${q}` : path;
};

// One kind of metadata the org lacks or the user can't read (no calculated insights, no search indexes) leaves the rest
// of the catalog usable.
async function listOrEmpty<T>(orgId: string, label: string, path: string, pick: (res: any) => T[] | undefined, wire?: WireSink): Promise<T[]> {
  const { myDomain } = getOrgCredentials(orgId);
  try {
    return pick(await sfJson({ orgId, label, method: "GET", url: restUrl(myDomain, path), wire })) ?? [];
  } catch (e) {
    if (e instanceof SfError && [400, 403, 404].includes(e.status)) return [];
    throw e;
  }
}

const metadata = (orgId: string, entityType: string, dataspace: string, wire?: WireSink) =>
  listOrEmpty<MetaEntity>(orgId, `Metadata (${entityType})`, withQuery("/ssot/metadata", `entityType=${entityType}`, scope(dataspace)), (r) => r?.metadata, wire);

export async function catalog(orgId: string, dataspace: string, refresh: boolean, wire?: WireSink): Promise<QueryCatalog> {
  const key = `${orgId}|${dataspace}`;
  const hit = catalogs.get(key);
  if (hit && !refresh && Date.now() - Date.parse(hit.loadedAt) < CATALOG_TTL_MS) return hit;
  const [[dmos, dlos, cis], graphs, indexes] = await Promise.all([
    Promise.all(["DataModelObject", "DataLakeObject", "CalculatedInsight"].map((t) => metadata(orgId, t, dataspace, wire))),
    listOrEmpty<DataGraphMeta>(orgId, "Data graph metadata", withQuery("/ssot/data-graphs/metadata", scope(dataspace)), (r) => r?.dataGraphMetadata, wire),
    // Search indexes have no data space filter; keep the ones in this one.
    listOrEmpty<SearchIndexMeta & { dataspace?: string }>(orgId, "Search indexes", "/ssot/search-index", (r) => r?.semanticSearchDefinitionDetails, wire).then((l) =>
      l.filter((i) => (i.dataspace ?? "default") === (dataspace || "default")),
    ),
  ]);
  const result = { dataspace, loadedAt: new Date().toISOString(), objects: buildCatalog(dmos, dlos, cis, graphs, indexes) };
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

export async function submit(orgId: string, sql: string, dataspace: string, rowLimit: number, options: QueryRunOptions = {}, wire?: WireSink): Promise<QueryPage> {
  const { myDomain } = getOrgCredentials(orgId);
  const { sqlParameters, querySettings } = options;
  return sfJson<QueryPage>({
    orgId,
    label: "Submit SQL query",
    method: "POST",
    url: restUrl(myDomain, withQuery("/ssot/query-sql", scope(dataspace))),
    body: {
      sql,
      rowLimit,
      ...(sqlParameters?.length ? { sqlParameters } : {}),
      ...(querySettings && Object.keys(querySettings).length ? { querySettings } : {}),
    },
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

// The REST path for a data graph, insight, profile or universal ID read. Every value comes from the browser, so path
// parts and query values are encoded.
export function apiPath(call: QueryApiCall, dataspace: string): string {
  const p = Object.fromEntries(Object.entries(call.params ?? {}).map(([k, v]) => [k, String(v ?? "").trim()]));
  const need = (...keys: string[]) => {
    const missing = keys.find((k) => !p[k]);
    if (missing) throw new Error(`Fill in ${missing} first`);
  };
  const seg = encodeURIComponent;
  // filters and lookupKeys are written [a=b,c=d]; the brackets are optional in the form.
  const bracketed = (v: string) => (/^\[.*\]$/s.test(v) ? v : `[${v}]`);
  const query = (...keys: string[]) =>
    keys.filter((k) => p[k]).map((k) => `${k}=${encodeURIComponent(k === "filters" || k === "lookupKeys" ? bracketed(p[k]) : p[k])}`);
  switch (call.kind) {
    case "dataGraph": {
      need("graph");
      const base = `/ssot/data-graphs/data/${seg(p.graph)}`;
      if (p.id) return withQuery(`${base}/${seg(p.id)}`, scope(dataspace), p.live === "true" ? "live=true" : "");
      need("lookupKeys");
      return withQuery(base, ...query("lookupKeys"), scope(dataspace));
    }
    case "insight":
      need("ci");
      return withQuery(`/ssot/insight/calculated-insights/${seg(p.ci)}`, ...query("dimensions", "measures", "filters", "orderby", "timeGranularity", "batchSize", "offset"));
    case "profile": {
      need("dmo");
      if (!p.id) {
        if (!p.filters) throw new Error("Without a record ID the Profile API needs a filter, e.g. ssot__FirstName__c=Sarah");
        return withQuery(`/ssot/profile/${seg(p.dmo)}`, ...query("fields", "filters", "orderby", "batchSize", "offset"));
      }
      const base = `/ssot/profile/${seg(p.dmo)}/${seg(p.id)}`;
      if (p.ci)
        return withQuery(`${base}/calculated-insights/${seg(p.ci)}`, ...query("dimensions", "measures", "fields", "filters", "orderby", "timeGranularity", "searchKey", "batchSize", "offset"));
      return withQuery(p.child ? `${base}/${seg(p.child)}` : base, ...query("fields", "filters", "orderby", "searchKey", "batchSize", "offset"));
    }
    case "universalId":
      need("entity", "dataSourceId", "dataSourceObjectId", "sourceRecordId");
      return `/ssot/universalIdLookup/${[p.entity, p.dataSourceId, p.dataSourceObjectId, p.sourceRecordId].map(seg).join("/")}`;
    default:
      throw new Error(`Unknown call ${(call as QueryApiCall).kind}`);
  }
}

const API_LABELS: Record<QueryApiCall["kind"], string> = {
  dataGraph: "Data graph",
  insight: "Calculated insight",
  profile: "Profile",
  universalId: "Universal ID lookup",
};

// A data graph answers each record as json_blob__c, a JSON string with its quotes HTML-escaped.
function unblob(record: unknown): Record<string, unknown> {
  const r = (record && typeof record === "object" ? record : { value: record }) as Record<string, unknown>;
  if (typeof r.json_blob__c !== "string") return r;
  const text = r.json_blob__c.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  try {
    return JSON.parse(text);
  } catch {
    return { json_blob__c: text };
  }
}

const typeOf = (v: unknown) =>
  typeof v === "number" ? "Number" : typeof v === "boolean" ? "Boolean" : Array.isArray(v) ? "Array" : v && typeof v === "object" ? "Object" : "Text";

// REST reads answer {data: [{field: value}], done}; the grid wants columns and rows. A record leaves out its null
// fields, so the columns are every key seen, in first-seen order.
export function tabulate(body: unknown): { page: QueryPage; done: boolean } {
  const res = (body ?? {}) as { data?: unknown[]; done?: boolean };
  const records = (Array.isArray(res.data) ? res.data : []).map(unblob);
  const types = new Map<string, string>();
  // A column's type is that of its first non-null value.
  for (const r of records) for (const [k, v] of Object.entries(r)) if (!types.get(k)) types.set(k, v === null ? "" : typeOf(v));
  const names = [...types.keys()];
  return {
    page: { metadata: names.map((name) => ({ name, type: types.get(name) || "Text" })), data: records.map((r) => names.map((n) => r[n] ?? null)), returnedRows: records.length },
    done: res.done !== false,
  };
}

export async function apiRead(orgId: string, call: QueryApiCall, dataspace: string, wire?: WireSink) {
  const { myDomain } = getOrgCredentials(orgId);
  const body = await sfJson({ orgId, label: API_LABELS[call.kind] ?? "Data 360 read", method: "GET", url: restUrl(myDomain, apiPath(call, dataspace)), wire });
  return tabulate(body);
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
      message: inner.primaryMessage || inner.errorMessage || inner.message || raw,
      detail: inner.customerDetail?.replace(/^\n/, "") || undefined,
      sqlState: inner.sqlState || undefined,
      traceId: inner.traceId || undefined,
    };
  } catch {
    return { message: raw };
  }
}
