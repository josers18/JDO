import type { ReactNode } from 'react';
import clsx from 'clsx';
import { Eyebrow } from './Eyebrow';

export function Panel({
  title, count, hint, action, accentRail, index = 0, className, children,
}: {
  title?: string; count?: number; hint?: string; action?: ReactNode;
  accentRail?: boolean; index?: number; className?: string; children: ReactNode;
}) {
  return (
    <section
      className={clsx('overflow-hidden rounded-card border border-line bg-surface shadow-card', accentRail && 'border-l-[3px] border-l-accent', className)}
      style={{ animation: `wp-fade-up 0.5s ease ${index * 0.06}s both` }}
    >
      {(title || action) && (
        <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3.5">
          <span className="flex items-center">
            {title && <Eyebrow className="!text-muted !tracking-[0.13em]">{title}</Eyebrow>}
            {count != null && <span className="ml-2 rounded-full bg-track px-2 py-0.5 text-[10px] font-semibold text-muted tabular-nums">{count}</span>}
          </span>
          {hint && <span className="text-[10px] uppercase tracking-[0.08em] text-faint">{hint}</span>}
          {action}
        </header>
      )}
      <div className="p-3">{children}</div>
    </section>
  );
}
