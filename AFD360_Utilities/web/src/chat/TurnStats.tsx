import { useCallback, useEffect, useState } from "react";
import { Copy, RotateCcw } from "lucide-react";
import { api } from "../api";
import type { TurnUsage, WireEntry } from "../../../shared/types";
import { streamsByTurn, turnStats } from "../../../shared/turnStats";
import { ProviderIcon } from "./ProviderIcon";

const secs = (ms: number | null) => (ms === null ? "—" : `${(ms / 1000).toFixed(2)}s`);

const sum = (xs: (number | null)[]) => (xs.some((x) => x !== null) ? xs.reduce<number>((a, x) => a + (x ?? 0), 0) : null);

export function TurnStats({
  conversationId,
  wire,
  highlightTurn,
  onWire,
}: {
  conversationId: string;
  wire: WireEntry[];
  highlightTurn: number | null;
  onWire: (entries: WireEntry[]) => void;
}) {
  // The hovered message's turn, else the turn picked in All turns, else the latest turn.
  const [pinned, setPinned] = useState<number | null>(null);
  useEffect(() => setPinned(null), [conversationId]);
  const rows = streamsByTurn(wire);
  const shownTurn = highlightTurn ?? pinned;
  const entry = rows.find((w) => shownTurn !== null && w.turn === shownTurn) ?? rows.at(-1);
  if (!entry) return <p className="p-6 text-center text-sm text-ink-3">Stats appear once the agent answers a turn.</p>;
  const s = turnStats(entry);

  return (
    <section className="h-full overflow-y-auto px-4 py-3 text-xs">
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-ink-3">
          {s.turn !== null ? `turn ${s.turn}` : ""}
          {entry.durationMs === undefined ? " · running" : ""}
        </span>
        {pinned !== null && highlightTurn === null && (
          <button onClick={() => setPinned(null)} className="rounded-md px-1.5 text-ink-3 hover:bg-tint hover:text-ink">
            Show latest
          </button>
        )}
        <span className="ml-auto font-mono text-ink-2">{secs(s.totalMs)}</span>
      </div>
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

        {s.traceId && entry.durationMs !== undefined && <UsageRow conversationId={conversationId} traceId={s.traceId} turn={s.turn} onWire={onWire} />}

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

        <AllTurns
          conversationId={conversationId}
          rows={rows}
          shownTurn={s.turn}
          onPick={(t) => setPinned((p) => (p === t ? null : t))}
          onWire={onWire}
        />
      </div>
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
const pollStarted = new Map<string, number>(); // traceId -> when we first found no rows
const pending = new Map<string, Promise<TurnUsage>>(); // one lookup per trace at a time, so the wire logs no duplicates
const POLL_EVERY_MS = 30_000;
const POLL_FOR_MS = 10 * 60_000;

function lookupUsage(conversationId: string, traceId: string, turn: number | null, onWire: (entries: WireEntry[]) => void) {
  let p = pending.get(traceId);
  if (!p) {
    p = api
      .usage(conversationId, traceId, turn)
      .then(({ usage, wire }) => {
        onWire(wire);
        if (usage.rows > 0) usageCache.set(traceId, usage);
        return usage;
      })
      .finally(() => pending.delete(traceId));
    pending.set(traceId, p);
  }
  return p;
}

// Tokens per turn from Data 360 usage telemetry, which lands minutes after the turn.
function UsageRow({
  conversationId,
  traceId,
  turn,
  onWire,
}: {
  conversationId: string;
  traceId: string;
  turn: number | null;
  onWire: (entries: WireEntry[]) => void;
}) {
  const [usage, setUsage] = useState<TurnUsage | null>(() => usageCache.get(traceId) ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    lookupUsage(conversationId, traceId, turn, onWire)
      .then(setUsage)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [conversationId, traceId, turn, onWire]);

  useEffect(() => {
    const cached = usageCache.get(traceId);
    setUsage(cached ?? null);
    if (!cached) load();
  }, [traceId, load]);

  // While Data 360 has no rows yet, check again every 30s for up to 10 minutes.
  const waiting = !!usage && usage.rows === 0 && !error;
  if (waiting && !pollStarted.has(traceId)) pollStarted.set(traceId, Date.now());
  const polling = waiting && Date.now() - pollStarted.get(traceId)! < POLL_FOR_MS;
  useEffect(() => {
    if (!polling || loading) return;
    const t = setTimeout(load, POLL_EVERY_MS);
    return () => clearTimeout(t);
  }, [polling, loading, load]);

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
        <p className="text-ink-3">
          Not in Data 360 yet. Usage telemetry usually lands within minutes of the turn.{" "}
          {polling ? "Checking every 30s." : "Stopped checking after 10 minutes."}
        </p>
      ) : (
        <div className="space-y-1">
          <p>
            <span className="font-mono text-sm font-semibold text-ink">{fmt(usage.totalTokens)}</span>
            <span className="text-ink-3"> tokens · {fmt(usage.inputTokens)} in / {fmt(usage.outputTokens)} out · {usage.llmCalls} LLM calls</span>
          </p>
          <ModelList models={usage.models} />
        </div>
      )}
    </div>
  );
}

function ModelList({ models }: { models: TurnUsage["models"] }) {
  return (
    <ul className="space-y-0.5">
      {models.map((m) => (
        <li key={m.model} className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] items-center gap-2 font-mono">
          <ProviderIcon model={m.model} />
          <span className="truncate text-ink" title={m.model}>{m.model}</span>
          <span className="text-ink-3">{m.calls}×</span>
          <span className="text-right text-ink-3" title="Input / output tokens">
            {fmt(m.inputTokens)} / {fmt(m.outputTokens)}
          </span>
          <span className="w-16 text-right text-ink-2">{fmt(m.totalTokens)}</span>
        </li>
      ))}
    </ul>
  );
}

// Calls and tokens per model, summed over turns, most tokens first.
function sumModels(usages: TurnUsage[]): TurnUsage["models"] {
  const by = new Map<string, TurnUsage["models"][number]>();
  for (const m of usages.flatMap((u) => u.models)) {
    const t = by.get(m.model) ?? { model: m.model, calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    by.set(m.model, {
      model: m.model,
      calls: t.calls + m.calls,
      inputTokens: t.inputTokens + m.inputTokens,
      outputTokens: t.outputTokens + m.outputTokens,
      totalTokens: t.totalTokens + m.totalTokens,
    });
  }
  return [...by.values()].sort((a, b) => b.totalTokens - a.totalTokens);
}

const looked = new Set<string>(); // traces All turns has already looked up once

// Every turn at a glance: totals across the conversation, then one row per turn; a row shows that turn above.
function AllTurns({
  conversationId,
  rows,
  shownTurn,
  onPick,
  onWire,
}: {
  conversationId: string;
  rows: WireEntry[];
  shownTurn: number | null;
  onPick: (turn: number | null) => void;
  onWire: (entries: WireEntry[]) => void;
}) {
  const all = rows.map((w) => ({ w, s: turnStats(w) }));
  // Token totals need each finished turn's Data 360 usage: look each up once. The shown turn keeps re-checking above.
  useEffect(() => {
    for (const { w, s } of all) {
      if (!s.traceId || w.durationMs === undefined || usageCache.has(s.traceId) || looked.has(s.traceId)) continue;
      looked.add(s.traceId);
      lookupUsage(conversationId, s.traceId, s.turn, onWire).catch(() => {});
    }
  });
  if (all.length < 2) return null;

  const usageOf = (s: (typeof all)[number]["s"]) => (s.traceId ? usageCache.get(s.traceId) : undefined);
  const known = all.map(({ s }) => usageOf(s)).filter((u) => !!u);
  const tokens = known.reduce((n, u) => n + u.totalTokens, 0);
  const cols = "grid grid-cols-[2.5rem_repeat(4,minmax(0,1fr))] items-baseline gap-2";

  return (
    <div className="border-t border-line pt-3">
      <div className="flex items-center gap-1.5">
        <span className="font-semibold text-ink-2">All turns</span>
        <span className="font-mono text-ink-3">{all.length} turns</span>
        <span className="ml-auto font-mono text-ink-2">{secs(sum(all.map(({ s }) => s.totalMs)))}</span>
      </div>
      <dl className="mt-2 grid grid-cols-3 gap-2">
        <Metric label="Salesforce" value={secs(sum(all.map(({ s }) => s.sfProcessingMs)))} hint="Salesforce's processing time, summed over every turn" />
        <Metric label="Network" value={secs(sum(all.map(({ s }) => s.networkMs)))} hint="Network overhead, summed over every turn" />
        <Metric
          label="Tokens"
          value={known.length ? fmt(tokens) : "—"}
          hint={`Data 360 usage, summed over the ${known.length} of ${all.length} turns it has telemetry for`}
        />
      </dl>
      {known.length > 0 && known.length < all.length && (
        <p className="mt-1 text-ink-3">Tokens cover {known.length} of {all.length} turns; the rest aren't in Data 360 yet.</p>
      )}
      {known.length > 0 && (
        <div className="mt-2 space-y-1">
          <p className="text-ink-3">
            <span className="font-mono font-semibold text-ink">{fmt(known.reduce((n, u) => n + u.inputTokens, 0))}</span> in /{" "}
            <span className="font-mono font-semibold text-ink">{fmt(known.reduce((n, u) => n + u.outputTokens, 0))}</span> out ·{" "}
            {known.reduce((n, u) => n + u.llmCalls, 0)} LLM calls
          </p>
          <ModelList models={sumModels(known)} />
        </div>
      )}
      <div className="mt-2">
        <div className={`${cols} px-1.5 pb-1 text-ink-3`}>
          <span>Turn</span>
          <span className="text-right">Total</span>
          <span className="text-right">Salesforce</span>
          <span className="text-right">First text</span>
          <span className="text-right">Tokens</span>
        </div>
        {all.map(({ w, s }) => {
          const u = usageOf(s);
          const shown = s.turn === shownTurn;
          return (
            <button
              key={w.id}
              onClick={() => onPick(s.turn)}
              aria-pressed={shown}
              title={`Show turn ${s.turn ?? "—"} above`}
              className={`${cols} w-full rounded-md px-1.5 py-0.5 text-left font-mono hover:bg-tint ${shown ? "bg-tint font-semibold text-ink" : "text-ink-2"}`}
            >
              <span>{s.turn ?? "—"}</span>
              <span className="text-right">{w.durationMs === undefined ? "running" : secs(s.totalMs)}</span>
              <span className="text-right">{secs(s.sfProcessingMs)}</span>
              <span className="text-right">{secs(s.firstTextMs)}</span>
              <span className="text-right">{u ? fmt(u.totalTokens) : "—"}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
