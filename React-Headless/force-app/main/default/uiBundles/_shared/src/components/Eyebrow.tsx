import type { ReactNode } from 'react';
import clsx from 'clsx';

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={clsx('font-sans text-[10px] font-semibold uppercase tracking-[0.14em] text-faint', className)}>
      {children}
    </span>
  );
}
