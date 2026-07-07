import { useCountUp } from './useCountUp';

interface HealthRingProps {
  /** 0..100 */
  score: number;
  label?: string;
  size?: number;
  /** multi-segment ring: pass dimension scores to tint arcs, else single accent */
  segments?: { value: number; color: string }[];
}

/**
 * Relationship-health ring — the signature "91 Excellent" dial from the
 * reference command centers. A full circular track with an animated accent
 * sweep and a large centered score.
 */
export function HealthRing({ score, label = 'Health', size = 128, segments }: HealthRingProps) {
  const animated = useCountUp(score / 100, 1000);
  const stroke = 11;
  const r = (size - stroke) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--wp-border-strong)" strokeWidth={stroke} />
        {segments && segments.length ? (
          (() => {
            const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
            let offset = 0;
            return segments.map((seg, i) => {
              const frac = (seg.value / total) * animated;
              const dash = frac * circ;
              const el = (
                <circle
                  key={i}
                  cx={c}
                  cy={c}
                  r={r}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth={stroke}
                  strokeLinecap="round"
                  strokeDasharray={`${dash} ${circ - dash}`}
                  strokeDashoffset={-offset * circ}
                />
              );
              offset += frac;
              return el;
            });
          })()
        ) : (
          <circle
            cx={c}
            cy={c}
            r={r}
            fill="none"
            stroke="var(--wp-accent)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${animated * circ} ${circ}`}
          />
        )}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: size * 0.3, fontWeight: 800, lineHeight: 1, color: 'var(--wp-text)' }}>
          {Math.round(animated * 100)}
        </span>
        <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--wp-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {label}
        </span>
      </div>
    </div>
  );
}
