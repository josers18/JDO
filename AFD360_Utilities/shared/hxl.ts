// Agent action outputs that have an HXL widget: the output's payload key (e.g. {"account": {...}}) maps to the MCP tool
// whose ui:// resource renders it. The chat feeds the agent's data to that widget as if the tool had returned it.
export interface HxlBinding {
  server: string; // hosted MCP server path under https://api.salesforce.com/platform/mcp/v1/
  tool: string;
  actionName: string; // the invocable behind the tool, echoed in the result envelope the widget expects
  widget: string; // UiWidgetBundle whose composition the server resolves with the agent's data
}

export const HXL_BINDINGS: Record<string, HxlBinding> = {
  lead: { server: "custom/AFD360Demo", tool: "getLeadSnapshot", actionName: "AFD360LeadSnapshot", widget: "afd360LeadCard" },
  account: { server: "custom/AFD360Demo", tool: "getAccountSnapshot", actionName: "AFD360AccountSnapshot", widget: "afd360AccountCard" },
  opportunity: { server: "custom/AFD360Demo", tool: "getOpportunitySnapshot", actionName: "AFD360OpportunitySnapshot", widget: "afd360OpportunityCard" },
  task: { server: "custom/AFD360Demo", tool: "createTask", actionName: "AFD360CreateTask", widget: "afd360TaskCard" },
};

/** The binding for an action output, when its value is a single known payload object. */
export function hxlBindingFor(value: unknown): { key: string; binding: HxlBinding } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const keys = Object.keys(value);
  if (keys.length !== 1 || !HXL_BINDINGS[keys[0]]) return null;
  const payload = (value as Record<string, unknown>)[keys[0]];
  return payload && typeof payload === "object" ? { key: keys[0], binding: HXL_BINDINGS[keys[0]] } : null;
}
