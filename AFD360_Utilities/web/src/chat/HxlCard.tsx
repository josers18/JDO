import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { api, type McpUi } from "../api";
import { WidgetFrame } from "../mcp/WidgetFrame";
import type { HxlBinding } from "../../../shared/hxl";

const BASE = "https://api.salesforce.com/platform/mcp/v1/";

// One widget fetch per org + tool for the page's lifetime; every card of that kind reuses it.
const uiCache = new Map<string, Promise<McpUi>>();
function loadUi(orgId: string, b: HxlBinding) {
  const key = `${orgId}|${b.server}|${b.tool}`;
  if (!uiCache.has(key)) {
    const p = api.mcpWidget(orgId, BASE + b.server, b.tool).then((r) => r.ui);
    p.catch(() => uiCache.delete(key));
    uiCache.set(key, p);
  }
  return uiCache.get(key)!;
}

/**
 * An agent action output rendered through its HXL widget. The Agent API returns only the action's structured data,
 * so we fetch the widget page from the MCP server that declares it, have our server resolve the widget tree with
 * that data (server/hxl.ts), and hand both over in the same result envelope the MCP tool would have returned.
 */
export function HxlCard({
  orgId,
  myDomain,
  dataKey,
  binding,
  value,
}: {
  orgId: string;
  myDomain: string;
  dataKey: string;
  binding: HxlBinding;
  value: Record<string, unknown>;
}) {
  const [ui, setUi] = useState<McpUi | null>(null);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    // Mirrors a hosted-MCP tools/call result for an Apex invocable, including the server-resolved widget tree.
    Promise.all([loadUi(orgId, binding), api.hxlRender(dataKey, value)]).then(([u, r]) => {
      const envelope = { actionName: binding.actionName, isSuccess: true, errors: null, outputValues: value };
      setResult({
        content: [{ type: "text", text: JSON.stringify([envelope]) }],
        structuredContent: { content: [envelope] },
        isError: false,
        _meta: { "salesforce/org_base_url": myDomain, "salesforce/uiMetadata": r.uiMetadata },
      });
      setUi(u);
    }, (e) => setError((e as Error).message));
  }, [orgId, myDomain, dataKey, binding, value]);

  if (error) return <p className="rounded-xl border border-err/30 bg-err/8 px-3 py-2 text-sm text-err">HXL widget unavailable: {error}</p>;
  if (!ui || !result) {
    return (
      <div className="flex items-center gap-2 text-sm text-ink-3">
        <Loader2 size={14} className="animate-spin" /> Loading HXL widget…
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <WidgetFrame orgId={orgId} url={BASE + binding.server} ui={ui} args={{}} result={result} onWire={() => {}} />
      <p className="font-mono text-xs text-ink-3">HXL · {ui.uri}</p>
    </div>
  );
}
