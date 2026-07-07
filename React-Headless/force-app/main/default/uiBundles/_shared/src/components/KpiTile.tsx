import { Sparkline } from './Sparkline';
import { useCountUp } from './useCountUp';
import { formatValue, type ValueFormat } from './format';

interface KpiTileProps {
  label: string;
  value: number;
  format?: ValueFormat;
  /** optional trend series → sparkline */
  trend?: number[];
  /** optional delta vs prior period, e.g. +0.042 → "+4.2%" */
  deltaPct?: number;
  /** stagger index for entrance animation */
  index?: number;
}

/**
 * Glassmorphic KPI tile: animated count-up value, optional delta chip, and an
 * optional sparkline. Reused across every persona's KPI strip.
 */
export function KpiTile({ label, value, format = 'number', trend, deltaPct, index = 0 }: KpiTileProps) {
  const display = useCountUp(value);
  const deltaPositive = (deltaPct ?? 0) >= 0;

  return (
    <div
      style={{
        position: 'relative',
        background: 'var(--wp-surface-glass)',
        border: '1px solid var(--wp-border)',
        borderRadius: 'var(--wp-radius)',
        boxShadow: 'var(--wp-shadow-sm)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        padding: '1rem 1.15rem',
        color: 'var(--wp-text)',
        overflow: 'hidden',
        animation: `wp-fade-up 0.5s ease ${index * 0.06}s both`,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          background: 'var(--wp-glow)',
          opacity: 0.5,
          pointerEvents: 'none',
        }}
      />
      <div style={{ position: 'relative' }}>
        <div style={{ color: 'var(--wp-text-muted)', fontSize: '0.78rem', fontWeight: 600, letterSpacing: '0.02em' }}>
          {label}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: '0.35rem' }}>
          <span data-testid="kpi-value" style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
            {formatValue(display, format)}
          </span>
          {deltaPct != null && (
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                color: deltaPositive ? 'var(--wp-pos)' : 'var(--wp-neg)',
              }}
            >
              {deltaPositive ? '▲' : '▼'} {Math.abs(deltaPct * 100).toFixed(1)}%
            </span>
          )}
        </div>
        {trend && trend.length > 0 && (
          <div style={{ marginTop: '0.6rem' }}>
            <Sparkline points={trend} width={150} height={34} />
          </div>
        )}
      </div>
    </div>
  );
}
