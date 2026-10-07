import { useState } from "react";
import { ChevronRight, Copy, Download } from "lucide-react";
import type { WireEntry } from "../../../shared/types";

type Filter = "all" | "requests" | "stream" | "errors";

const isError = (w: WireEntry) => Boolean(w.error) || (w.status !== undefined && w.status >= 400);

// Reconstructs a runnable curl; the token and client secret stay placeholders.
function toCurl(w: WireEntry): string {
  const lines = [`curl -X ${w.method} '${w.url}'`];
  for (const [k, v] of Object.entries(w.requestHeaders)) {
    lines.push(`  -H '${k}: ${/^authorization$/i.test(k) ? "Bearer $TOKEN" : v}'`);
  }
  if (w.requestBody !== undefined) {
    const isForm = /x-www-form-urlencoded/.test(w.requestHeaders["Content-Type"] ?? "");
    const body = isForm
      ? new URLSearchParams(
          Object.entries(w.requestBody as Record<string, string>).map(([k, v]) => [k, k === "client_secret" ? "$CLIENT_SECRET" : v]),
        ).toString()
      : JSON.stringify(w.requestBody);
    lines.push(`  --data '${body}'`);
  }
  return lines.join(" \\\n");
}

function shortPath(url: string) {
  try {
    const u = new URL(url);
    return `${u.host.split(".")[0]}${decodeURIComponent(u.pathname)}${u.search ? "?…" : ""}`;
  } catch {
    return url;
  }
}

export function WirePanel({ wire, highlightTurn, title }: { wire: WireEntry[]; highlightTurn: number | null; title: string }) {
  const [filter, setFilter] = useState<Filter>("all");
  const shown = wire.filter((w) =>
    filter === "all" ? true : filter === "errors" ? isError(w) : filter === "stream" ? Boolean(w.streamEvents) : !w.streamEvents,
  );

  const download = () => {
    const blob = new Blob([JSON.stringify(wire, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${title.replace(/[^a-z0-9]+/gi, "_").slice(0, 40)}_wire.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-slate-200 px-3 py-2">
        {(["all", "requests", "stream", "errors"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-md px-2 py-1 text-xs capitalize ${filter === f ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100"}`}
          >
            {f}
          </button>
        ))}
        <span className="ml-auto text-xs text-slate-400">{wire.length} calls</span>
        <button onClick={download} title="Download JSON" className="p-1 text-slate-500 hover:text-slate-800">
          <Download size={14} />
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
        {shown.length === 0 && <p className="p-4 text-center text-xs text-slate-400">No calls yet.</p>}
        {shown.map((w) => (
          <WireRow key={w.id} entry={w} highlighted={highlightTurn !== null && w.turn === highlightTurn} />
        ))}
      </div>
    </div>
  );
}

function WireRow({ entry: w, highlighted }: { entry: WireEntry; highlighted: boolean }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const status = w.error ? "ERR" : w.status ?? "…";
  const statusColor = isError(w) ? "bg-red-100 text-red-700" : w.status ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500";

  const copy = async () => {
    await navigator.clipboard.writeText(toCurl(w));
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className={`rounded-lg border bg-white text-xs ${highlighted ? "border-sky-400 ring-2 ring-sky-200" : "border-slate-200"}`}>
      <button onClick={() => setOpen(!open)} className="w-full px-2.5 py-2 text-left">
        <div className="flex items-center gap-2">
          <ChevronRight size={14} className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`} />
          <span className="shrink-0 font-mono font-semibold text-slate-700">{w.method}</span>
          <span className="min-w-0 flex-1 break-words font-medium text-slate-800">
            {w.label}
            {w.turn !== null && <span className="ml-1.5 whitespace-nowrap text-slate-400">· turn {w.turn}</span>}
          </span>
          {w.streamEvents && <span className="shrink-0 whitespace-nowrap text-[10px] text-slate-500">{w.streamEvents.length} ev</span>}
          <span className={`shrink-0 rounded px-1.5 py-0.5 font-mono ${statusColor}`}>{status}</span>
          <span className="shrink-0 whitespace-nowrap text-right text-slate-400">
            {w.durationMs !== undefined ? `${w.durationMs}ms` : "…"}
          </span>
        </div>
        <div className="mt-0.5 break-all pl-[22px] font-mono text-[10px] text-slate-500">{shortPath(w.url)}</div>
      </button>
      {open && (
        <div className="space-y-2 border-t border-slate-100 px-2.5 py-2">
          <div className="flex items-center justify-between">
            <span className="break-all font-mono text-[10px] text-slate-500">{w.url}</span>
            <button onClick={copy} className="ml-2 flex shrink-0 items-center gap-1 rounded border border-slate-200 px-1.5 py-0.5 hover:bg-slate-50">
              <Copy size={11} /> {copied ? "Copied" : "curl"}
            </button>
          </div>
          <Block title="Request headers" value={w.requestHeaders} />
          {w.requestBody !== undefined && <Block title="Request body" value={w.requestBody} />}
          {w.responseHeaders && <Block title="Response headers" value={w.responseHeaders} collapsed />}
          {w.responseBody !== undefined && <Block title="Response body" value={w.responseBody} />}
          {w.error && <Block title="Error" value={w.error} />}
          {w.streamEvents && (
            <div>
              <div className="mb-1 font-semibold text-slate-600">Stream events</div>
              <div className="space-y-0.5">
                {w.streamEvents.map((e, i) => (
                  <StreamEventRow key={i} t={e.t} event={e.event} data={e.data} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StreamEventRow({ t, event, data }: { t: number; event: string; data: unknown }) {
  const [open, setOpen] = useState(false);
  const m = (data as { message?: Record<string, unknown> })?.message ?? {};
  const preview = String(m.value ?? m.message ?? "").replace(/\s+/g, " ").slice(0, 70);
  return (
    <div className="rounded bg-slate-50">
      <button onClick={() => setOpen(!open)} className="flex w-full items-baseline gap-2 px-1.5 py-0.5 text-left font-mono text-[10px]">
        <span className="w-12 shrink-0 text-right text-slate-400">+{(t / 1000).toFixed(2)}s</span>
        <span className="shrink-0 font-semibold text-violet-700">{String(m.type ?? event)}</span>
        <span className="truncate text-slate-600">{preview}</span>
      </button>
      {open && <pre className="overflow-x-auto px-2 pb-1.5 text-[10px] text-slate-700">{JSON.stringify(data, null, 2)}</pre>}
    </div>
  );
}

function Block({ title, value, collapsed }: { title: string; value: unknown; collapsed?: boolean }) {
  return (
    <details open={!collapsed}>
      <summary className="cursor-pointer font-semibold text-slate-600">{title}</summary>
      <pre className="mt-1 max-h-72 overflow-auto rounded bg-slate-900 p-2 text-[10px] leading-relaxed text-slate-100">
        {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}
