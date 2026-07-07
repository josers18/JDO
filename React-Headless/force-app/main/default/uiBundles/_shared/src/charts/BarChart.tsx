export interface BarDatum {
  label: string;
  value: number;
  color?: string;
}

interface BarChartProps {
  data: BarDatum[];
  width?: number;
  height?: number;
  /** format the value shown on hover/label */
  valuePrefix?: string;
}

/**
 * Simple vertical bar chart for interaction counts / period comparisons.
 * Accent-colored by default; per-bar color optional.
 */
export function BarChart({ data, width = 320, height = 140, valuePrefix = '' }: BarChartProps) {
  const max = Math.max(...data.map(d => d.value)) || 1;
  const gap = 6;
  const barW = (width - gap * (data.length - 1)) / data.length;

  return (
    <svg width={width} height={height} style={{ display: 'block', overflow: 'visible' }}>
      {data.map((d, i) => {
        const barH = (d.value / max) * (height - 22);
        const x = i * (barW + gap);
        const y = height - barH - 16;
        return (
          <g key={d.label}>
            <rect x={x} y={y} width={barW} height={barH} rx={4} fill={d.color ?? 'var(--wp-accent)'} opacity={0.9}>
              <title>{`${valuePrefix}${d.value}`}</title>
            </rect>
            <text x={x + barW / 2} y={height - 3} textAnchor="middle" fontSize="9" fill="var(--wp-text-faint)">
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
