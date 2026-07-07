import type { Highlight } from './customerTypes';

const TONE: Record<Highlight['tone'], string> = {
  positive: 'var(--wp-pos)',
  opportunity: 'var(--wp-accent)',
  risk: 'var(--wp-warn)',
  neutral: 'var(--wp-text-faint)',
};

/** Horizontal "what's changed" chip strip under the AI headline. */
export function HighlightStrip({ highlights }: { highlights: Highlight[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${highlights.length}, minmax(0, 1fr))`, gap: '0.75rem' }}>
      {highlights.map((h, i) => (
        <div
          key={h.label}
          style={{
            display: 'flex',
            gap: '0.65rem',
            alignItems: 'center',
            padding: '0.75rem 0.85rem',
            background: 'var(--wp-surface-glass)',
            border: '1px solid var(--wp-border)',
            borderRadius: 'var(--wp-radius-sm)',
            animation: `wp-fade-up 0.4s ease ${i * 0.05}s both`,
          }}
        >
          <span aria-hidden="true" style={{ fontSize: '1.3rem' }}>{h.icon}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '0.68rem', color: 'var(--wp-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h.label}</div>
            <div style={{ fontWeight: 800, fontSize: '0.98rem' }}>{h.value}</div>
            <div style={{ fontSize: '0.72rem', color: TONE[h.tone] }}>{h.sub}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
