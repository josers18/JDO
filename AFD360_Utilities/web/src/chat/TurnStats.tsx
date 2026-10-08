import { useCallback, useEffect, useState } from "react";
import { ChevronRight, Copy, RotateCcw } from "lucide-react";
import { api } from "../api";
import type { TurnUsage, WireEntry } from "../../../shared/types";
import { turnStats } from "../../../shared/turnStats";

const OPEN_KEY = "afd360.turnStatsOpen";
const secs = (ms: number | null) => (ms === null ? "—" : `${(ms / 1000).toFixed(2)}s`);

// The hovered message's turn, else the latest turn: its last Agent API stream.
function pickStream(wire: WireEntry[], turn: number | null) {
  const streams = wire.filter((w) => w.streamEvents?.length && w.url.includes("/messages/stream"));
  const inTurn = turn === null ? [] : streams.filter((w) => w.turn === turn);
  const pool = inTurn.length ? inTurn : streams;
  return [...pool].sort((a, b) => a.startedAt.localeCompare(b.startedAt)).at(-1);
}

export function TurnStats({ orgId, wire, highlightTurn }: { orgId: string; wire: WireEntry[]; highlightTurn: number | null }) {
  const [open, setOpen] = useState(() => localStorage.getItem(OPEN_KEY) !== "0");
  const entry = pickStream(wire, highlightTurn);
  if (!entry) return null;
  const s = turnStats(entry);
  const toggle = () => {
    setOpen(!open);
    localStorage.setItem(OPEN_KEY, open ? "0" : "1");
  };

  return (
    <section className="border-b border-line px-4 py-2.5 text-xs">
      <button onClick={toggle} aria-expanded={open} className="flex w-full items-center gap-1.5 text-left">
        <ChevronRight size={13} className={`shrink-0 text-ink-3 transition-transform ${open ? "rotate-90" : ""}`} />
        <span className="text-sm font-semibold text-ink">Turn stats</span>
        <span className="font-mono text-ink-3">
          {s.turn !== null ? `turn ${s.turn}` : ""}
          {entry.durationMs === undefined ? " · running" : ""}
        </span>
        <span className="ml-auto font-mono text-ink-2">{secs(s.totalMs)}</span>
      </button>
      {open && (
        <div className="mt-2.5 space-y-3">
          <dl className="grid grid-cols-3 gap-2">
            <Metric label="Salesforce" value={secs(s.sfProcessingMs)} hint="Salesforce's processing time: last event timestamp minus originEventId" />
            <Metric label="Network" value={secs(s.networkMs)} hint="Our measured request time minus Salesforce's processing time" />
            <Metric label="First text" value={secs(s.firstTextMs)} hint="From sending the request to the first reply text arriving" />
          </dl>

          {s.steps.length > 0 && (
            <div>
              <div className="mb-1 font-semibold text-ink-2">Tool steps</div>
              <ol className="space-y-0.5">
                {s.steps.map((step, i) => (
                  <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-2 font-mono">
                    <span className="truncate font-sans text-ink" title={step.label}>{step.label}</span>
                    <span className="text-ink-3" title="Start, on Salesforce's clock">+{secs(step.startMs)}</span>
                    <span className="w-14 text-right text-ink-2">{secs(step.durationMs)}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {s.traceId && entry.durationMs !== undefined && <UsageRow orgId={orgId} traceId={s.traceId} />}

          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span>
              <span className="text-ink-3">Content safe </span>
              <span className={`font-semibold ${s.contentSafe === false ? "text-err" : s.contentSafe ? "text-ok" : "text-ink-3"}`}>
                {s.contentSafe === null ? "—" : s.contentSafe ? "Yes" : "Flagged"}
              </span>
            </span>
            <span>
              <span className="text-ink-3">Cited sources </span>
              <span className="font-semibold text-ink">{s.citedSources}</span>
            </span>
          </div>

          <div className="space-y-1">
            <IdRow label="traceId" value={s.traceId} />
            <IdRow label="planId" value={s.planId} />
            <IdRow label="x-request-id" value={s.requestId} />
          </div>
        </div>
      )}
    </section>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div title={hint} className="rounded-[10px] border border-line bg-surface px-2.5 py-1.5">
      <dt className="text-ink-3">{label}</dt>
      <dd className="font-mono text-sm font-semibold text-ink">{value}</dd>
    </div>
  );
}

function IdRow({ label, value }: { label: string; value: string | null }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)_auto] items-center gap-2 font-mono">
      <span className="text-ink-3">{label}</span>
      <span className="truncate text-ink" title={value ?? undefined}>{value ?? "—"}</span>
      <button
        onClick={copy}
        disabled={!value}
        title={`Copy ${label}`}
        className="flex items-center gap-1 rounded-lg border border-line px-2 py-0.5 font-sans font-medium text-ink-2 hover:bg-tint disabled:opacity-40"
      >
        <Copy size={11} /> {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

const fmt = (n: number) => n.toLocaleString();
const usageCache = new Map<string, TurnUsage>(); // traceId -> usage, once Data 360 has it

// Tokens per turn from Data 360 usage telemetry, which lands minutes after the turn.
function UsageRow({ orgId, traceId }: { orgId: string; traceId: string }) {
  const [usage, setUsage] = useState<TurnUsage | null>(() => usageCache.get(traceId) ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .usage(orgId, traceId)
      .then((u) => {
        if (u.rows > 0) usageCache.set(traceId, u);
        setUsage(u);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [orgId, traceId]);

  useEffect(() => {
    const cached = usageCache.get(traceId);
    setUsage(cached ?? null);
    if (!cached) load();
  }, [traceId, load]);

  const retry = (
    <button onClick={load} disabled={loading} title="Check Data 360 again" className="rounded-md p-0.5 text-ink-3 hover:bg-tint hover:text-ink disabled:opacity-40">
      <RotateCcw size={12} className={loading ? "animate-spin" : ""} />
    </button>
  );

  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5 font-semibold text-ink-2">
        Usage <span className="font-normal text-ink-3">(Data 360)</span>
        {(!usage || usage.rows === 0 || error) && retry}
      </div>
      {error ? (
        <p className="text-err">{error}</p>
      ) : !usage ? (
        <p className="text-ink-3">{loading ? "Looking up…" : "—"}</p>
      ) : usage.rows === 0 ? (
        <p className="text-ink-3">Not in Data 360 yet. Usage telemetry usually lands within minutes of the turn.</p>
      ) : (
        <div className="space-y-1">
          <p>
            <span className="font-mono text-sm font-semibold text-ink">{fmt(usage.totalTokens)}</span>
            <span className="text-ink-3"> tokens · {fmt(usage.inputTokens)} in / {fmt(usage.outputTokens)} out · {usage.llmCalls} LLM calls</span>
          </p>
          <ul className="space-y-0.5">
            {usage.models.map((m) => (
              <li key={m.model} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-2 font-mono">
                <span className="truncate text-ink" title={m.model}>{m.model}</span>
                <span className="text-ink-3">{m.calls}×</span>
                <span className="w-16 text-right text-ink-2">{fmt(m.totalTokens)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
