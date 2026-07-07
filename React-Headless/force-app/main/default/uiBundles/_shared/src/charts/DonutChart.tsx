import { useCountUp } from '../components/useCountUp';

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
  /** big centered value (e.g. total) */
  centerValue?: string;
  centerLabel?: string;
  legend?: boolean;
}

/**
 * SVG donut for product mix / AUM allocation. Animated sweep, optional legend.
 * Colors are passed in (persona palette or fixed category colors).
 */
export function DonutChart({ slices, size = 160, thickness = 22, centerValue, centerLabel, legend = true }: DonutChartProps) {
  const anim = useCountUp(1, 900);
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div style={{ display: 'flex', gap: '1.1rem', alignItems: 'center', flexWrap: 'wrap' }}>
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={c} cy={c} r={r} fill="none" stroke="var(--wp-border-strong)" strokeWidth={thickness} opacity={0.35} />
          {slices.map((s, i) => {
            const frac = (s.value / total) * anim;
            const dash = frac * circ;
            const el = (
              <circle
                key={i}
                cx={c}
                cy={c}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={thickness}
                strokeDasharray={`${dash} ${circ - dash}`}
                strokeDashoffset={-offset * circ}
              />
            );
            offset += frac;
            return el;
          })}
        </svg>
        {(centerValue || centerLabel) && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            {centerValue && <span style={{ fontSize: size * 0.15, fontWeight: 800, color: 'var(--wp-text)' }}>{centerValue}</span>}
            {centerLabel && <span style={{ fontSize: '0.66rem', color: 'var(--wp-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{centerLabel}</span>}
          </div>
        )}
      </div>
      {legend && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.35rem', flex: 1, minWidth: 120 }}>
          {slices.map(s => (
            <li key={s.label} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem' }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flexShrink: 0 }} />
              <span style={{ flex: 1, color: 'var(--wp-text-muted)' }}>{s.label}</span>
              <span style={{ fontWeight: 700, color: 'var(--wp-text)' }}>{Math.round((s.value / total) * 100)}%</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
