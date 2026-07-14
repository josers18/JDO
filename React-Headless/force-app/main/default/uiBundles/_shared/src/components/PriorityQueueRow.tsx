import clsx from 'clsx';
import { ScoreRing, type RingTone } from './ScoreRing';
import { Icon } from './iconMap';

export type QueueTier = 'today' | 'week' | 'watch';

export interface PriorityQueueRowItem {
  clientName: string;
  segment: string;
  reason: string;
  source: string;
  /** 0..1 AI priority score. */
  score: number;
  tier?: QueueTier;
}

const TIER_TONE: Record<QueueTier, RingTone> = {
  today: 'risk',
  week: 'warn',
  watch: 'accent',
};

/**
 * One "who to act on" row: a score ring + name/segment/why/source and the
 * per-row action rail (Why / Prep / Call / Email / Task). Presentational —
 * clicking the row opens the 360 quick view; the action buttons are wired by
 * the page and stop propagation so they don't also open the quick view.
 */
export function PriorityQueueRow({
  item,
  onOpenQuickView,
  onWhy,
  onPrep,
  onCall,
  onEmail,
  onTask,
}: {
  item: PriorityQueueRowItem;
  onOpenQuickView: () => void;
  onWhy: () => void;
  onPrep: () => void;
  onCall: () => void;
  onEmail: () => void;
  onTask: () => void;
}) {
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpenQuickView}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpenQuickView();
        }
      }}
      className="grid cursor-pointer grid-cols-[44px_1fr_auto] items-center gap-4 border-b border-line px-5 py-4 transition last:border-b-0 hover:bg-surface-muted"
    >
      <ScoreRing value={Math.round(item.score * 100)} tone={TIER_TONE[item.tier ?? 'watch']} size={44} />
      <div className="min-w-0">
        <div className="flex items-center gap-2.5 text-[15px] font-semibold">
          <span className="truncate">{item.clientName}</span>
          <span className="rounded-[5px] bg-track px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted">
            {item.segment}
          </span>
          <span className="text-[12px] text-faint">›</span>
        </div>
        <p className="mt-1.5 max-w-[64ch] text-[13px] text-muted">{item.reason}</p>
        <span className="mt-1.5 inline-block font-mono text-[9.5px] uppercase tracking-[0.1em] text-faint">{item.source}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={stop(onWhy)}
          className="rounded-[9px] border border-line px-3 py-1.5 text-[11.5px] text-muted transition hover:border-line-strong hover:text-fg"
        >
          Why?
        </button>
        <IconAction label="Prep me" onClick={stop(onPrep)} className="border-ai-border text-ai">✦</IconAction>
        <IconAction label="Call" onClick={stop(onCall)}><Icon name="call" size={14} /></IconAction>
        <IconAction label="Email" onClick={stop(onEmail)}><Icon name="email" size={14} /></IconAction>
        <IconAction label="Task" onClick={stop(onTask)}><Icon name="task" size={14} /></IconAction>
      </div>
    </div>
  );
}

function IconAction({
  label,
  onClick,
  className,
  children,
}: {
  label: string;
  onClick: (e: React.MouseEvent) => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={clsx(
        'grid h-[34px] w-[34px] place-items-center rounded-[9px] border border-line text-muted transition hover:border-accent-border hover:bg-accent-bg hover:text-accent',
        className,
      )}
    >
      {children}
    </button>
  );
}
