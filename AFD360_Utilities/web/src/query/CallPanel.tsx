import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { WirePanel } from "../chat/WirePanel";
import { asCurl, asFetch, type RequestShape } from "./export";
import type { QueryStatus, WireEntry } from "../../../shared/types";

export interface Telemetry {
  status: QueryStatus | null;
  loaded: number; // rows in the grid so far
  elapsedMs: number | null; // our round trips, submit through the last page
  apiUsage: string | null; // sforce-limit-info api-usage=used/max
}

const n = (v: number | undefined) => (v === undefined ? "—" : v.toLocaleString());
const secs = (s: number | undefined) => (s === undefined ? "—" : s < 1 ? `${Math.round(s * 1000)} ms` : `${s.toFixed(2)} s`);

// sforce-limit-info: api-usage=5656/656610
export function apiUsageOf(entry: WireEntry | undefined): string | null {
  const v = entry?.responseHeaders?.["sforce-limit-info"];
  const m = v && /api-usage=(\d+)\/(\d+)/.exec(v);
  return m ? `${Number(m[1]).toLocaleString()} / ${Number(m[2]).toLocaleString()}` : null;
}

// The truncated first page as it came back, so the panel stays readable on a 5,000-row result.
function shortResponse(body: unknown) {
  if (!body || typeof body !== "object" || !Array.isArray((body as { data?: unknown }).data)) return body;
  const data = (body as { data: unknown[] }).data;
  return data.length <= 20 ? body : { ...body, data: [...data.slice(0, 20), `… ${data.length - 20} more rows`] };
}

interface Props {
  telemetry: Telemetry;
  submit: WireEntry | undefined; // the call behind the result on screen: the SQL submit or a REST read
  wire: WireEntry[];
}

export function CallPanel({ telemetry, submit, wire }: Props) {
  const [tab, setTab] = useState<"call" | "wire">("call");
  return (
    <aside className="hidden w-[24rem] shrink-0 flex-col border-l border-line bg-surface lg:flex xl:w-[28rem]">
      <div className="flex items-center gap-2 px-4 pb-2 pt-4">
        <h2 className="flex-1 text-[17px] font-semibold leading-tight">Query API</h2>
        <div className="inline-flex gap-0.5 rounded-[10px] bg-tint p-[3px]">
          {(["call", "wire"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              aria-pressed={tab === t}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${tab === t ? "bg-surface text-ink shadow-card" : "text-ink-2 hover:text-ink"}`}
            >
              {t === "call" ? "Call" : `Wire ${wire.length}`}
            </button>
          ))}
        </div>
      </div>
      {tab === "wire" ? (
        <div className="min-h-0 flex-1">
          <WirePanel wire={wire} highlightTurn={null} title="data360_query" />
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-6">
          <Tiles t={telemetry} />
          {submit ? <Request entry={submit} /> : <p className="text-sm text-ink-3">Run a query or send a read to see the call Data 360 receives.</p>}
          {submit?.responseBody !== undefined && (
            <Section title="Response" lane="recv" meta={`${submit.status ?? ""} · ${submit.durationMs ?? 0} ms`}>
              <Code text={JSON.stringify(shortResponse(submit.responseBody), null, 2)} />
            </Section>
          )}
        </div>
      )}
    </aside>
  );
}

// What Data 360 reports about the query, big enough to read on a shared screen.
function Tiles({ t }: { t: Telemetry }) {
  const s = t.status;
  const stale = s?.stalenessReasons ?? [];
  return (
    <div className="space-y-2">
      <dl className="grid grid-cols-3 gap-2">
        <Tile label="Rows" value={s ? `${n(t.loaded)}` : "—"} sub={s ? `of ${n(s.rowCount)}` : undefined} hint="Rows loaded into the grid, of the query's total rowCount" />
        <Tile label="Processed" value={n(s?.rowsProcessed)} hint="rowsProcessed: rows Data 360 scanned to answer" />
        <Tile label="Wall clock" value={secs(s?.wallClockTime)} sub={t.elapsedMs !== null ? `${(t.elapsedMs / 1000).toFixed(2)} s round trip` : undefined} hint="wallClockTime: Data 360's own execution time" />
      </dl>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-[10px] border border-line px-3 py-2 text-xs">
        <Row k="Status">
          {s ? (
            <span className={`inline-flex items-center gap-1.5 font-mono font-semibold ${s.completionStatus === "Running" ? "text-recv-ink" : "text-ok"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${s.completionStatus === "Running" ? "animate-pulse bg-live" : "bg-ok"}`} />
              {s.completionStatus} · {Math.round((s.progress ?? 0) * 100)}%
            </span>
          ) : (
            "—"
          )}
        </Row>
        <Row k="Chunks">{n(s?.chunkCount)}</Row>
        <Row k="API usage">{t.apiUsage ?? "—"}</Row>
        <Row k="Staleness">
          {stale.length ? (
            <span className="flex flex-wrap gap-1">
              {stale.map((r) => (
                <span key={r} className="rounded-full bg-recv px-2 font-sans font-semibold text-recv-ink">
                  {r}
                </span>
              ))}
            </span>
          ) : s ? (
            <span className="font-sans text-ink-3">none</span>
          ) : (
            "—"
          )}
        </Row>
        <Row k="Query id">{s?.queryId ? <span className="break-all">{s.queryId}</span> : "—"}</Row>
      </div>
    </div>
  );
}

function Tile({ label, value, sub, hint }: { label: string; value: string; sub?: string; hint: string }) {
  return (
    <div title={hint} className="rounded-xl border border-line bg-surface px-3 py-2.5">
      <dt className="text-xs font-semibold text-ink-3">{label}</dt>
      <dd className="mt-0.5 truncate font-mono text-xl font-semibold leading-tight text-ink">{value}</dd>
      {sub && <dd className="truncate text-xs text-ink-3">{sub}</dd>}
    </div>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-ink-3">{k}</dt>
      <dd className="min-w-0 font-mono text-ink">{children}</dd>
    </>
  );
}

function Request({ entry }: { entry: WireEntry }) {
  const [as, setAs] = useState<"json" | "curl" | "fetch">("json");
  const shape: RequestShape = { method: entry.method, url: entry.url, body: entry.requestBody };
  const text =
    as === "curl" ? asCurl(shape) : as === "fetch" ? asFetch(shape) : entry.requestBody === undefined ? `No body: a ${entry.method} carries its input in the URL.` : JSON.stringify(entry.requestBody, null, 2);
  const url = new URL(entry.url);
  return (
    <Section
      title="Request"
      lane="sent"
      meta={
        <span className="inline-flex gap-0.5 rounded-lg bg-tint p-0.5">
          {(["json", "curl", "fetch"] as const).map((k) => (
            <button key={k} onClick={() => setAs(k)} aria-pressed={as === k} className={`rounded-md px-2 py-0.5 text-xs font-semibold ${as === k ? "bg-surface text-ink shadow-card" : "text-ink-2"}`}>
              {k === "json" ? "Body" : k}
            </button>
          ))}
        </span>
      }
    >
      <div className="mb-2 break-all font-mono text-xs">
        <span className="mr-1.5 rounded bg-sent-chip px-1.5 py-0.5 font-semibold text-sent-ink">{entry.method}</span>
        <span className="text-ink-3">{url.origin}</span>
        <span className="font-semibold text-ink">{url.pathname}</span>
        <span className="text-sent-ink">{url.search}</span>
      </div>
      <Code text={text} />
    </Section>
  );
}

function Section({ title, lane, meta, children }: { title: string; lane: "sent" | "recv"; meta?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-1.5 flex items-center gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${lane === "sent" ? "bg-sent-chip text-sent-ink" : "bg-recv text-recv-ink"}`}>
          {lane === "sent" ? "→ " : "← "}
          {title}
        </span>
        <span className="ml-auto font-mono text-xs text-ink-3">{meta}</span>
      </div>
      {children}
    </section>
  );
}

function Code({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  return (
    <div className="relative">
      <pre className="max-h-[40vh] overflow-auto whitespace-pre-wrap break-all rounded-[10px] bg-console p-3 pr-9 font-mono text-xs text-console-ink">{text}</pre>
      <button onClick={copy} title="Copy" className="absolute right-1.5 top-1.5 rounded-md p-1 text-console-ink/70 hover:bg-white/10 hover:text-console-ink">
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </button>
    </div>
  );
}
