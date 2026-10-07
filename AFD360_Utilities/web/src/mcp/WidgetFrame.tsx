import { useEffect, useRef, useState } from "react";
import { AppBridge, PostMessageTransport } from "@modelcontextprotocol/ext-apps/app-bridge";
import { api, type McpUi } from "../api";
import type { WireEntry } from "../../../shared/types";

export interface WidgetLogEntry {
  t: number;
  direction: "host→app" | "app→host";
  text: string;
}

// Sandbox proxy lives on its own origin (server/sandbox.ts) — same hostname, different port.
const sandboxUrl = (csp: McpUi["csp"]) =>
  `${location.protocol}//${location.hostname}:3002/sandbox.html?csp=${encodeURIComponent(JSON.stringify(csp ?? {}))}`;

/**
 * Renders an MCP Apps UI resource (e.g. an HXL widget) the way MCP Apps hosts do:
 * sandbox proxy iframe → AppBridge over postMessage → ui/initialize → tool-input → tool-result.
 * Widget-initiated tools/call and resources/read are proxied through our server.
 */
export function WidgetFrame({
  orgId,
  url,
  ui,
  args,
  result,
  onWire,
}: {
  orgId: string;
  url: string;
  ui: McpUi;
  args: Record<string, unknown>;
  result: any;
  onWire: (entries: WireEntry[]) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(240);
  const [status, setStatus] = useState("Loading sandbox…");
  const [log, setLog] = useState<WidgetLogEntry[]>([]);

  useEffect(() => {
    const t0 = Date.now();
    const note = (direction: WidgetLogEntry["direction"], text: string) =>
      setLog((l) => [...l, { t: Date.now() - t0, direction, text }]);
    const iframe = document.createElement("iframe");
    iframe.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms");
    iframe.style.cssText = "width:100%;height:100%;border:0;background:transparent";
    let bridge: AppBridge | null = null;
    let disposed = false;

    const onReady = async (ev: MessageEvent) => {
      if (ev.source !== iframe.contentWindow || ev.data?.method !== "ui/notifications/sandbox-proxy-ready") return;
      removeEventListener("message", onReady);
      note("app→host", "ui/notifications/sandbox-proxy-ready");
      bridge = new AppBridge(
        null,
        { name: "AFD360 Utilities", version: "0.1.0" },
        { openLinks: {}, serverTools: {}, serverResources: {}, logging: {} },
        {
          hostContext: {
            theme: "light",
            platform: "web",
            displayMode: "inline",
            availableDisplayModes: ["inline"],
            containerDimensions: { maxHeight: 2400 },
            locale: navigator.language,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
        },
      );
      // All handlers must be registered before connect().
      bridge.oninitialized = () => {
        note("app→host", "ui/notifications/initialized");
        setStatus("Live");
        bridge!.sendToolInput({ arguments: args });
        note("host→app", "ui/notifications/tool-input");
        bridge!.sendToolResult(result);
        note("host→app", "ui/notifications/tool-result");
      };
      bridge.onsizechange = ({ height: h }) => {
        if (typeof h === "number" && h > 0) setHeight(Math.min(h, 2400));
        note("app→host", `ui/notifications/size-changed (${h}px)`);
      };
      bridge.oncalltool = async (params) => {
        note("app→host", `tools/call ${params.name}`);
        const r = await api.mcpAppCall(orgId, url, params.name, params.arguments ?? {}).catch((e) => {
          onWire(e.wire ?? []);
          throw e;
        });
        onWire(r.wire);
        return r.result;
      };
      bridge.onreadresource = async (params) => {
        note("app→host", `resources/read ${params.uri}`);
        const r = await api.mcpRead(orgId, url, params.uri);
        onWire(r.wire);
        return r.result;
      };
      bridge.onopenlink = async ({ url: link }) => {
        note("app→host", `ui/open-link ${link}`);
        window.open(link, "_blank", "noopener,noreferrer");
        return {};
      };
      bridge.onmessage = async (params) => {
        note("app→host", `ui/message ${JSON.stringify(params.content).slice(0, 120)}`);
        return {};
      };
      bridge.onupdatemodelcontext = async () => {
        note("app→host", "ui/update-model-context");
        return {};
      };
      bridge.onloggingmessage = (p) => note("app→host", `log [${p.level}] ${JSON.stringify(p.data).slice(0, 120)}`);
      bridge.onrequestdisplaymode = async () => ({ mode: "inline" });

      await bridge.connect(new PostMessageTransport(iframe.contentWindow!, iframe.contentWindow!));
      if (disposed) return;
      await bridge.sendSandboxResourceReady({ html: ui.html, csp: ui.csp, permissions: ui.permissions });
      note("host→app", `ui/notifications/sandbox-resource-ready (${ui.html.length} bytes HTML)`);
      setStatus("Initializing widget…");
    };

    addEventListener("message", onReady);
    iframe.src = sandboxUrl(ui.csp);
    hostRef.current?.appendChild(iframe);

    return () => {
      disposed = true;
      removeEventListener("message", onReady);
      const b = bridge;
      // Give the widget a chance to clean up before the frame goes away.
      (b ? b.teardownResource({}).catch(() => {}) : Promise.resolve()).finally(() => {
        b?.close().catch(() => {});
        iframe.remove();
      });
    };
    // Re-mount only when a new result arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui, result]);

  return (
    <div className="space-y-2">
      <div className={`overflow-hidden rounded-xl bg-white ${ui.prefersBorder === false ? "" : "border border-slate-200 shadow-sm"}`}>
        <div ref={hostRef} style={{ height }} />
      </div>
      <details className="rounded-lg border border-slate-200 bg-white text-xs">
        <summary className="cursor-pointer px-3 py-2 text-slate-600">
          Widget bridge · <span className={status === "Live" ? "text-emerald-700" : "text-slate-500"}>{status}</span> ·{" "}
          {log.length} messages · <span className="font-mono">{ui.uri}</span>
        </summary>
        <div className="space-y-0.5 px-3 pb-2 font-mono text-[11px]">
          {log.map((l, i) => (
            <div key={i} className="flex gap-2">
              <span className="w-12 shrink-0 text-right text-slate-400">+{(l.t / 1000).toFixed(2)}s</span>
              <span className={`w-16 shrink-0 ${l.direction === "host→app" ? "text-sky-700" : "text-violet-700"}`}>{l.direction}</span>
              <span className="break-all text-slate-700">{l.text}</span>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
