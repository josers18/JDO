import { IdRow, Metric } from "../chat/TurnStats";
import { formatBytes, statsByCell, type CellStats, type QueryStats } from "../../../shared/notebookStats";
import type { WireEntry } from "../../../shared/types";

const secs = (ms: number | null) => (ms === null ? "—" : `${(ms / 1000).toFixed(2)}s`);
const count = (n: number | null) => (n === null ? "—" : n.toLocaleString());
const bytes = (n: number | null) => (n === null ? "—" : formatBytes(n));
const sum = (xs: (number | null)[]) => (xs.some((x) => x !== null) ? xs.reduce<number>((a, x) => a + (x ?? 0), 0) : null);

// The Notebook's Stats tab: telemetry for the selected cell, read from the connector calls it made.
export function CellStatsPanel({ wire, shownTurn, onPick }: { wire: WireEntry[]; shownTurn: number | null; onPick: (turn: number) => void }) {
  const cells = statsByCell(wire);
  if (!cells.length) return <p className="p-6 text-center text-sm text-ink-3">Stats appear once a cell calls Data Cloud.</p>;
  const s = shownTurn === null ? cells.at(-1)! : cells.find((c) => c.turn === shownTurn);

  return (
    <section className="h-full overflow-y-auto px-4 py-3 text-xs">
      {s ? (
        <>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-ink-3">cell [{s.turn}]</span>
            <span className="ml-auto font-mono text-ink-2" title="Time spent in HTTP calls">{secs(s.httpMs)}</span>
          </div>
          <div className="mt-2.5 space-y-3">
            <dl className="grid grid-cols-3 gap-2">
              <Metric label="Rows" value={count(s.rows)} hint="rowCount from each query response, summed over the cell's queries" />
              <Metric label="Data Cloud" value={secs(s.dataCloudMs)} hint="Data Cloud's query time: the response's endTime minus startTime" />
              <Metric label="Transfer" value={secs(s.transferMs)} hint="Our measured query time minus Data Cloud's: network, download and parsing" />
              <Metric label="Size" value={bytes(s.bytes)} hint="Query response bodies, decompressed" />
              <Metric label="Sign-in" value={secs(s.signInMs)} hint="OAuth token, Data Cloud token exchange and revoke. The connector signs in on its first query." />
              <Metric label="HTTP calls" value={String(s.calls)} hint="Every call this cell made; each is in the Wire tab" />
            </dl>
            {s.queries.map((q, i) => (
              <QueryCard key={q.id} q={q} n={s.queries.length > 1 ? i + 1 : null} />
            ))}
          </div>
        </>
      ) : (
        <p className="py-3 text-center text-sm text-ink-3">Cell [{shownTurn}] made no HTTP calls.</p>
      )}
      <AllCells cells={cells} shownTurn={s?.turn ?? null} onPick={onPick} />
    </section>
  );
}

function QueryCard({ q, n }: { q: QueryStats; n: number | null }) {
  return (
    <div className="space-y-1.5 rounded-[10px] border border-line bg-surface px-2.5 py-2">
      <div className="flex items-baseline gap-2">
        <span className="font-semibold text-ink-2">Query{n !== null ? ` ${n}` : ""}</span>
        <span className={`font-mono ${q.error ? "text-err" : "text-ink-3"}`}>{q.status ?? "—"}</span>
        <span className="ml-auto font-mono text-ink-2">{secs(q.totalMs)}</span>
      </div>
      {q.sql && (
        <pre title={q.sql} className="line-clamp-3 whitespace-pre-wrap break-words font-mono text-ink">
          {q.sql}
        </pre>
      )}
      {q.error ? (
        <p className="text-err">{q.error}</p>
      ) : (
        <p className="text-ink-3">
          <span className="font-mono font-semibold text-ink">{count(q.rows)}</span> rows · {q.columns ?? "—"} {q.columns === 1 ? "column" : "columns"} · {q.pages}{" "}
          {q.pages === 1 ? "page" : "pages"} · Data Cloud <span className="font-mono text-ink">{secs(q.dataCloudMs)}</span> · transfer{" "}
          <span className="font-mono text-ink">{secs(q.transferMs)}</span> · <span className="font-mono text-ink">{bytes(q.bytes)}</span>
        </p>
      )}
      <IdRow label="queryId" value={q.queryId} />
      <IdRow label="x-trace-id" value={q.traceId} />
      {q.rateLimit && (
        <p className="text-ink-3" title="x-ratelimit-* headers on the query response, as sent">
          Rate limit <span className="font-mono text-ink">{q.rateLimit.remaining}</span> remaining · limit{" "}
          <span className="font-mono text-ink">{q.rateLimit.limit ?? "—"}</span>
          {q.rateLimit.reset && (
            <>
              {" "}
              · reset <span className="font-mono text-ink">{q.rateLimit.reset}</span>
            </>
          )}
        </p>
      )}
    </div>
  );
}

function AllCells({ cells, shownTurn, onPick }: { cells: CellStats[]; shownTurn: number | null; onPick: (turn: number) => void }) {
  if (cells.length < 2) return null;
  const cols = "grid grid-cols-[2.5rem_repeat(4,minmax(0,1fr))] items-baseline gap-2";
  return (
    <div className="mt-3 border-t border-line pt-3">
      <div className="flex items-center gap-1.5">
        <span className="font-semibold text-ink-2">All cells</span>
        <span className="font-mono text-ink-3">{cells.length} with calls</span>
        <span className="ml-auto font-mono text-ink-2">{secs(cells.reduce((n, c) => n + c.httpMs, 0))}</span>
      </div>
      <dl className="mt-2 grid grid-cols-3 gap-2">
        <Metric label="Rows" value={count(sum(cells.map((c) => c.rows)))} hint="Rows returned, summed over every cell" />
        <Metric label="Data Cloud" value={secs(sum(cells.map((c) => c.dataCloudMs)))} hint="Data Cloud's query time, summed over every cell" />
        <Metric label="Transfer" value={secs(sum(cells.map((c) => c.transferMs)))} hint="Transfer time, summed over every cell" />
      </dl>
      <div className="mt-2">
        <div className={`${cols} px-1.5 pb-1 text-ink-3`}>
          <span>Cell</span>
          <span className="text-right">HTTP</span>
          <span className="text-right">Rows</span>
          <span className="text-right">Data Cloud</span>
          <span className="text-right">Transfer</span>
        </div>
        {cells.map((c) => {
          const shown = c.turn === shownTurn;
          return (
            <button
              key={c.turn}
              onClick={() => c.turn !== null && onPick(c.turn)}
              aria-pressed={shown}
              title={`Show cell [${c.turn}] above`}
              className={`${cols} w-full rounded-md px-1.5 py-0.5 text-left font-mono hover:bg-tint ${shown ? "bg-tint font-semibold text-ink" : "text-ink-2"}`}
            >
              <span>[{c.turn}]</span>
              <span className="text-right">{secs(c.httpMs)}</span>
              <span className="text-right">{count(c.rows)}</span>
              <span className="text-right">{secs(c.dataCloudMs)}</span>
              <span className="text-right">{secs(c.transferMs)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
