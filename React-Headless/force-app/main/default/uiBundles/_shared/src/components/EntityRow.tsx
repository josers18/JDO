import type { ReactNode } from 'react';
import { Icon, type IconKey } from './iconMap';

export function EntityRow({
  avatar, iconName, title, badge, reason, action, right, onClick, index = 0,
}: {
  avatar?: string; iconName?: IconKey; title: string; badge?: string;
  reason?: string; action?: string; right?: ReactNode; onClick?: () => void; index?: number;
}) {
  return (
    <button
      type="button"
      data-testid="entity-row"
      onClick={onClick}
      className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 rounded-sub border border-line bg-surface-muted px-3.5 py-3 text-left transition hover:-translate-y-0.5 hover:border-accent-border hover:shadow-card"
      style={{ animation: `wp-fade-up 0.4s ease ${index * 0.05}s both` }}
    >
      <span className="grid h-10 w-10 flex-none place-items-center rounded-[11px] border border-accent-border bg-accent-bg text-[13px] font-semibold text-accent">
        {avatar ? avatar : iconName ? <Icon name={iconName} size={18} /> : null}
      </span>
      <span className="min-w-0">
        <span className="flex items-baseline gap-2">
          <b className="truncate text-[14.5px] font-extrabold tracking-tight">{title}</b>
          {badge && <span className="text-[10px] uppercase tracking-[0.08em] text-faint">{badge}</span>}
        </span>
        {reason && <span className="mt-0.5 block text-[12.5px] text-muted">{reason}</span>}
        {action && (
          <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-accent-border bg-accent-bg px-2.5 py-0.5 text-[11.5px] font-bold text-accent">
            <Icon name="arrow" size={12} /> {action}
          </span>
        )}
      </span>
      {right}
    </button>
  );
}
