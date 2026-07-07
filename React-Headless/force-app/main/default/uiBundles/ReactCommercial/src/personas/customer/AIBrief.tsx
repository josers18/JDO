import type { Customer360 } from './customerTypes';

const IMPACT_COLOR: Record<string, string> = {
  High: 'var(--wp-neg)',
  Medium: 'var(--wp-warn)',
  Low: 'var(--wp-text-faint)',
};

/**
 * Right intelligence panel for the Customer 360 — the prompt-generated
 * relationship brief, Einstein next-best-actions, and the confidence /
 * data-source provenance footer. This is the "single intelligent view" seam
 * that fuses CRM + Data Cloud + predictions into one narrative.
 */
export function AIBrief({ customer }: { customer: Customer360 }) {
  return (
    <div style={{ display: 'grid', gap: '1.1rem' }}>
      {/* generated brief */}
      <div
        style={{
          borderRadius: 'var(--wp-radius-sm)',
          border: '1px solid color-mix(in srgb, var(--wp-accent) 30%, var(--wp-border))',
          background: 'color-mix(in srgb, var(--wp-accent) 7%, var(--wp-surface-glass))',
          padding: '1rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.5rem' }}>
          <span aria-hidden="true" style={{ color: 'var(--wp-accent)' }}>✦</span>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--wp-accent)' }}>
            AI Relationship Brief
          </span>
          <span style={{ marginLeft: 'auto', fontSize: '0.68rem', color: 'var(--wp-text-faint)' }}>generated now</span>
        </div>
        <div style={{ fontSize: '1.02rem', fontWeight: 800, marginBottom: '0.4rem' }}>{customer.aiBriefHeadline}</div>
        <p style={{ margin: 0, fontSize: '0.88rem', lineHeight: 1.5, color: 'var(--wp-text-muted)' }}>{customer.aiBrief}</p>
      </div>

      {/* next best actions */}
      <div>
        <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--wp-text-muted)', marginBottom: '0.6rem' }}>
          Recommended Next Best Actions
        </div>
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          {customer.nextBestActions.map(nba => (
            <button
              key={nba.id}
              type="button"
              style={{
                textAlign: 'left',
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                alignItems: 'center',
                gap: '0.6rem',
                background: 'var(--wp-surface-raised)',
                border: '1px solid var(--wp-border)',
                borderRadius: 'var(--wp-radius-sm)',
                padding: '0.7rem 0.85rem',
                color: 'var(--wp-text)',
                cursor: 'pointer',
              }}
            >
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 700, fontSize: '0.9rem' }}>{nba.title}</span>
                <span style={{ display: 'block', color: 'var(--wp-text-muted)', fontSize: '0.78rem' }}>{nba.detail}</span>
              </span>
              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: IMPACT_COLOR[nba.impact], whiteSpace: 'nowrap' }}>{nba.impact} ›</span>
            </button>
          ))}
        </div>
      </div>

      {/* confidence + provenance */}
      <div style={{ borderTop: '1px solid var(--wp-border)', paddingTop: '0.85rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--wp-text-muted)', marginBottom: '0.4rem' }}>
          <span>AI Confidence · {customer.dataSourceCount} sources</span>
          <span style={{ fontWeight: 700, color: 'var(--wp-text)' }}>{customer.confidencePct}%</span>
        </div>
        <div style={{ height: 6, borderRadius: 999, background: 'var(--wp-border-strong)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${customer.confidencePct}%`, background: 'var(--wp-accent)', boxShadow: '0 0 10px var(--wp-accent)' }} />
        </div>
      </div>
    </div>
  );
}
