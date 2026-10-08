import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { api, type McpUi } from "../api";
import { WidgetFrame } from "../mcp/WidgetFrame";
import type { HxlCard } from "../../../shared/types";

// The HXL runtime page is identical for every widget; load it once per org.
const runtimes = new Map<string, Promise<McpUi & { url: string }>>();
function runtime(orgId: string) {
  if (!runtimes.has(orgId)) {
    const p = api.hxlRuntime(orgId).then((r) => r.runtime);
    p.catch(() => runtimes.delete(orgId));
    runtimes.set(orgId, p);
  }
  return runtimes.get(orgId)!;
}

/**
 * Any agent's action output, rendered as HXL. The Agent API returns only the action's data; the server works out how
 * the org renders that output (its Lightning type's widget) or builds a generic card, and returns the resolved widget
 * tree, which we hand to the HXL runtime in the same result shape a hosted-MCP tool call has.
 */
export function HxlOutput({
  orgId,
  myDomain,
  actionType,
  value,
  fallback,
  onSend,
}: {
  orgId: string;
  myDomain: string;
  actionType: string;
  value: unknown;
  fallback: React.ReactNode;
  onSend?: (text: string) => boolean;
}) {
  const [state, setState] = useState<{ ui: McpUi & { url: string }; cards: HxlCard[] } | { error: string } | null>(null);
  useEffect(() => {
    Promise.all([runtime(orgId), api.hxl(orgId, actionType, value)]).then(
      ([ui, r]) => setState({ ui, cards: r.cards }),
      (e) => setState({ error: (e as Error).message }),
    );
  }, [orgId, actionType, value]);

  if (!state) {
    return (
      <div className="flex items-center gap-2 text-sm text-ink-3">
        <Loader2 size={14} className="animate-spin" /> Rendering with HXL…
      </div>
    );
  }
  if ("error" in state || state.cards.length === 0) {
    return (
      <>
        {"error" in state && <p className="text-sm text-ink-3">HXL unavailable ({state.error}); showing the raw output.</p>}
        {fallback}
      </>
    );
  }
  return (
    <div className="space-y-3">
      {state.cards.map((card) => (
        <HxlFrame key={card.key} card={card} ui={state.ui} orgId={orgId} myDomain={myDomain} onSend={onSend} />
      ))}
    </div>
  );
}

function HxlFrame({
  card,
  ui,
  orgId,
  myDomain,
  onSend,
}: {
  card: HxlCard;
  ui: McpUi & { url: string };
  orgId: string;
  myDomain: string;
  onSend?: (text: string) => boolean;
}) {
  const [result] = useState(() => ({
    content: [{ type: "text", text: "" }],
    isError: false,
    _meta: { "salesforce/org_base_url": myDomain, "salesforce/uiMetadata": card.uiMetadata },
  }));
  const label = card.source === "widget" ? `HXL · ${card.type} → ${card.widget}` : `HXL · generated card${card.type ? ` · ${card.type}` : ""}`;
  return <WidgetFrame orgId={orgId} url={ui.url} ui={ui} args={{}} result={result} onWire={() => {}} onSendMessage={onSend} label={label} frameless />;
}
