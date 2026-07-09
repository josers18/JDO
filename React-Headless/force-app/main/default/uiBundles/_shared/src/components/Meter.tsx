import clsx from 'clsx';

export function Meter({ label, value, caption }: { label: string; value: number; caption?: string }) {
  const pct = Math.max(0, Math.min(1, value));
  const kind = value >= 1 ? 'ok' : value >= 0.5 ? 'brand' : 'warn';
  const fill = kind === 'ok' ? 'bg-ok' : kind === 'brand' ? 'bg-gradient-brand' : 'bg-warn';
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] font-semibold text-fg">{label}</span>
        {caption && <span className="tabular-nums text-[11px] font-semibold text-muted">{caption}</span>}
      </div>
      <div className="h-[7px] overflow-hidden rounded-full bg-track">
        <div data-testid="meter-fill" data-fill-kind={kind} className={clsx('h-full rounded-full', fill)} style={{ width: `${pct * 100}%` }} />
      </div>
    </div>
  );
}
