import { getToken } from "./salesforce.ts";
import { parseSse } from "./sse.ts";
import { maskBody, newWireEntry } from "./wire.ts";
import type { WireEntry } from "../shared/types.ts";

// MCP Streamable HTTP client for Salesforce-hosted MCP servers, authenticated with the org's client-credentials token.

const PROTOCOL_VERSION = "2025-06-18";
export const UI_MIME = "text/html;profile=mcp-app";
// The org token is attached to every call, so only Salesforce MCP endpoints are allowed.
const ALLOWED = /^https:\/\/api\.(gov\.)?salesforce\.com\/platform\/mcp\/v1\/[A-Za-z0-9_\-/]+$/;

interface McpSession {
  id: string | null;
  serverInfo: unknown;
  capabilities: Record<string, unknown>;
}

const sessions = new Map<string, McpSession>(); // `${orgId}|${url}`
let rpcId = 0;

export class McpError extends Error {
  constructor(message: string, public status?: number, public data?: unknown) {
    super(message);
  }
}

export function assertMcpUrl(url: string) {
  if (!ALLOWED.test(url)) throw new McpError("Only Salesforce MCP URLs (https://api.salesforce.com/platform/mcp/v1/...) are allowed");
}

async function post(
  orgId: string,
  url: string,
  body: Record<string, unknown>,
  sessionId: string | null,
  wire: WireEntry[],
  label: string,
): Promise<{ status: number; sessionId: string | null; message: Record<string, any> | null }> {
  for (let attempt = 0; ; attempt++) {
    const token = await getToken(orgId, undefined, attempt > 0);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    if (sessionId) {
      headers["Mcp-Session-Id"] = sessionId;
      headers["MCP-Protocol-Version"] = PROTOCOL_VERSION;
    }
    const entry = newWireEntry({ label, method: "POST", url, turn: null, requestHeaders: headers, requestBody: body });
    wire.push(entry);
    const t0 = Date.now();
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    entry.status = res.status;
    entry.responseHeaders = Object.fromEntries(res.headers.entries());
    let message: Record<string, any> | null = null;
    if ((res.headers.get("content-type") ?? "").includes("text/event-stream") && res.body) {
      // The JSON-RPC response arrives as one of the SSE events.
      entry.streamEvents = [];
      for await (const ev of parseSse(res.body)) {
        entry.streamEvents.push({ t: Date.now() - t0, event: ev.event, data: ev.data });
        const d = ev.data as Record<string, any>;
        if (d && d.id === body.id && ("result" in d || "error" in d)) message = d;
      }
    } else {
      const text = await res.text();
      try {
        message = text ? JSON.parse(text) : null;
      } catch {
        message = { error: { message: text.slice(0, 500) } };
      }
      entry.responseBody = maskBody(message);
    }
    entry.durationMs = Date.now() - t0;
    if (res.status === 401 && attempt === 0) continue;
    return { status: res.status, sessionId: res.headers.get("mcp-session-id") ?? sessionId, message };
  }
}

async function initialize(orgId: string, url: string, wire: WireEntry[]): Promise<McpSession> {
  const { status, sessionId, message } = await post(
    orgId,
    url,
    {
      jsonrpc: "2.0",
      id: ++rpcId,
      method: "initialize",
      params: {
        protocolVersion: PROTOCOL_VERSION,
        // Advertise MCP Apps support so servers include UI resources (HXL widgets).
        capabilities: { extensions: { "io.modelcontextprotocol/ui": { mimeTypes: [UI_MIME] } } },
        clientInfo: { name: "afd360-utilities", version: "0.1.0" },
      },
    },
    null,
    wire,
    "MCP initialize",
  );
  if (status >= 400 || !message?.result) {
    throw new McpError(`MCP initialize failed: ${message?.error?.message ?? `HTTP ${status}`}`, status, message);
  }
  await post(orgId, url, { jsonrpc: "2.0", method: "notifications/initialized" }, sessionId, wire, "MCP initialized (notification)");
  const session = { id: sessionId, serverInfo: message.result.serverInfo, capabilities: message.result.capabilities ?? {} };
  sessions.set(`${orgId}|${url}`, session);
  return session;
}

export async function getSession(orgId: string, url: string, wire: WireEntry[], fresh = false) {
  assertMcpUrl(url);
  const existing = sessions.get(`${orgId}|${url}`);
  return existing && !fresh ? existing : initialize(orgId, url, wire);
}

// One JSON-RPC request; re-initializes once if the server forgot our session.
export async function rpc(orgId: string, url: string, method: string, params: unknown, wire: WireEntry[]) {
  let session = await getSession(orgId, url, wire);
  for (let attempt = 0; ; attempt++) {
    const { status, message } = await post(
      orgId,
      url,
      { jsonrpc: "2.0", id: ++rpcId, method, params },
      session.id,
      wire,
      `MCP ${method}`,
    );
    if ((status === 404 || status === 400) && session.id && attempt === 0) {
      session = await getSession(orgId, url, wire, true);
      continue;
    }
    if (status >= 400 || message?.error) {
      throw new McpError(message?.error?.message ?? `HTTP ${status}`, status, message?.error);
    }
    return message?.result;
  }
}

export function toolUiUri(tool: { _meta?: Record<string, any> }): string | null {
  const uri = tool._meta?.ui?.resourceUri ?? tool._meta?.["ui/resourceUri"];
  return typeof uri === "string" && uri.startsWith("ui://") ? uri : null;
}
