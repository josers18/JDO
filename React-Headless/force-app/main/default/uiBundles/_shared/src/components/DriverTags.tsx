import clsx from 'clsx';

/** One driver behind a blended queue score — "CSAT +18". `points` is its
 *  weighted 0–1 contribution; risk drivers tint warn, opportunities accent. */
export interface QueueDriver {
  label: string;
  points: number;
  tone: 'risk' | 'opportunity';
}

/** Small tags naming what put a row in the queue, strongest first (as given). */
export function DriverTags({ drivers, className }: { drivers?: QueueDriver[]; className?: string }) {
  if (!drivers?.length) return null;
  return (
    <span className={clsx('flex flex-wrap gap-1', className)}>
      {drivers.map(d => (
        <span
          key={d.label}
          title={`${d.label} adds ${Math.round(d.points * 100)} of the score's 100 points`}
          className={clsx(
            'rounded-[5px] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em]',
            d.tone === 'risk' ? 'bg-warn-bg text-warn' : 'bg-accent-bg text-accent',
          )}
        >
          {d.label} +{Math.round(d.points * 100)}
        </span>
      ))}
    </span>
  );
}
