import { useState } from "react";
import { ArrowDownWideNarrow, ArrowUpNarrowWide, ChevronRight, Copy, Download } from "lucide-react";
import type { WireEntry } from "../../../shared/types";

type Filter = "all" | "requests" | "stream" | "errors";
type Order = "desc" | "asc";

const ORDER_KEY = "afd360.wireOrder";
const time = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

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
    // Drop the host and common API prefixes, shorten ids: /sessions/01a11734…/messages/stream reads at a glance.
    const path = decodeURIComponent(u.pathname)
      .replace(/^\/(einstein\/ai-agent\/v1|platform\/mcp\/v1|services\/data\/v[\d.]+)/, "")
      .replace(/[0-9a-f]{8}-[0-9a-f-]{27}|\b[0-9A-Za-z]{18}\b/g, (id) => `${id.slice(0, 8)}…`);
    return `${path || "/"}${u.search ? "?…" : ""}`;
  } catch {
    return url;
  }
}

export function WirePanel({ wire, highlightTurn, title }: { wire: WireEntry[]; highlightTurn: number | null; title: string }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [order, setOrder] = useState<Order>(() => (localStorage.getItem(ORDER_KEY) === "asc" ? "asc" : "desc"));
  const toggleOrder = () => {
    const next = order === "desc" ? "asc" : "desc";
    setOrder(next);
    localStorage.setItem(ORDER_KEY, next);
  };
  const shown = wire
    .filter((w) =>
      filter === "all" ? true : filter === "errors" ? isError(w) : filter === "stream" ? Boolean(w.streamEvents) : !w.streamEvents,
    )
    // Sort by when each call started; ISO timestamps compare correctly as strings.
    .sort((a, b) => (order === "desc" ? b.startedAt.localeCompare(a.startedAt) : a.startedAt.localeCompare(b.startedAt)));

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
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 pb-3 pt-2">
        <div className="inline-flex gap-0.5 rounded-[10px] bg-tint p-[3px]">
          {(["all", "requests", "stream", "errors"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold capitalize ${
                filter === f ? "bg-surface text-ink shadow-card" : "text-ink-2 hover:text-ink"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <span className="ml-auto font-mono text-xs text-ink-3">{wire.length} calls</span>
        <button
          onClick={toggleOrder}
          title={order === "desc" ? "Newest first — click for oldest first" : "Oldest first — click for newest first"}
          className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-ink-2 hover:bg-tint"
        >
          {order === "desc" ? <ArrowDownWideNarrow size={14} /> : <ArrowUpNarrowWide size={14} />}
          {order === "desc" ? "Newest" : "Oldest"}
        </button>
        <button onClick={download} title="Download JSON" className="rounded-lg p-1.5 text-ink-3 hover:bg-tint hover:text-ink">
          <Download size={14} />
        </button>
        <div className="flex w-full gap-4 text-xs text-ink-2">
          <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-[3px] border border-sent-line bg-sent-chip" />Sent to Salesforce</span>
          <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-[3px] border border-recv-line bg-recv" />From Salesforce</span>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-ground p-3">
        {shown.length === 0 && <p className="p-6 text-center text-sm text-ink-3">No calls yet.</p>}
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
  const statusColor = isError(w) ? "text-err" : w.status ? "text-ok" : "text-ink-3";

  const copy = async () => {
    await navigator.clipboard.writeText(toCurl(w));
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div
      className={`overflow-hidden rounded-xl border bg-surface text-xs transition-shadow ${
        highlighted ? "border-ink-3 shadow-lift" : open ? "border-line shadow-card" : "border-line"
      }`}
    >
      <button onClick={() => setOpen(!open)} className="grid w-full grid-cols-[64px_minmax(0,1fr)_auto] items-start gap-2.5 px-3 py-2.5 text-left">
        <time dateTime={w.startedAt} title={new Date(w.startedAt).toLocaleString()} className="font-mono text-xs leading-[1.6] text-ink-3">
          {time(w.startedAt)}
        </time>
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <ChevronRight size={13} className={`-mr-1 shrink-0 text-ink-3 transition-transform ${open ? "rotate-90" : ""}`} />
            <span className="break-words text-sm font-semibold text-ink">{w.label.replace(/ \(stream\)$/, "")}</span>
            <span
              className={`rounded-full px-2 py-0.5 font-mono text-xs font-semibold ${
                w.streamEvents ? "border border-recv-line bg-recv text-recv-ink" : "bg-sent-chip text-sent-ink"
              }`}
            >
              {w.streamEvents ? `stream · ${w.streamEvents.length} ev` : w.method}
            </span>
          </span>
          <span className="mt-0.5 block truncate font-mono text-xs text-ink-3" title={w.url}>
            {shortPath(w.url)}
            {w.turn !== null && ` · turn ${w.turn}`}
          </span>
        </span>
        <span className="text-right font-mono text-xs leading-[1.6]">
          <span className={`block font-semibold ${statusColor}`}>{status}</span>
          <span className="block whitespace-nowrap text-ink-3">{w.durationMs !== undefined ? `${(w.durationMs / 1000).toFixed(1)}s` : "…"}</span>
        </span>
      </button>
      {open && (
        <div className="space-y-2 px-2.5 pb-2.5">
          <div className="flex items-center justify-between gap-2 px-0.5">
            <span className="break-all font-mono text-xs text-ink-3">{w.url}</span>
            <button onClick={copy} className="flex shrink-0 items-center gap-1 rounded-lg border border-line px-2 py-0.5 font-medium text-ink-2 hover:bg-tint">
              <Copy size={11} /> {copied ? "Copied" : "curl"}
            </button>
          </div>
          <Side direction="out" label={`→ Sent to Salesforce · ${w.method}`}>
            <Block title="Request headers" value={w.requestHeaders} />
            {w.requestBody !== undefined && <Block title="Request body" value={w.requestBody} />}
          </Side>
          <Side
            direction="in"
            label={`← From Salesforce · ${w.error ? "error" : (w.status ?? "pending")}${w.durationMs !== undefined ? ` · ${w.durationMs}ms` : ""}`}
          >
            {w.responseHeaders && <Block title="Response headers" value={w.responseHeaders} collapsed />}
            {w.responseBody !== undefined && <Block title="Response body" value={w.responseBody} />}
            {w.error && <Block title="Error" value={w.error} />}
            {w.streamEvents && (
              <div>
                <div className="mb-1 font-semibold">Stream events ({w.streamEvents.length})</div>
                <div className="space-y-0.5">
                  {w.streamEvents.map((e, i) => (
                    <StreamEventRow key={i} t={e.t} event={e.event} data={e.data} />
                  ))}
                </div>
              </div>
            )}
            {!w.responseHeaders && !w.error && <div className="opacity-80">Waiting for response…</div>}
          </Side>
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
    <div className="rounded-md bg-surface/70">
      <button onClick={() => setOpen(!open)} className="flex w-full items-baseline gap-2 px-1.5 py-0.5 text-left font-mono text-xs">
        <span className="w-14 shrink-0 text-right opacity-75">+{(t / 1000).toFixed(2)}s</span>
        <span className="shrink-0 font-semibold">{String(m.type ?? event)}</span>
        <span className="truncate text-ink-2">{preview}</span>
      </button>
      {open && <pre className="overflow-x-auto px-2 pb-1.5 font-mono text-xs text-ink">{JSON.stringify(data, null, 2)}</pre>}
    </div>
  );
}

// Separates what we sent (the theme's "sent" tint) from what Salesforce returned (the "received" tint), as on the chat cards.
function Side({ direction, label, children }: { direction: "out" | "in"; label: string; children: React.ReactNode }) {
  const tone = direction === "out" ? "border-sent-line bg-sent text-sent-ink" : "border-recv-line bg-recv text-recv-ink";
  return (
    <div className={`min-w-0 space-y-2 rounded-[10px] border p-2.5 ${tone}`}>
      <div className="text-xs font-semibold">{label}</div>
      {children}
    </div>
  );
}

function Block({ title, value, collapsed }: { title: string; value: unknown; collapsed?: boolean }) {
  return (
    <details open={!collapsed}>
      <summary className="cursor-pointer font-medium">{title}</summary>
      <pre className="mt-1 max-h-72 overflow-auto rounded-lg bg-console p-2.5 font-mono text-xs leading-relaxed text-console-ink">
        {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}
