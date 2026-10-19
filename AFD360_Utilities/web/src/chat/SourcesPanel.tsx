import { useState } from "react";
import { ChevronRight, ExternalLink } from "lucide-react";
import type { Citation } from "../../../shared/citations";

// Cited references grouped by turn; a chip per source, its raw item one click away.
export function SourcesPanel({ items, highlightTurn }: { items: Citation[]; highlightTurn: number | null }) {
  if (items.length === 0) {
    return (
      <p className="p-6 text-center text-sm text-ink-3">
        No cited sources yet. Agents list them in <code className="font-mono text-xs">citedReferences</code> when an answer is grounded in
        knowledge.
      </p>
    );
  }
  const turns = [...new Set(items.map((c) => c.turn))];
  return (
    <div className="h-full space-y-3 overflow-y-auto bg-ground p-3">
      {turns.map((turn) => (
        <section
          key={String(turn)}
          className={`rounded-xl border bg-surface p-3 ${highlightTurn !== null && turn === highlightTurn ? "border-ink-3 shadow-lift" : "border-line"}`}
        >
          <h3 className="mb-2 font-mono text-xs text-ink-3">{turn !== null ? `turn ${turn}` : "turn —"}</h3>
          <ul className="flex flex-wrap gap-1.5">
            {items.filter((c) => c.turn === turn).map((c, i) => (
              <SourceChip key={i} citation={c} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function SourceChip({ citation: c }: { citation: Citation }) {
  const [open, setOpen] = useState(false);
  const label = c.title ?? c.url ?? "Source";
  return (
    <li className="min-w-0 max-w-full">
      <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-recv-line bg-recv py-0.5 pl-1.5 pr-2.5 text-xs text-recv-ink">
        <button onClick={() => setOpen(!open)} title="Show the raw reference" className="shrink-0 rounded-full p-0.5 hover:bg-tint">
          <ChevronRight size={12} className={`transition-transform ${open ? "rotate-90" : ""}`} />
        </button>
        {c.url ? (
          <a href={c.url} target="_blank" rel="noreferrer" title={c.url} className="flex min-w-0 items-center gap-1 font-medium hover:underline">
            <span className="truncate">{label}</span>
            <ExternalLink size={11} className="shrink-0" />
          </a>
        ) : (
          <span className="truncate font-medium">{label}</span>
        )}
      </span>
      {open && (
        <pre className="mt-1 max-h-60 overflow-auto rounded-lg bg-console p-2.5 font-mono text-xs leading-relaxed text-console-ink">
          {JSON.stringify(c.raw, null, 2)}
        </pre>
      )}
    </li>
  );
}
