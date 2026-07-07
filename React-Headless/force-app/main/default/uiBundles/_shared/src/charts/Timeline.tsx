export interface TimelineEvent {
  id: string;
  when: string;
  title: string;
  detail?: string;
  tone?: 'positive' | 'opportunity' | 'risk' | 'neutral';
  icon?: string;
}

interface TimelineProps {
  events: TimelineEvent[];
}

const TONE_COLOR: Record<NonNullable<TimelineEvent['tone']>, string> = {
  positive: 'var(--wp-pos)',
  opportunity: 'var(--wp-accent)',
  risk: 'var(--wp-neg)',
  neutral: 'var(--wp-text-faint)',
};

/**
 * Vertical relationship timeline — a spine with dated event nodes. Used for the
 * "what's happened since you last saw {client}" story.
 */
export function Timeline({ events }: TimelineProps) {
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, position: 'relative' }}>
      <span
        aria-hidden="true"
        style={{ position: 'absolute', left: 7, top: 4, bottom: 4, width: 2, background: 'var(--wp-border-strong)' }}
      />
      {events.map((e, i) => {
        const color = TONE_COLOR[e.tone ?? 'neutral'];
        return (
          <li
            key={e.id}
            style={{ position: 'relative', paddingLeft: '1.6rem', paddingBottom: i === events.length - 1 ? 0 : '1rem', animation: `wp-fade-up 0.4s ease ${i * 0.05}s both` }}
          >
            <span
              aria-hidden="true"
              style={{ position: 'absolute', left: 0, top: 3, width: 16, height: 16, borderRadius: '50%', background: 'var(--wp-surface-raised)', border: `3px solid ${color}` }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
              <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                {e.icon ? `${e.icon} ` : ''}
                {e.title}
              </span>
              <span style={{ color: 'var(--wp-text-faint)', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{e.when}</span>
            </div>
            {e.detail && <div style={{ color: 'var(--wp-text-muted)', fontSize: '0.8rem', marginTop: '0.15rem' }}>{e.detail}</div>}
          </li>
        );
      })}
    </ul>
  );
}
