import crypto from "node:crypto";
import { getOrgCredentials } from "./orgStore.ts";
import { restUrl, sfJson } from "./salesforce.ts";
import { retrieveFiles } from "./metadata.ts";
import type { HxlCard } from "../shared/types.ts";

// Renders any agent's action output as HXL. Hosted MCP sends widgets pre-resolved (tools/call
// _meta["salesforce/uiMetadata"] = the widget tree with data filled in); the Agent API sends only the data, as
// Inform.result {type: "copilotActionOutput/<function>", value}. So, for any agent, we look up how the org itself
// renders that output (function output schema -> Lightning type -> renderer -> UiWidgetBundle) and resolve the
// same tree. Outputs whose type has no widget get an HXL card built from the data's shape.

type Node = { definition?: string; attributes?: Record<string, unknown>; children?: Node[]; meta?: { if?: string; forEach?: string; forItem?: string; forIndex?: string }; [k: string]: unknown };
type Attrs = Record<string, unknown>;

const TTL_MS = 10 * 60_000;
const cache = new Map<string, { at: number; value: Promise<unknown> }>();
function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as Promise<T>;
  const value = load();
  cache.set(key, { at: Date.now(), value });
  value.catch(() => cache.delete(key));
  return value;
}

async function tooling<T>(orgId: string, soql: string): Promise<T[]> {
  const url = restUrl(getOrgCredentials(orgId).myDomain, `/tooling/query?q=${encodeURIComponent(soql)}`);
  const r = await sfJson<{ records: T[] }>({ orgId, label: "Tooling query", method: "GET", url });
  return r.records;
}

const soqlString = (s: string) => `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

// Output property -> Lightning type, from the function's output schema (planner-local or standalone GenAiFunction).
function outputTypes(orgId: string, fn: string): Promise<Record<string, string>> {
  return cached(`out|${orgId}|${fn}`, async () => {
    const [def] = await tooling<{ IsLocal: boolean; PluginId: string | null; PlannerId: string | null }>(
      orgId,
      `SELECT IsLocal, PluginId, PlannerId FROM GenAiFunctionDefinition WHERE DeveloperName = ${soqlString(fn)}`,
    );
    if (!def) return {};
    let files: Map<string, string>;
    if (def.IsLocal) {
      let plannerId = def.PlannerId;
      if (!plannerId && def.PluginId) {
        const [link] = await tooling<{ PlannerId: string }>(orgId, `SELECT PlannerId FROM GenAiPlannerFunctionDef WHERE Plugin = ${soqlString(def.PluginId)}`);
        plannerId = link?.PlannerId ?? null;
      }
      if (!plannerId) return {};
      const [planner] = await tooling<{ DeveloperName: string }>(orgId, `SELECT DeveloperName FROM GenAiPlannerDefinition WHERE Id = ${soqlString(plannerId)}`);
      if (!planner) return {};
      files = await cached(`planner|${orgId}|${planner.DeveloperName}`, () => retrieveFiles(orgId, { GenAiPlannerBundle: [planner.DeveloperName] }));
    } else {
      files = await retrieveFiles(orgId, { GenAiFunction: [fn] });
    }
    const schemaPath = [...files.keys()].find((p) => p.endsWith(`/${fn}/output/schema.json`));
    if (!schemaPath) return {};
    const schema = JSON.parse(files.get(schemaPath)!) as { properties?: Record<string, { "lightning:type"?: string }> };
    return Object.fromEntries(Object.entries(schema.properties ?? {}).map(([k, p]) => [k, p["lightning:type"] ?? ""]));
  });
}

// Custom Lightning type -> its HXL widget renderer (attribute mapping + widget composition), or null.
function typeWidget(orgId: string, type: string): Promise<{ widget: string; attributes: Attrs; body: Node } | null> {
  const m = /^(?:([A-Za-z0-9]+)__)?([A-Za-z0-9_]+)$/.exec(type);
  if (!m || (m[1] && m[1] === "lightning")) return Promise.resolve(null);
  const name = m[1] && m[1] !== "c" ? `${m[1]}__${m[2]}` : m[2];
  return cached(`type|${orgId}|${name}`, async () => {
    const files = await retrieveFiles(orgId, { LightningTypeBundle: [name] });
    const rendererPath = [...files.keys()].find((p) => /^lightningTypes\/[^/]+\/renderer\.json$/.test(p));
    if (!rendererPath) return null;
    const renderer = JSON.parse(files.get(rendererPath)!) as { renderer?: { componentOverrides?: Record<string, { definition?: string; attributes?: Attrs }> } };
    const override = renderer.renderer?.componentOverrides?.["$"];
    const w = /^@widget\/([A-Za-z0-9_]+)\/([A-Za-z0-9_]+)$/.exec(override?.definition ?? "");
    if (!w) return null; // e.g. an LWC renderer: not HXL
    const widget = w[1] === "c" ? w[2] : `${w[1]}__${w[2]}`;
    const wfiles = await retrieveFiles(orgId, { UiWidgetBundle: [widget] });
    const bodyPath = [...wfiles.keys()].find((p) => p === `uiWidgets/${w[2]}/${w[2]}.json`);
    const body = bodyPath ? (JSON.parse(wfiles.get(bodyPath)!) as { contentBody?: { widgetBody?: Node } }).contentBody?.widgetBody : null;
    return body ? { widget, attributes: override?.attributes ?? {}, body } : null;
  });
}

// Bindings per the HXL expression syntax: {!$attrs.a.b}, loop variables from meta.forEach ({!$line.x}), and
// {!$meta.env.orgUrl}. A whole-string binding keeps the value's type; embedded ones interpolate.
type Scope = Record<string, unknown>; // "$attrs", "$meta" and forItem/forIndex names -> values
const BINDING = /\{!(\$[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*)\}/g;
function lookup(scope: Scope, ref: string): unknown {
  const [head, ...rest] = ref.split(".");
  return rest.reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Attrs)[k] : undefined), scope[head]);
}
function resolveValue(v: unknown, scope: Scope): unknown {
  if (typeof v === "string") {
    const whole = /^\{!(\$[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*)\}$/.exec(v);
    if (whole) return lookup(scope, whole[1]) ?? "";
    return v.replace(BINDING, (_, ref) => String(lookup(scope, ref) ?? ""));
  }
  // Nested attribute values (e.g. table columns/rows, button actions) can carry bindings too.
  if (Array.isArray(v)) return v.map((x) => resolveValue(x, scope));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolveValue(x, scope)]));
  return v;
}
function resolveNodes(node: Node, scope: Scope): Node[] {
  const meta = node.meta ?? {};
  if (meta.forEach !== undefined) {
    const items = resolveValue(meta.forEach, scope);
    const { forEach: _f, forItem = "$Item", forIndex, ...restMeta } = meta;
    const inner = { ...node, meta: restMeta } as Node;
    return (Array.isArray(items) ? items : []).flatMap((item, i) =>
      resolveNodes(inner, { ...scope, [forItem]: item, ...(forIndex ? { [forIndex]: i } : {}) }),
    );
  }
  if (meta.if !== undefined && !resolveValue(meta.if, scope)) return [];
  const { meta: _meta, children, attributes, ...rest } = node;
  const out: Node = { ...rest, id: crypto.randomUUID() };
  if (attributes) out.attributes = resolveValue(attributes, scope) as Attrs;
  if (children) out.children = children.flatMap((c) => resolveNodes(c, scope));
  return [out];
}
export function resolveTree(node: Node, attrs: Attrs, orgUrl = ""): Node | null {
  return resolveNodes(node, { $attrs: attrs, $meta: { env: { orgUrl } } })[0] ?? null;
}

const uiMetadata = (root: Node | null) => ({ renderer: { componentOverrides: { $: root } } });

// --- Generic HXL card from data shape -------------------------------------------------------------

const humanize = (k: string) =>
  k.replace(/__c$/, "").replace(/_/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
const isUrl = (v: unknown): v is string => typeof v === "string" && /^https?:\/\//.test(v);
const isIdKey = (k: string, v: unknown) => /(^id|Id|_id)$/.test(k) && typeof v === "string" && /^[A-Za-z0-9]{15}([A-Za-z0-9]{3})?$/.test(v);
const isPrimitive = (v: unknown) => v === null || ["string", "number", "boolean"].includes(typeof v);
const show = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : typeof v === "boolean" ? (v ? "Yes" : "No") : String(v));
const text = (t: string, a: Attrs = {}): Node => ({ definition: "tile/text", attributes: { text: t, ...a } });
const chunk = <T>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
const TITLE_KEYS = ["name", "title", "subject", "label", "Name", "Title", "Subject"];

// lightning__recordInfoType-style objects: {sObjectInfo, title, data: {Field: {label, value, displayValue}}}.
function flattenRecord(o: Attrs): { title?: string; subtitle?: string; fields: [string, unknown][] } | null {
  const data = o.data as Record<string, { label?: string; value?: unknown; displayValue?: unknown }> | undefined;
  if (!data || typeof data !== "object" || !Object.values(data).every((f) => f && typeof f === "object" && "value" in f)) return null;
  const fields = Object.entries(data)
    .filter(([k, f]) => !isIdKey(k, f.value))
    .map(([k, f]): [string, unknown] => [f.label ?? humanize(k), f.displayValue || f.value]);
  return { title: String(o.title ?? ""), subtitle: (o.sObjectInfo as Attrs | undefined)?.label as string | undefined, fields };
}

function table(caption: string, rows: Attrs[]): Node | null {
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((k) => rows.some((r) => isPrimitive(r[k]) && !isIdKey(k, r[k])));
  if (!keys.length) return null;
  return {
    definition: "tile/table",
    attributes: {
      caption,
      columns: keys.slice(0, 8).map((k) => ({ key: k, header: humanize(k), columnType: rows.some((r) => isUrl(r[k])) ? "link" : undefined })),
      rows: rows.slice(0, 25).map((r) => Object.fromEntries(keys.slice(0, 8).map((k) => [k, show(r[k])]))),
      appearance: "striped",
      size: "sm",
    },
  };
}

export function autoCard(key: string, data: unknown): Node {
  const children: Node[] = [];
  if (Array.isArray(data)) {
    const objs = data.filter((d): d is Attrs => !!d && typeof d === "object" && !Array.isArray(d));
    const t = objs.length ? table(humanize(key), objs) : null;
    children.push(t ?? { definition: "tile/markdown", attributes: { source: data.map((d) => `- ${show(d)}`).join("\n") } });
  } else if (data && typeof data === "object") {
    const o = data as Attrs;
    const rec = flattenRecord(o);
    const title = rec?.title || (TITLE_KEYS.map((k) => o[k]).find((v) => typeof v === "string" && v) as string | undefined) || humanize(key);
    const fields: [string, unknown][] =
      rec?.fields ??
      Object.entries(o).filter(([k, v]) => isPrimitive(v) && !isIdKey(k, v) && !isUrl(v) && !TITLE_KEYS.includes(k)).map(([k, v]) => [humanize(k), v]);
    children.push({
      definition: "tile/container",
      children: [text(title, { variant: "h2" }), text(rec?.subtitle ?? humanize(key), { variant: "caption", color: "muted" })],
    });
    if (fields.length) {
      children.push({
        definition: "tile/container",
        attributes: { variant: "emphasis" },
        // A column holds at most 10 children (HXL childBlocks), so fields go in columns of 10.
        children: chunk(fields.slice(0, 30), 10).map((group) => ({
          definition: "tile/column",
          attributes: { gap: "sm", align: "start" },
          children: group.map(([label, v]) => ({
            definition: "tile/row",
            attributes: { gap: "sm" },
            children: [text(label, { variant: "body", weight: "semibold" }), text(show(v), { variant: "body" })],
          })),
        })),
      });
    }
    for (const [k, v] of Object.entries(o).slice(0, 40)) {
      if (children.length >= 8) break; // header + fields + tables + link stay within a column's 10
      if (Array.isArray(v) && v.some((x) => x && typeof x === "object")) {
        const t = table(humanize(k), v as Attrs[]);
        if (t) children.push(t);
      }
    }
    const link = Object.entries(o).find(([, v]) => isUrl(v));
    if (link) children.push({ definition: "tile/link", attributes: { href: link[1], text: "Open in Salesforce" } });
  } else {
    children.push(text(show(data)));
  }
  return { definition: "tile/widget", children: [{ definition: "tile/column", attributes: { gap: "md", align: "stretch" }, children }] };
}

/** HXL cards for one action output: the org's own widget per property when its Lightning type has one, else generic. */
export async function renderActionOutput(orgId: string, actionType: string, value: unknown): Promise<HxlCard[]> {
  const fn = /^copilotActionOutput\/(.+)$/.exec(actionType)?.[1];
  const props = value && typeof value === "object" && !Array.isArray(value) ? Object.entries(value as Attrs) : [["output", value] as [string, unknown]];
  const orgUrl = getOrgCredentials(orgId).myDomain;
  const types = fn ? await outputTypes(orgId, fn).catch(() => ({}) as Record<string, string>) : {};
  return Promise.all(
    props
      .filter(([, data]) => data !== null && data !== undefined && data !== "")
      .map(async ([key, data]): Promise<HxlCard> => {
        const type = (types as Record<string, string>)[key] || null;
        const w = type ? await typeWidget(orgId, type).catch(() => null) : null;
        if (w && data && typeof data === "object") {
          // Renderer attributes map the type's data ($attrs) onto the widget's attributes.
          const widgetAttrs = resolveValue(w.attributes, { $attrs: data as Attrs, $meta: { env: { orgUrl } } }) as Attrs;
          return { key, type, source: "widget", widget: w.widget, uiMetadata: uiMetadata(resolveTree(w.body, widgetAttrs, orgUrl)) };
        }
        return { key, type, source: "auto", uiMetadata: uiMetadata(resolveTree(autoCard(key, data), {}, orgUrl)) };
      }),
  );
}
