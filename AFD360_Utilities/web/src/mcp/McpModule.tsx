import { useEffect, useMemo, useState } from "react";
import { LayoutTemplate, Loader2, Play, Plug, Plus, Wrench } from "lucide-react";
import { api, McpCallError, type McpCallResult, type McpTool } from "../api";
import { WirePanel } from "../chat/WirePanel";
import { WidgetFrame } from "./WidgetFrame";
import type { OrgsResponse, WireEntry } from "../../../shared/types";

const BASE = "https://api.salesforce.com/platform/mcp/v1/";
// Salesforce-hosted servers already used in JDO; custom servers are added per org.
const PRESETS = [
  "platform/sobject-all",
  "platform/sobject-reads",
  "data/data360",
  "data/data-cloud-queries",
  "platform/agentforce-grid",
  "platform/headless-360",
  "platform/metadata-experts",
  "platform/salesforce-api-context",
  "analytics/tableau-next",
];

const storeKey = (orgId: string) => `afd360.mcpServers.${orgId}`;

interface SchemaNode {
  type?: string;
  properties?: Record<string, SchemaNode>;
  items?: SchemaNode;
}

// Builds an argument skeleton from the tool's JSON schema so the editor starts filled in.
// Arrays get one sample item (Salesforce invocable tools take {"inputs": [{...}]}).
function sample(node: SchemaNode): unknown {
  if (node.type === "object" || node.properties) {
    return Object.fromEntries(Object.entries(node.properties ?? {}).map(([k, p]) => [k, sample(p)]));
  }
  if (node.type === "array") return node.items ? [sample(node.items)] : [];
  if (node.type === "number" || node.type === "integer") return 0;
  if (node.type === "boolean") return false;
  return "";
}

const skeleton = (tool: McpTool) => sample({ type: "object", ...(tool.inputSchema as SchemaNode) }) as Record<string, unknown>;

export function McpModule({ orgs, onOpenAdmin }: { orgs: OrgsResponse; onOpenAdmin: () => void }) {
  const org = orgs.orgs.find((o) => o.id === orgs.activeOrgId) ?? null;
  const [custom, setCustom] = useState<string[]>([]);
  const [newServer, setNewServer] = useState("");
  const [server, setServer] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [info, setInfo] = useState<{ title?: string; name?: string; version?: string } | null>(null);
  const [tools, setTools] = useState<McpTool[]>([]);
  const [tool, setTool] = useState<McpTool | null>(null);
  const [argsText, setArgsText] = useState("{}");
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState<(McpCallResult & { args: Record<string, unknown> }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wire, setWire] = useState<WireEntry[]>([]);
  const [tab, setTab] = useState<"widget" | "result">("widget");

  useEffect(() => {
    if (!org) return;
    setCustom(JSON.parse(localStorage.getItem(storeKey(org.id)) ?? "[]"));
    setServer(null);
    setTools([]);
    setTool(null);
    setOutput(null);
  }, [org?.id]);

  const servers = useMemo(() => [...custom, ...PRESETS], [custom]);
  const addWire = (entries: WireEntry[]) => setWire((w) => [...w, ...entries]);

  const connect = async (path: string) => {
    if (!org) return;
    setServer(path);
    setConnecting(true);
    setError(null);
    setTools([]);
    setTool(null);
    setOutput(null);
    try {
      const r = await api.mcpConnect(org.id, BASE + path);
      addWire(r.wire);
      setInfo(r.serverInfo);
      // Tools with a UI (HXL widgets) first.
      setTools([...r.tools].sort((a, b) => Number(Boolean(b.uiResourceUri)) - Number(Boolean(a.uiResourceUri)) || a.name.localeCompare(b.name)));
    } catch (e) {
      if (e instanceof McpCallError) addWire(e.wire);
      setError((e as Error).message);
    } finally {
      setConnecting(false);
    }
  };

  const addServer = () => {
    if (!org) return;
    const path = newServer.trim().replace(BASE, "").replace(/^\/+|\/+$/g, "");
    if (!path) return;
    const name = path.includes("/") ? path : `custom/${path}`;
    const next = [name, ...custom.filter((c) => c !== name)];
    setCustom(next);
    localStorage.setItem(storeKey(org.id), JSON.stringify(next));
    setNewServer("");
    connect(name);
  };

  const pick = (t: McpTool) => {
    setTool(t);
    setArgsText(JSON.stringify(skeleton(t), null, 2));
    setOutput(null);
    setError(null);
  };

  const run = async () => {
    if (!org || !server || !tool) return;
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(argsText || "{}");
    } catch {
      setError("Arguments are not valid JSON");
      return;
    }
    setRunning(true);
    setError(null);
    setOutput(null);
    try {
      const r = await api.mcpCall(org.id, BASE + server, tool.name, args);
      addWire(r.wire);
      setOutput({ ...r, args });
      setTab(r.ui ? "widget" : "result");
    } catch (e) {
      if (e instanceof McpCallError) addWire(e.wire);
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  if (!org) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-ink-3">
        <p>No org configured yet.</p>
        <button onClick={onOpenAdmin} className="rounded-xl bg-action px-4 py-2.5 text-sm font-semibold text-action-ink shadow-card">
          Add an org in Admin
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Servers + tools */}
      <aside className="flex w-64 shrink-0 flex-col bg-side text-side-ink xl:w-72 2xl:w-80">
        <div className="px-3 pb-3 pt-4">
          <h2 className="text-sm font-semibold text-side-ink">MCP servers <span className="font-normal text-side-ink-2">· {org.name}</span></h2>
          <div className="mt-2 flex gap-1">
            <input
              value={newServer}
              onChange={(e) => setNewServer(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addServer()}
              placeholder="custom/MyServer"
              className="min-w-0 flex-1 rounded-xl border border-side-line bg-side-2 px-2.5 py-2 font-mono text-xs text-side-ink placeholder:text-side-ink-2 focus:outline-none"
            />
            <button onClick={addServer} className="rounded-xl bg-action px-2.5 text-action-ink" title="Add and connect">
              <Plus size={14} />
            </button>
          </div>
        </div>
        <div className="max-h-[40%] overflow-y-auto border-b border-side-line p-2">
          {servers.map((s) => (
            <button
              key={s}
              onClick={() => connect(s)}
              className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left font-mono text-xs ${
                server === s ? "bg-side-2 font-semibold ring-1 ring-side-line" : "hover:bg-side-2/60"
              }`}
            >
              <Plug size={12} className="shrink-0 text-side-ink-2" />
              <span className="break-all">{s}</span>
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {connecting && (
            <div className="flex items-center gap-2 p-2 text-xs text-side-ink-2">
              <Loader2 size={14} className="animate-spin" /> Connecting…
            </div>
          )}
          {!connecting && server && tools.length === 0 && !error && <p className="p-2 text-xs text-side-ink-2">No tools.</p>}
          {tools.map((t) => (
            <button
              key={t.name}
              onClick={() => pick(t)}
              className={`flex w-full items-start gap-2 rounded-xl px-2.5 py-2 text-left ${tool?.name === t.name ? "bg-side-2 ring-1 ring-side-line" : "hover:bg-side-2/60"}`}
            >
              {t.uiResourceUri ? (
                <LayoutTemplate size={14} className="mt-0.5 shrink-0 text-live" />
              ) : (
                <Wrench size={14} className="mt-0.5 shrink-0 text-side-ink-2" />
              )}
              <div className="min-w-0">
                <div className="break-words text-sm">{t.title ?? t.name}</div>
                <div className="break-all font-mono text-xs text-side-ink-2">
                  {t.name}
                  {t.uiResourceUri && <span className="ml-1 rounded bg-side-2 px-1 font-semibold text-side-ink ring-1 ring-side-line">UI</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      </aside>

      {/* Tool runner */}
      <section className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <div className="mx-auto w-full max-w-[88rem] space-y-4 px-6 py-6 lg:px-10">
          {info && server && (
            <div className="text-xs text-ink-3">
              Connected to <span className="font-semibold text-ink-2">{info.title ?? info.name}</span> {info.version} ·{" "}
              <span className="break-all font-mono">{BASE + server}</span>
            </div>
          )}
          {error && <div className="rounded-xl border border-err/30 bg-err/10 px-3 py-2 text-sm text-err">{error}</div>}
          {!tool ? (
            <div className="py-16 text-center text-ink-3">
              {server ? "Pick a tool on the left." : "Pick or add an MCP server on the left. Tools marked UI return an MCP Apps widget (e.g. HXL)."}
            </div>
          ) : (
            <>
              <div>
                <h1 className="text-xl font-semibold">{tool.title ?? tool.name}</h1>
                {tool.description && <p className="mt-1 whitespace-pre-line text-sm text-ink-2">{tool.description}</p>}
                {tool.uiResourceUri && (
                  <p className="mt-1 text-xs text-recv-ink">
                    Returns a widget: <span className="font-mono">{tool.uiResourceUri}</span>
                  </p>
                )}
              </div>
              <div className="rounded-xl border border-line bg-surface">
                <div className="flex items-center justify-between border-b border-line px-3 py-2 text-xs text-ink-3">
                  <span>
                    Arguments (JSON)
                    {tool.inputSchema?.required?.length ? ` · required: ${tool.inputSchema.required.join(", ")}` : ""}
                  </span>
                  <button
                    onClick={run}
                    disabled={running}
                    className="flex items-center gap-1.5 rounded-xl bg-action px-3 py-1.5 text-xs font-semibold text-action-ink shadow-card hover:brightness-105 disabled:opacity-50"
                  >
                    {running ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} Call tool
                  </button>
                </div>
                <textarea
                  value={argsText}
                  onChange={(e) => setArgsText(e.target.value)}
                  spellCheck={false}
                  rows={Math.min(14, Math.max(4, argsText.split("\n").length + 1))}
                  className="w-full resize-y rounded-b-xl px-3 py-2 font-mono text-xs focus:outline-none"
                />
              </div>

              {output && (
                <div className="space-y-2">
                  <div className="flex gap-1">
                    {output.ui && (
                      <TabButton active={tab === "widget"} onClick={() => setTab("widget")}>
                        Widget
                      </TabButton>
                    )}
                    <TabButton active={tab === "result"} onClick={() => setTab("result")}>
                      Tool result {output.result?.isError ? "(error)" : ""}
                    </TabButton>
                  </div>
                  {tab === "widget" && output.ui ? (
                    <WidgetFrame orgId={org.id} url={BASE + server} ui={output.ui} args={output.args} result={output.result} onWire={addWire} />
                  ) : (
                    <pre className="max-h-[60vh] overflow-auto rounded-xl bg-console p-4 text-xs text-console-ink">
                      {JSON.stringify(output.result, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* Wire */}
      <aside className="hidden w-[24rem] shrink-0 flex-col border-l border-line bg-surface lg:flex xl:w-[30rem]">
        <div className="flex items-start justify-between gap-2 px-4 pb-1 pt-4">
          <div>
            <h2 className="text-[17px] font-semibold leading-tight">Wire</h2>
            <div className="text-xs text-ink-3">Every MCP call this session · tokens masked</div>
          </div>
          <button onClick={() => setWire([])} className="rounded-lg border border-line px-2.5 py-1 text-xs font-medium hover:bg-tint">
            Clear
          </button>
        </div>
        <div className="min-h-0 flex-1">
          <WirePanel wire={wire} highlightTurn={null} title={`mcp_${server ?? "none"}`} />
        </div>
      </aside>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl px-3 py-1.5 text-xs ${active ? "bg-ink text-surface" : "bg-surface text-ink-2 ring-1 ring-line hover:bg-tint"}`}
    >
      {children}
    </button>
  );
}
