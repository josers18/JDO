import { Router, type Request, type Response } from "express";
import { McpError, UI_MIME, getSession, rpc, toolUiUri } from "./mcp.ts";
import type { WireEntry } from "../shared/types.ts";

export const mcpApi = Router();

type Handler = (body: Record<string, any>, wire: WireEntry[]) => Promise<Record<string, unknown>>;

// Every MCP route returns the Wire entries for the calls it made alongside its result.
const route = (fn: Handler) => async (req: Request, res: Response) => {
  const wire: WireEntry[] = [];
  try {
    res.json({ ...(await fn(req.body ?? {}, wire)), wire });
  } catch (e) {
    res.status(e instanceof McpError ? 502 : 400).json({ error: (e as Error).message, wire });
  }
};

async function readUi(orgId: string, url: string, uri: string, listingMeta: unknown, wire: WireEntry[]) {
  const result = await rpc(orgId, url, "resources/read", { uri }, wire);
  const content = result?.contents?.[0];
  if (!content || (content.mimeType && content.mimeType !== UI_MIME)) {
    throw new McpError(`UI resource ${uri} is not ${UI_MIME} (got ${content?.mimeType ?? "nothing"})`);
  }
  const html = typeof content.text === "string" ? content.text : Buffer.from(content.blob ?? "", "base64").toString("utf8");
  // Per the MCP Apps spec, the content item's _meta.ui wins over the listing's.
  const ui = content._meta?.ui ?? (listingMeta as { ui?: unknown })?.ui ?? {};
  return { uri, html, csp: ui.csp, permissions: ui.permissions, prefersBorder: ui.prefersBorder };
}

mcpApi.post(
  "/connect",
  route(async ({ orgId, url }, wire) => {
    const session = await getSession(orgId, url, wire, true);
    const tools = (await rpc(orgId, url, "tools/list", {}, wire))?.tools ?? [];
    return {
      serverInfo: session.serverInfo,
      capabilities: session.capabilities,
      tools: tools.map((t: Record<string, any>) => ({
        name: t.name,
        title: t.title,
        description: t.description,
        inputSchema: t.inputSchema,
        uiResourceUri: toolUiUri(t),
        visibility: t._meta?.ui?.visibility ?? ["model", "app"],
      })),
    };
  }),
);

// Calls a tool; if it declares an MCP Apps UI, also returns the widget HTML + its CSP/permissions.
mcpApi.post(
  "/call",
  route(async ({ orgId, url, name, arguments: args }, wire) => {
    const tools = (await rpc(orgId, url, "tools/list", {}, wire))?.tools ?? [];
    const tool = tools.find((t: { name: string }) => t.name === name);
    if (!tool) throw new McpError(`Unknown tool ${name}`);
    const uiUri = toolUiUri(tool);
    const [result, ui] = await Promise.all([
      rpc(orgId, url, "tools/call", { name, arguments: args ?? {} }, wire),
      uiUri ? readUi(orgId, url, uiUri, tool._meta, wire) : Promise.resolve(null),
    ]);
    return { result, ui, tool: { name: tool.name, title: tool.title } };
  }),
);

// Proxied for widgets (app → host → server): tools/call from inside the widget.
mcpApi.post(
  "/app-call",
  route(async ({ orgId, url, name, arguments: args }, wire) => {
    const tools = (await rpc(orgId, url, "tools/list", {}, wire))?.tools ?? [];
    const tool = tools.find((t: { name: string }) => t.name === name);
    const visibility: string[] = tool?._meta?.ui?.visibility ?? ["model", "app"];
    if (!tool || !visibility.includes("app")) throw new McpError(`Tool ${name} is not callable from the app`);
    return { result: await rpc(orgId, url, "tools/call", { name, arguments: args ?? {} }, wire) };
  }),
);

mcpApi.post(
  "/read",
  route(async ({ orgId, url, uri }, wire) => ({ result: await rpc(orgId, url, "resources/read", { uri }, wire) })),
);
