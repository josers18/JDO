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
 *
 * `rank` gives the row its 1-based position in the ranked queue. The top item
 * (`rank === 1`) is emphasized — accent wash + "Top priority" flag + a persistent
 * action rail — so the list reads as ranked rather than a wall of identical
 * rows. Lower-ranked rows keep their action rail hidden until hover/focus, which
 * quiets the column; the buttons stay in the DOM so keyboard/AT users still
 * reach them via `focus-within`.
 */
export function PriorityQueueRow({
  item,
  rank,
  onOpenQuickView,
  onWhy,
  onPrep,
  onCall,
  onEmail,
  onTask,
}: {
  item: PriorityQueueRowItem;
  rank?: number;
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

  const emphasis = rank === 1;

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
      className={clsx(
        'group relative flex cursor-pointer items-center gap-4 border-b border-line px-5 py-4 transition last:border-b-0 hover:bg-surface-muted',
        emphasis && 'bg-accent-bg/40 ring-1 ring-inset ring-accent-border',
      )}
    >
      <div className="flex-none">
        <ScoreRing value={Math.round(item.score * 100)} tone={TIER_TONE[item.tier ?? 'watch']} size={44} />
      </div>
      <div className="min-w-0 flex-1">
        <div className={clsx('flex items-center gap-2.5 font-semibold', emphasis ? 'text-[16px]' : 'text-[15px]')}>
          {rank != null && (
            <span className="flex-none font-mono text-[11px] tabular-nums text-faint">{rank}</span>
          )}
          <span className="truncate" title={item.clientName}>{item.clientName}</span>
          {emphasis && (
            <span className="flex-none rounded-full bg-accent px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-white">
              Top priority
            </span>
          )}
          <span className="flex-none rounded-[5px] bg-track px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted">
            {item.segment}
          </span>
          <span className="flex-none text-[12px] text-faint">›</span>
        </div>
        <p className="mt-1.5 truncate text-[13px] text-muted" title={item.reason}>{item.reason}</p>
        <span className="mt-1.5 inline-block font-mono text-[9.5px] uppercase tracking-[0.1em] text-faint">{item.source}</span>
      </div>
      {/* Action rail floats over the row's right edge instead of occupying a grid
          track — so the name column keeps the full row width. Hidden until
          hover/focus (persistent on the emphasized #1 row); the backdrop keeps
          the buttons legible over any text they overlap. */}
      <div
        className={clsx(
          'absolute right-4 top-1/2 flex -translate-y-1/2 items-center gap-1.5 rounded-full border border-line bg-surface/95 px-2 py-1.5 shadow-card backdrop-blur transition-opacity focus-within:pointer-events-auto focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100',
          !emphasis && 'pointer-events-none opacity-0',
        )}
      >
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
