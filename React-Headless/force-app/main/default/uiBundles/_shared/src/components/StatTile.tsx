import clsx from 'clsx';
import { useCountUp } from './useCountUp';
import { formatValue, type ValueFormat } from './format';
import { Sparkline } from './Sparkline';
import { Eyebrow } from './Eyebrow';

export type StatTone = 'accent' | 'risk';

export function StatTile({
  label, value, format = 'number', deltaPct, trend, tone = 'accent', index = 0,
}: {
  label: string; value: number; format?: ValueFormat; deltaPct?: number;
  trend?: number[]; tone?: StatTone; index?: number;
}) {
  const display = useCountUp(value);
  const up = (deltaPct ?? 0) >= 0;
  return (
    <div
      className="relative overflow-hidden rounded-sub border border-line bg-surface p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-pop hover:border-accent-border"
      style={{ animation: `wp-fade-up 0.5s ease ${index * 0.05}s both` }}
    >
      <span aria-hidden="true" className={clsx('absolute inset-x-0 top-0 h-[3px] opacity-95', tone === 'risk' ? 'bg-risk' : 'bg-gradient-brand')} />
      <Eyebrow>{label}</Eyebrow>
      <div className="mt-3 flex items-baseline gap-2">
        <span data-testid="stat-value" className={clsx('font-display tabular-nums text-[31px] font-semibold leading-none tracking-tight', tone === 'risk' && 'text-risk')}>
          {formatValue(display, format)}
        </span>
        {deltaPct != null && (
          <span className={clsx('tabular-nums text-[11px] font-bold', up ? 'text-ok' : 'text-risk')}>
            {up ? '▲' : '▼'} {Math.abs(deltaPct * 100).toFixed(1)}%
          </span>
        )}
      </div>
      {trend && trend.length > 0 && <div className="mt-2.5"><Sparkline points={trend} width={150} height={34} /></div>}
    </div>
  );
}
