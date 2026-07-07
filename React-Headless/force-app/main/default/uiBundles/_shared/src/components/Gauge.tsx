import { useCountUp } from './useCountUp';

interface GaugeProps {
  /** 0..1 fraction of the arc to fill */
  value: number;
  /** big number in the center (defaults to rounded percentage) */
  label?: string;
  /** small caption under the label */
  caption?: string;
  size?: number;
  /** arc color; defaults to accent. Pass a risk color to signal severity. */
  color?: string;
}

/**
 * Radial gauge — a 270° SVG arc with an animated fill. Used for churn/credit
 * risk scores, retirement readiness, plan progress, PAYDEX, etc.
 */
export function Gauge({ value, label, caption, size = 132, color = 'var(--wp-accent)' }: GaugeProps) {
  const clamped = Math.max(0, Math.min(1, value));
  const animated = useCountUp(clamped, 1000);
  const stroke = 10;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const startAngle = 135; // degrees
  const sweep = 270;

  const polar = (angleDeg: number) => {
    const a = (angleDeg * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
  };
  const arcPath = (fromDeg: number, toDeg: number) => {
    const [x1, y1] = polar(fromDeg);
    const [x2, y2] = polar(toDeg);
    const large = toDeg - fromDeg > 180 ? 1 : 0;
    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  };

  const track = arcPath(startAngle, startAngle + sweep);
  const fill = arcPath(startAngle, startAngle + sweep * animated);

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size}>
        <path d={track} fill="none" stroke="var(--wp-border-strong)" strokeWidth={stroke} strokeLinecap="round" />
        <path d={fill} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.15rem',
        }}
      >
        <span style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--wp-text)' }}>
          {label ?? `${Math.round(animated * 100)}`}
        </span>
        {caption && (
          <span style={{ fontSize: '0.7rem', color: 'var(--wp-text-muted)', textAlign: 'center', maxWidth: size - 30 }}>
            {caption}
          </span>
        )}
      </div>
    </div>
  );
}
