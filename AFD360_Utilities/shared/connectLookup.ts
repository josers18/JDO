import type { ConnectField, ConnectOperation } from "./connect";

interface Source {
  path: string;
  rows?: string;
  column?: string;
  entityType?: string;
  nestedRows?: string;
  parentField?: string;
}

const sources = new Map<string, Source>();
function register(names: string, path: string, rows: string, column?: string, entityType?: string) {
  for (const name of names.split(" ")) sources.set(name, { path: "/ssot/" + path, rows, column, entityType });
}
register("dataspace dataSpace dataSpaceName", "data-spaces", "dataSpaces", "name");
register("dataSpaceId", "data-spaces", "dataSpaces", "id");
register(
  "dataModelName childDataModelName dataModelObjectName dataModelObjectApiName dmoDeveloperName sourceDmo sourceDmoName sourceDmoDeveloperName chunkDmoName chunkDmoDeveloperName attachmentDmoDeveloperName vectorDmoDeveloperName vectorDmoName transcribeDmoName transcribeDmoDeveloperName segmentOnApiName",
  "metadata",
  "metadata",
  "name",
  "DataModelObject",
);
register("dloDeveloperName", "metadata", "metadata", "name", "DataLakeObject");
register("ciName packagedCalculatedInsightApiName", "metadata", "metadata", "name", "CalculatedInsight");
register(
  "dataGraphName dataGraphEntityName segmentOnDataGraph",
  "data-graphs/metadata",
  "dataGraphMetadata",
  "developerName",
);
register(
  "searchIndexName searchIndexApiName searchIndexApiNameOrId",
  "search-index",
  "semanticSearchDefinitionDetails",
  "developerName",
);
register("segmentApiName", "segments", "segments", "apiName");
register("segmentId marketSegmentId", "segments", "segments", "marketSegmentId");
register("activationTargetName", "activation-targets", "activationTargets", "name");
register("activationTargetId", "activation-targets", "activationTargets", "id");
register("knowledgeSpaceId knowledgeSpaceApiNameOrId", "knowledge-space", "knowledgeSpaces", "knowledgeSpaceId");
register("knowledgeLibraryId libraryId", "knowledge-space/library", "knowledgeSpaceLibraries", "knowledgeLibraryId");
register("rulesetId", "identity-resolutions", "identityResolutions", "rulesetId");

export function connectLookup(
  op: ConnectOperation,
  field: ConnectField & { location?: string },
  operations: ConnectOperation[],
  version: number,
) {
  if (field.type !== "string") return;
  let source = sources.get(field.name);
  if (op.path.startsWith("/ssot/document-processing/") && field.name === "mlModel") {
    source = { path: "/ssot/document-processing/global-config", rows: "supportedModels", column: "id" };
  }
  if (
    op.path === "/ssot/machine-learning/configured-models" &&
    op.method === "GET" &&
    ["assetIdOrName", "modelType", "connectorType"].includes(field.name)
  ) {
    source = {
      path: op.path,
      rows: "configuredModels",
      column: field.name === "assetIdOrName" ? undefined : field.name,
    };
  } else if (field.name === "connectorType" && !field.enum) {
    source = { path: "/ssot/connectors", rows: "connectorInfoList", column: "name" };
  }
  if (
    (op.path === "/ssot/metadata" && field.name === "entityName") ||
    (op.path.startsWith("/ssot/data-governance/") && ["objectName", "objectApiName"].includes(field.name))
  ) {
    source = { path: "/ssot/metadata", rows: "metadata", column: "name" };
  }
  if (op.path.startsWith("/ssot/data-governance/") && field.name === "fieldName") {
    source = {
      path: "/ssot/metadata",
      rows: "metadata",
      column: "name",
      nestedRows: "fields",
      parentField: "objectName",
    };
  }
  if (!source && field.location === "path") source = { path: op.path.split(`/{${field.name}}`)[0] };
  if (!source) return;
  const operation = operations.find((o) => o.method === "GET" && o.path === source.path && o.since <= version);
  if (operation) return { ...source, operation };
}

export type ConnectLookup = NonNullable<ReturnType<typeof connectLookup>>;

export function lookupParameters(source: ConnectLookup, context: Record<string, string>) {
  const params: Record<string, string> = {};
  for (const p of source.operation.parameters) {
    if (p.name === "entityType" && (source.entityType || context.entityType))
      params[p.name] = source.entityType || context.entityType;
    else if (p.name === "entityName" && source.parentField && context[source.parentField])
      params[p.name] = context[source.parentField];
    else if (/^dataspace$/i.test(p.name)) {
      const space = context.dataspace || context.dataSpace || context.dataSpaceName;
      if (space) params[p.name] = space;
    } else if ((p.required || p.location === "path") && context[p.name]) params[p.name] = context[p.name];
  }
  return params;
}

export function resourceId(row: Record<string, unknown>, key: string, collectionUrl?: string) {
  // The resource URL carries the qualified identifier even when name is only the local part.
  if (collectionUrl && typeof row.url === "string") {
    try {
      const parent = new URL(collectionUrl);
      const child = new URL(row.url, parent);
      const prefix = parent.pathname.replace(/\/$/, "") + "/";
      if (child.origin === parent.origin && child.pathname.startsWith(prefix)) {
        const tail = decodeURIComponent(child.pathname.slice(prefix.length));
        if (tail && !/[\\/]/.test(tail) && tail !== "." && tail !== "..") return tail;
      }
    } catch {
      /* Fall back to record fields for malformed resource URLs. */
    }
  }
  const byName = /name/i.test(key);
  const names = [
    key,
    key.replace(/Or(Name|DeveloperName)$/i, ""),
    ...(byName ? ["developerName", "apiName", "name", "id"] : ["id", "recordId", "developerName", "name"]),
  ];
  return names.map((name) => row[name]).find((value): value is string => typeof value === "string" && value.length > 0);
}

export function lookupOptions(source: ConnectLookup, field: ConnectField, body: unknown, url?: string) {
  const arrays: unknown[] = Array.isArray(body)
    ? [body]
    : body && typeof body === "object"
      ? source.rows
        ? [(body as Record<string, unknown>)[source.rows]]
        : Object.values(body)
      : [];
  const collections = source.nestedRows
    ? arrays.flatMap((rows) => (Array.isArray(rows) ? rows.map((row) => row?.[source.nestedRows!]) : []))
    : arrays;
  const items = new Map<string, string>();
  for (const rows of collections)
    if (Array.isArray(rows)) {
      for (const row of rows) {
        if (!row || typeof row !== "object" || Array.isArray(row)) continue;
        let id = source.column ? row[source.column] : resourceId(row, field.name, url);
        if (typeof id !== "string" || !id) continue;
        if (field.description.includes("excluding the `__dlm` suffix")) id = id.replace(/__dlm$/, "");
        if (field.enum && !field.enum.includes(id)) continue;
        items.set(id, field.enum ? id : String(row.displayName ?? row.label ?? row.name ?? id));
      }
    }
  return items;
}
