import type { WireEntry } from "./types.ts";

export interface StepTiming {
  label: string;
  startMs: number; // on Salesforce's clock, from when it received the request
  durationMs: number | null; // null when nothing followed it
}

export interface TurnStats {
  turn: number | null;
  sfProcessingMs: number | null; // last event timestamp - originEventId
  totalMs: number | null; // our measured request time
  networkMs: number | null; // totalMs - sfProcessingMs
  firstTextMs: number | null; // our clock, from sending the request
  steps: StepTiming[];
  contentSafe: boolean | null; // null when no reply said
  citedSources: number;
  traceId: string | null;
  planId: string | null;
  requestId: string | null;
}

type Msg = Record<string, any>;
type Ev = { timestamp?: number; originEventId?: string; traceId?: string; message?: Msg };

const TOOL_BATCH = "propertyType/search__toolBatch";
const AGENT_MESSAGE = "propertyType/search__agentMessage";

// Computes one Agent API stream's timings and trust signals from its wire entry.
export function turnStats(w: WireEntry): TurnStats {
  const events = (w.streamEvents ?? []).map((e) => ({ t: e.t, event: e.event, d: (e.data ?? {}) as Ev }));
  const origin = events.map((e) => parseInt(e.d.originEventId ?? "", 10)).find((n) => Number.isFinite(n)) ?? null;
  const sfT = (d: Ev) => (origin !== null && typeof d.timestamp === "number" ? d.timestamp - origin : null);

  const sfTimes = events.map((e) => sfT(e.d)).filter((n): n is number => n !== null);
  const sfProcessingMs = sfTimes.length ? Math.max(...sfTimes) : null;
  const totalMs = w.durationMs ?? null;

  const firstText = events.find(({ event, d }) => {
    const m = d.message ?? {};
    return event === "TEXT_CHUNK" || event === "INFORM" || (m.type === "LightningChunk" && m.lightningType === AGENT_MESSAGE);
  });

  // A step lasts until the next event that isn't part of it (the next step, text, or the end of the turn).
  const steps: StepTiming[] = [];
  let batchOpen = false;
  for (const { d } of events) {
    const m = d.message ?? {};
    const t = sfT(d);
    if (t === null) continue;
    const isBatch = m.type === "LightningChunk" && m.lightningType === TOOL_BATCH;
    if (isBatch && batchOpen) continue;
    const open = steps.at(-1);
    if (open && open.durationMs === null) open.durationMs = t - open.startMs;
    batchOpen = isBatch;
    if (m.type === "ProgressIndicator") steps.push({ label: String(m.message || m.indicatorType || "Working"), startMs: t, durationMs: null });
    else if (isBatch) steps.push({ label: "Tool calls (streamed)", startMs: t, durationMs: null });
  }

  const informs = events.filter((e) => e.event === "INFORM").map((e) => e.d.message ?? {});
  const safety = informs.map((m) => m.isContentSafe).filter((v): v is boolean => typeof v === "boolean");

  return {
    turn: w.turn,
    sfProcessingMs,
    totalMs,
    networkMs: sfProcessingMs !== null && totalMs !== null ? Math.max(0, totalMs - sfProcessingMs) : null,
    firstTextMs: firstText?.t ?? null,
    steps,
    contentSafe: safety.length ? safety.every(Boolean) : null,
    citedSources: informs.reduce((n, m) => n + (Array.isArray(m.citedReferences) ? m.citedReferences.length : 0), 0),
    traceId: events.find((e) => e.d.traceId)?.d.traceId ?? null,
    planId: informs.map((m) => m.planId).find((p) => typeof p === "string" && p) ?? null,
    requestId: w.responseHeaders?.["x-request-id"] ?? null,
  };
}
