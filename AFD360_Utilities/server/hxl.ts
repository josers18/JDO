import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// Hosted MCP returns HXL widgets pre-resolved: tools/call _meta["salesforce/uiMetadata"] is the widget composition with
// {!$attrs.x} already filled in, and the widget page only draws that tree. The Agent API returns just the action's data,
// so for chat we resolve the same tree here from the widget source in this repo (salesforce/…/uiWidgets).
const WIDGETS_DIR = path.join(import.meta.dirname, "..", "salesforce", "force-app", "main", "default", "uiWidgets");

type Node = { definition?: string; attributes?: Record<string, unknown>; children?: Node[]; meta?: { if?: string }; [k: string]: unknown };

const ATTR = /\{!\$attrs\.([A-Za-z0-9_]+)\}/g;

function resolveValue(v: unknown, attrs: Record<string, unknown>): unknown {
  if (typeof v !== "string") return v;
  const whole = /^\{!\$attrs\.([A-Za-z0-9_]+)\}$/.exec(v);
  if (whole) return attrs[whole[1]] ?? "";
  return v.replace(ATTR, (_, k) => String(attrs[k] ?? ""));
}

function resolveNode(node: Node, attrs: Record<string, unknown>): Node | null {
  if (node.meta?.if !== undefined && !resolveValue(node.meta.if, attrs)) return null;
  const { meta: _meta, children, attributes, ...rest } = node;
  const out: Node = { ...rest, id: crypto.randomUUID() };
  if (attributes) out.attributes = Object.fromEntries(Object.entries(attributes).map(([k, v]) => [k, resolveValue(v, attrs)]));
  if (children) out.children = children.map((c) => resolveNode(c, attrs)).filter((c): c is Node => c !== null);
  return out;
}

/** The uiMetadata a hosted-MCP tools/call would return for this widget and data. */
export function resolveUiMetadata(widget: string, attrs: Record<string, unknown>) {
  if (!/^[A-Za-z0-9_]+$/.test(widget)) throw new Error(`Bad widget name ${widget}`);
  const file = path.join(WIDGETS_DIR, widget, `${widget}.json`);
  const body = JSON.parse(fs.readFileSync(file, "utf8")) as { contentBody?: { widgetBody?: Node } };
  const root = body.contentBody?.widgetBody;
  if (!root) throw new Error(`Widget ${widget} has no widgetBody`);
  return { renderer: { componentOverrides: { $: resolveNode(root, attrs) } } };
}
