import type { ReactNode } from 'react';
import clsx from 'clsx';

export type PillTone = 'ok' | 'warn' | 'risk' | 'neutral' | 'accent';

const TONE: Record<PillTone, string> = {
  ok: 'bg-ok-bg text-ok',
  warn: 'bg-warn-bg text-warn',
  risk: 'bg-risk-bg text-risk',
  accent: 'bg-accent-bg text-accent',
  neutral: 'bg-track text-muted',
};

export function Pill({ tone = 'neutral', children, className }: { tone?: PillTone; children: ReactNode; className?: string }) {
  return (
    <span className={clsx(
      'inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]',
      TONE[tone], className,
    )}>
      {children}
    </span>
  );
}
