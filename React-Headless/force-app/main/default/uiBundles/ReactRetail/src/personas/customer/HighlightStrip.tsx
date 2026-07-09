import clsx from 'clsx';
import { Eyebrow } from '@shared';
import type { Highlight } from './customerTypes';

const TONE_TEXT: Record<Highlight['tone'], string> = {
  positive: 'text-ok',
  opportunity: 'text-accent',
  risk: 'text-risk',
  neutral: 'text-muted',
};
const TONE_RAIL: Record<Highlight['tone'], string> = {
  positive: 'bg-ok',
  opportunity: 'bg-gradient-brand',
  risk: 'bg-risk',
  neutral: 'bg-track',
};

/**
 * Highlight strip under the AI headline — StatTile-styled, but adapted to the
 * `Highlight` shape: its `value`/`sub` are already display-formatted strings
 * (e.g. "+$8,240" / "+12% YoY"), so this renders them directly instead of
 * routing through StatTile's numeric `useCountUp` pipeline.
 */
export function HighlightStrip({ highlights }: { highlights: Highlight[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${highlights.length}, minmax(0, 1fr))`, gap: '0.75rem' }}>
      {highlights.map((h, i) => (
        <div
          key={h.label}
          className="relative overflow-hidden rounded-sub border border-line bg-surface p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-pop hover:border-accent-border"
          style={{ animation: `wp-fade-up 0.5s ease ${i * 0.05}s both` }}
        >
          <span aria-hidden="true" className={clsx('absolute inset-x-0 top-0 h-[3px] opacity-95', TONE_RAIL[h.tone])} />
          <Eyebrow>{h.label}</Eyebrow>
          <div data-testid="stat-value" className="mt-3 font-display text-[22px] font-semibold leading-none tracking-tight">{h.value}</div>
          <div className={clsx('mt-1.5 text-[11px] font-semibold', TONE_TEXT[h.tone])}>{h.sub}</div>
        </div>
      ))}
    </div>
  );
}
