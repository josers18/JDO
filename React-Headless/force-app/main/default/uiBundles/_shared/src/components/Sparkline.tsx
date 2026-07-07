interface SparklineProps {
  points: number[];
  width?: number;
  height?: number;
  /** stroke color; defaults to the persona accent token */
  stroke?: string;
  /** fill the area under the line with a faint accent wash */
  fill?: boolean;
  className?: string;
}

/**
 * Hand-rolled SVG sparkline — no charting dependency. Stroke defaults to the
 * persona accent token so it re-themes automatically.
 */
export function Sparkline({
  points,
  width = 128,
  height = 36,
  stroke = 'var(--wp-accent)',
  fill = true,
  className,
}: SparklineProps) {
  if (!points.length) {
    return <svg width={width} height={height} className={className} aria-hidden="true" />;
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const step = points.length > 1 ? width / (points.length - 1) : 0;
  const pts = points.map((p, i) => {
    const x = i * step;
    const y = height - ((p - min) / range) * (height - 4) - 2;
    return [x, y] as const;
  });
  const line = pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const area = `0,${height} ${line} ${width},${height}`;

  return (
    <svg width={width} height={height} className={className} aria-hidden="true">
      {fill && <polyline points={area} fill="var(--wp-accent)" opacity={0.12} stroke="none" />}
      <polyline
        points={line}
        fill="none"
        stroke={stroke}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
