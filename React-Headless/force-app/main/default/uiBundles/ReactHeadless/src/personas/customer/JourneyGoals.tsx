import { formatValue } from '@shared';
import type { JourneyEvent, GoalRing } from './customerTypes';

const PRIORITY_COLOR = { high: 'var(--wp-neg)', medium: 'var(--wp-warn)', low: 'var(--wp-text-faint)' };

/**
 * Journey & Goals — the horizon-style life-events filmstrip + goal rings.
 * Milestones scroll horizontally on a rail; goals render as SVG progress rings.
 * Adapts horizon.html into a themed React component (works light + dark).
 */
export function JourneyGoals({ journey, goals }: { journey: JourneyEvent[]; goals: GoalRing[] }) {
  return (
    <div style={{ display: 'grid', gap: '1.5rem' }}>
      {/* MILESTONES FILMSTRIP */}
      <div>
        <SectionLabel>Milestones</SectionLabel>
        <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: 6, marginTop: 12 }} className="wp-noscroll">
          {journey.map((ev, i) => (
            <div
              key={ev.id}
              style={{
                flexShrink: 0,
                width: 148,
                background: 'var(--wp-surface-glass)',
                border: `1px solid ${ev.status === 'now' ? 'var(--wp-accent)' : 'var(--wp-border)'}`,
                borderRadius: 14,
                padding: '16px 14px',
                position: 'relative',
                boxShadow: ev.status === 'now' ? '0 0 0 1px var(--wp-accent), 0 8px 30px color-mix(in srgb, var(--wp-accent) 30%, transparent)' : 'none',
                animation: `wp-fade-up 0.4s ease ${i * 0.05}s both`,
              }}
            >
              <span
                style={{
                  position: 'absolute', top: 10, right: 10, width: 18, height: 18, borderRadius: '50%',
                  background: ev.status === 'now' ? 'var(--wp-accent)' : 'var(--wp-pos)', color: '#fff',
                  fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700,
                }}
              >
                {ev.status === 'now' ? '●' : '✓'}
              </span>
              <div style={{ fontSize: 22, marginBottom: 10 }}>{ev.icon}</div>
              <div style={{ fontSize: 34, fontWeight: 300, lineHeight: 0.9, color: ev.status === 'now' ? 'var(--wp-accent)' : 'var(--wp-text-faint)', letterSpacing: '-0.02em' }}>
                {ev.year}
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, marginTop: 8, lineHeight: 1.3 }}>{ev.name}</div>
              <div style={{ fontSize: 10, color: 'var(--wp-text-faint)', marginTop: 6 }}>{ev.date}</div>
            </div>
          ))}
        </div>
      </div>

      {/* GOAL RINGS */}
      <div>
        <SectionLabel>Goals</SectionLabel>
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 6, marginTop: 12 }} className="wp-noscroll">
          {goals.map(g => (
            <div
              key={g.id}
              style={{ flexShrink: 0, width: 140, background: 'var(--wp-surface-glass)', border: '1px solid var(--wp-border)', borderRadius: 16, padding: '20px 16px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}
            >
              <GoalRingSvg pct={g.pct} color={g.color} />
              <div style={{ fontSize: 12, fontWeight: 600, textAlign: 'center', lineHeight: 1.3 }}>{g.name}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--wp-text-muted)' }}>{formatValue(g.amount, 'currencyCompact')}</div>
              <div style={{ fontSize: 10, color: 'var(--wp-text-faint)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: PRIORITY_COLOR[g.priority] }} />
                {g.priority} · {g.date}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--wp-text-muted)' }}>
      {children}
      <span style={{ flex: 1, height: 1, background: 'var(--wp-border)' }} />
    </div>
  );
}

function GoalRingSvg({ pct, color }: { pct: number; color: string }) {
  const R = 30;
  const circ = 2 * Math.PI * R;
  const offset = circ - (pct / 100) * circ;
  return (
    <div style={{ position: 'relative', width: 72, height: 72 }}>
      <svg width={72} height={72} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={36} cy={36} r={R} fill="none" stroke="var(--wp-border-strong)" strokeWidth={5} />
        <circle
          cx={36}
          cy={36}
          r={R}
          fill="none"
          stroke={color}
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1.4s cubic-bezier(0.22,1,0.36,1)' }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 17, fontWeight: 700 }}>{pct}%</span>
        <span style={{ fontSize: 8, color: 'var(--wp-text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>done</span>
      </div>
    </div>
  );
}
