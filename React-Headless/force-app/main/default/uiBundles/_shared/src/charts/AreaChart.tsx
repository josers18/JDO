export interface AreaSeries {
  label: string;
  color: string;
  points: number[];
}

interface AreaChartProps {
  series: AreaSeries[];
  width?: number;
  height?: number;
  /** x-axis labels (optional, shown at ends) */
  startLabel?: string;
  endLabel?: string;
  legend?: boolean;
}

/**
 * Multi-series area/line chart for trends (AUM, engagement, financial health).
 * Hand-rolled SVG, gradient fill under each line, shared min/max scale.
 */
export function AreaChart({ series, width = 520, height = 180, startLabel, endLabel, legend = true }: AreaChartProps) {
  const all = series.flatMap(s => s.points);
  const min = Math.min(...all);
  const max = Math.max(...all);
  const range = max - min || 1;
  const pad = 8;
  const w = width;
  const h = height - (legend ? 26 : 0) - (startLabel || endLabel ? 18 : 0);

  const toXY = (pts: number[]) => {
    const step = pts.length > 1 ? w / (pts.length - 1) : 0;
    return pts.map((p, i) => [i * step, h - ((p - min) / range) * (h - pad * 2) - pad] as const);
  };

  return (
    <div>
      <svg width={w} height={h} style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          {series.map((s, i) => (
            <linearGradient key={i} id={`area-grad-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {[0.25, 0.5, 0.75].map(g => (
          <line key={g} x1={0} y1={h * g} x2={w} y2={h * g} stroke="var(--wp-border)" strokeWidth={1} />
        ))}
        {series.map((s, i) => {
          const xy = toXY(s.points);
          const line = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
          const area = `0,${h} ${line} ${w},${h}`;
          return (
            <g key={i}>
              <polyline points={area} fill={`url(#area-grad-${i})`} stroke="none" />
              <polyline points={line} fill="none" stroke={s.color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
              {xy.length > 0 && (
                <circle cx={xy[xy.length - 1][0]} cy={xy[xy.length - 1][1]} r={3.5} fill={s.color} />
              )}
            </g>
          );
        })}
      </svg>
      {(startLabel || endLabel) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--wp-text-faint)', marginTop: 4 }}>
          <span>{startLabel}</span>
          <span>{endLabel}</span>
        </div>
      )}
      {legend && (
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: 8 }}>
          {series.map(s => (
            <span key={s.label} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.76rem', color: 'var(--wp-text-muted)' }}>
              <span style={{ width: 10, height: 3, borderRadius: 2, background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
