import type { DataFreshness } from '../../data/dataFreshness';

const short = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: iso.slice(0, 4) === String(new Date().getFullYear()) ? undefined : 'numeric' });

/**
 * S8 hero meter — share of the page's sources that are current for their
 * cadence, with the stale ones named inline and every source's as-of date in
 * the tooltip. Falls back to the static confidence while freshness is unknown.
 */
export function DataFreshnessMeter({ freshness, fallbackPct }: { freshness?: DataFreshness; fallbackPct: number }) {
  const pct = freshness?.pct ?? fallbackPct;
  const stale = freshness?.sources.filter(s => !s.current) ?? [];
  const title = freshness?.sources
    .map(s => `${s.current ? '✓' : '⚠'} ${s.label}: ${s.asOf ? `as of ${short(s.asOf)}` : 'live'} (${s.cadence})`)
    .join('\n');
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1" title={title}>
      <div className="h-[5px] w-[120px] overflow-hidden rounded-full bg-track">
        <span className="block h-full rounded-full bg-gradient-ai" style={{ width: `${pct}%` }} />
      </div>
      <small className="font-mono text-[11px] text-muted">
        {freshness ? `Data freshness ${pct}% · ${freshness.sources.length} sources` : `AI confidence ${pct}%`}
      </small>
      {stale.length > 0 && (
        <small className="font-mono text-[11px] text-warn">
          stale: {stale.slice(0, 3).map(s => `${s.label} (${short(s.asOf)})`).join(', ')}{stale.length > 3 ? ` +${stale.length - 3}` : ''}
        </small>
      )}
    </div>
  );
}
