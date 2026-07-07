export interface AttentionItem {
  id: string;
  title: string;
  reason: string;
  /** 0..1 model score; drives ordering + the score badge */
  score: number;
  severity: 'high' | 'medium' | 'low';
  clientName?: string;
  /** short suggested next action, e.g. "Offer HELOC refinance" */
  action?: string;
  /** model/source label, e.g. "Bank_Churner" */
  source?: string;
}

interface AttentionQueueProps {
  items: AttentionItem[];
  onSelect?: (item: AttentionItem) => void;
  /** currently drilled-in item id, for active highlight */
  selectedId?: string | null;
}

const SEVERITY: Record<AttentionItem['severity'], { color: string; label: string }> = {
  high: { color: 'var(--wp-neg)', label: 'High' },
  medium: { color: 'var(--wp-warn)', label: 'Medium' },
  low: { color: 'var(--wp-text-faint)', label: 'Low' },
};

/**
 * Agentic "Attention Today" queue — the reasoned, ML-ranked action list at the
 * heart of every persona cockpit. Sorted by score desc. Each row shows a
 * severity rail, title, reason, a suggested action chip, and a score badge.
 */
export function AttentionQueue({ items, onSelect, selectedId }: AttentionQueueProps) {
  const sorted = [...items].sort((a, b) => b.score - a.score);

  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.55rem' }}>
      {sorted.map((item, i) => {
        const sev = SEVERITY[item.severity];
        const active = selectedId === item.id;
        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onSelect?.(item)}
              style={{
                width: '100%',
                textAlign: 'left',
                display: 'grid',
                gridTemplateColumns: 'auto 1fr auto',
                alignItems: 'center',
                gap: '0.85rem',
                background: active ? 'var(--wp-surface-glass-strong)' : 'var(--wp-surface-glass)',
                border: `1px solid ${active ? 'var(--wp-accent)' : 'var(--wp-border)'}`,
                borderRadius: 'var(--wp-radius-sm)',
                padding: '0.8rem 0.95rem',
                color: 'var(--wp-text)',
                cursor: 'pointer',
                transition: 'border-color 0.15s, background 0.15s, transform 0.15s',
                animation: `wp-fade-up 0.45s ease ${i * 0.05}s both`,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 4,
                  alignSelf: 'stretch',
                  minHeight: 34,
                  borderRadius: 999,
                  background: sev.color,
                }}
              />
              <span style={{ minWidth: 0 }}>
                <span data-testid="attention-title" style={{ display: 'block', fontWeight: 700, fontSize: '0.94rem' }}>
                  {item.title}
                </span>
                <span style={{ display: 'block', color: 'var(--wp-text-muted)', fontSize: '0.83rem', marginTop: '0.1rem' }}>
                  {item.reason}
                </span>
                {item.action && (
                  <span
                    style={{
                      display: 'inline-block',
                      marginTop: '0.4rem',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      color: 'var(--wp-accent)',
                      background: 'color-mix(in srgb, var(--wp-accent) 14%, transparent)',
                      border: '1px solid color-mix(in srgb, var(--wp-accent) 40%, transparent)',
                      borderRadius: 999,
                      padding: '0.15rem 0.6rem',
                    }}
                  >
                    → {item.action}
                  </span>
                )}
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.2rem' }}>
                <span
                  style={{
                    fontSize: '1.05rem',
                    fontWeight: 800,
                    color: sev.color,
                    lineHeight: 1,
                  }}
                >
                  {Math.round(item.score * 100)}
                </span>
                <span style={{ fontSize: '0.62rem', color: 'var(--wp-text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {item.source ?? sev.label}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
