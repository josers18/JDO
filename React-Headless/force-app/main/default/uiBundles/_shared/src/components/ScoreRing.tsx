import clsx from 'clsx';

export type RingTone = 'ok' | 'warn' | 'risk' | 'accent';

const STROKE: Record<RingTone, string> = {
  ok: 'var(--wp-pos)', warn: 'var(--wp-warn)', risk: 'var(--wp-neg)', accent: 'var(--wp-accent)',
};
const TEXT: Record<RingTone, string> = {
  ok: 'text-ok', warn: 'text-warn', risk: 'text-risk', accent: 'text-accent',
};

export function ScoreRing({
  value, max = 100, tone = 'accent', caption, size = 46,
}: { value: number; max?: number; tone?: RingTone; caption?: string; size?: number }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value / max));
  const offset = circ * (1 - pct);
  const c = size / 2;

  return (
    <span className="text-center">
      <span data-testid="score-ring" className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)', gridArea: '1/1' }}>
          <circle cx={c} cy={c} r={r} fill="none" strokeWidth={5} stroke="var(--wp-track)" />
          <circle
            data-ring-fill
            cx={c} cy={c} r={r} fill="none" strokeWidth={5} strokeLinecap="round"
            stroke={STROKE[tone]} strokeDasharray={circ} strokeDashoffset={offset}
          />
        </svg>
        <span className={clsx('tabular-nums font-semibold text-[13px]', TEXT[tone])} style={{ gridArea: '1/1' }}>
          {value}
        </span>
      </span>
      {caption && <span className="block text-[8.5px] uppercase tracking-[0.06em] text-faint mt-1">{caption}</span>}
    </span>
  );
}
