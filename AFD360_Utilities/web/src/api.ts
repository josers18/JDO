import type {
  Agent,
  AppEvent,
  Conversation,
  ConversationSummary,
  HxlCard,
  OrgInput,
  OrgSummary,
  OrgTestResult,
  OrgsResponse,
  WireEntry,
} from "../../shared/types";

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data as T;
}

export const api = {
  orgs: () => call<OrgsResponse>("GET", "/orgs"),
  createOrg: (o: OrgInput) => call<OrgSummary>("POST", "/orgs", o),
  updateOrg: (id: string, o: OrgInput) => call<OrgSummary>("PUT", `/orgs/${id}`, o),
  deleteOrg: (id: string) => call("DELETE", `/orgs/${id}`),
  activateOrg: (id: string) => call("POST", `/orgs/${id}/activate`),
  testOrg: (id: string) => call<OrgTestResult>("POST", `/orgs/${id}/test`),
  agents: (orgId: string) => call<Agent[]>("GET", `/orgs/${orgId}/agents`),
  conversations: () => call<ConversationSummary[]>("GET", "/conversations"),
  conversation: (id: string) => call<Conversation>("GET", `/conversations/${id}`),
  createConversation: (body: { orgId: string; agentId: string; agentLabel: string; agentType: string; bypassUser: boolean }) =>
    call<Conversation>("POST", "/conversations", body),
  newSession: (id: string) => call<Conversation>("POST", `/conversations/${id}/session`),
  endSession: (id: string) => call<Conversation>("DELETE", `/conversations/${id}/session`),
  deleteConversation: (id: string) => call("DELETE", `/conversations/${id}`),
  // MCP: every response carries the Wire entries for the calls it made (also on errors).
  mcpConnect: (orgId: string, url: string) => mcpCall<McpConnectResult>("/connect", { orgId, url }),
  hxl: (orgId: string, actionType: string, value: unknown) => mcpCall<{ cards: HxlCard[] }>("/hxl", { orgId, actionType, value }),
  hxlRuntime: (orgId: string) => mcpCall<{ runtime: McpUi & { url: string } }>("/hxl-runtime", { orgId }),
  mcpCall: (orgId: string, url: string, name: string, args: unknown) =>
    mcpCall<McpCallResult>("/call", { orgId, url, name, arguments: args }),
  mcpAppCall: (orgId: string, url: string, name: string, args: unknown) =>
    mcpCall<{ result: any }>("/app-call", { orgId, url, name, arguments: args }),
  mcpRead: (orgId: string, url: string, uri: string) => mcpCall<{ result: any }>("/read", { orgId, url, uri }),
};

export interface McpTool {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: { properties?: Record<string, { type?: string; description?: string }>; required?: string[] };
  uiResourceUri: string | null;
  visibility: string[];
}

export interface McpUi {
  uri: string;
  html: string;
  csp?: Record<string, string[]>;
  permissions?: Record<string, object>;
  prefersBorder?: boolean;
}

export interface McpConnectResult {
  serverInfo: { name?: string; title?: string; version?: string };
  tools: McpTool[];
}

export interface McpCallResult {
  result: any;
  ui: McpUi | null;
}

export class McpCallError extends Error {
  constructor(message: string, public wire: WireEntry[]) {
    super(message);
  }
}

async function mcpCall<T>(path: string, body: unknown): Promise<T & { wire: WireEntry[] }> {
  const res = await fetch(`/api/mcp${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({ wire: [] }));
  if (!res.ok) throw new McpCallError(data.error ?? `HTTP ${res.status}`, data.wire ?? []);
  return data;
}

export type TurnRequest = { kind: "text"; text: string } | { kind: "confirm"; decision: "approve" | "reject"; toolIds?: string[] };

// Runs one turn (a message, or an approve/reject answer) and calls onEvent for each server-sent event until it finishes.
export async function streamTurn(id: string, turn: TurnRequest, onEvent: (e: AppEvent) => void, signal: AbortSignal) {
  const { kind, ...body } = turn;
  const res = await fetch(`/api/conversations/${id}/${kind === "text" ? "messages" : "confirm"}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let i: number;
    while ((i = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, i);
      buffer = buffer.slice(i + 2);
      const line = block.split("\n").find((l) => l.startsWith("data:"));
      if (line) onEvent(JSON.parse(line.slice(5)));
    }
  }
}
