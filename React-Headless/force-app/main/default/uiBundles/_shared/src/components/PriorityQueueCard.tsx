import { useMemo, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { Icon } from './iconMap';

export type QueueSeverity = 'high' | 'medium' | 'low';
export type QueueDueTier = 'today' | 'week' | 'watch';

/**
 * One priority-queue entry. `CallItem` (per-bundle) is structurally a superset
 * of this, so the page passes rows straight through with no mapping — the same
 * duck-typing the older `PriorityQueueRow` relied on.
 */
export interface PriorityQueueCardItem {
  id: string;
  clientName: string;
  /** The next move — rendered as the title suffix: "Name — Action". */
  action: string;
  /** The "why" line rendered as the muted subtitle. */
  reason: string;
  severity: QueueSeverity;
  /** 0..1 AI priority score — the default sort key. */
  score: number;
  /** Drives the "Due …" label + its urgency tone. */
  tier?: QueueDueTier;
}

type SortKey = 'priority' | 'due';

/** Severity → the shared token family (badge bg, pill, emphasis bar). */
const SEV_BADGE: Record<QueueSeverity, string> = {
  high: 'bg-risk text-white',
  medium: 'bg-warn text-white',
  low: 'bg-ok text-white',
};
const SEV_PILL: Record<QueueSeverity, string> = {
  high: 'bg-risk-bg text-risk',
  medium: 'bg-warn-bg text-warn',
  low: 'bg-accent-bg text-accent',
};
const SEV_LABEL: Record<QueueSeverity, string> = { high: 'High', medium: 'Medium', low: 'Low' };
const SEV_RANK: Record<QueueSeverity, number> = { high: 0, medium: 1, low: 2 };

/** Tier → due label + tone. Honest to the data we have (no per-row due date). */
const DUE: Record<QueueDueTier, { label: string; tone: string }> = {
  today: { label: 'Due today', tone: 'text-risk' },
  week: { label: 'Due this week', tone: 'text-muted' },
  watch: { label: 'Later', tone: 'text-faint' },
};
const DUE_RANK: Record<QueueDueTier, number> = { today: 0, week: 1, watch: 2 };

/**
 * The command-center Priority Queue card. Owns its header (title + count-labeled
 * filter chips + sort), a ranked list of rows (numbered severity-colored badge,
 * avatar, "Name — Action" + reason, severity pill, due label, chevron), and a
 * "View all →" footer. The top-ranked row is emphasized with a left bar + tint
 * in its severity color so the list reads as ranked, not a flat wall.
 *
 * Filtering and sorting are local UI state; the page owns the data and the
 * click/view-all handlers.
 */
export function PriorityQueueCard<T extends PriorityQueueCardItem>({
  items,
  onOpen,
  onViewAll,
  viewAllLabel = 'View all tasks & alerts',
  controls,
}: {
  items: T[];
  onOpen: (item: T) => void;
  onViewAll: () => void;
  viewAllLabel?: string;
  /** Optional extra header control (e.g. a "Draft all follow-ups" chip). */
  controls?: ReactNode;
}) {
  const [filter, setFilter] = useState<'all' | QueueSeverity>('all');
  const [sort, setSort] = useState<SortKey>('priority');

  const counts = useMemo(() => {
    const c = { all: items.length, high: 0, medium: 0, low: 0 };
    for (const it of items) c[it.severity]++;
    return c;
  }, [items]);

  const rows = useMemo(() => {
    const filtered = filter === 'all' ? items : items.filter(it => it.severity === filter);
    const sorted = [...filtered].sort((a, b) => {
      if (sort === 'due') {
        const d = DUE_RANK[a.tier ?? 'watch'] - DUE_RANK[b.tier ?? 'watch'];
        if (d !== 0) return d;
      }
      // Priority: severity first, then score — keeps High above a high-scoring Low.
      const s = SEV_RANK[a.severity] - SEV_RANK[b.severity];
      if (s !== 0) return s;
      return (b.score ?? 0) - (a.score ?? 0);
    });
    return sorted;
  }, [items, filter, sort]);

  const CHIPS: Array<{ key: 'all' | QueueSeverity; label: string; n: number }> = [
    { key: 'all', label: 'All', n: counts.all },
    { key: 'high', label: 'High', n: counts.high },
    { key: 'medium', label: 'Medium', n: counts.medium },
    { key: 'low', label: 'Low', n: counts.low },
  ];

  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      {/* Header: title + filter chips + sort */}
      <div className="border-b border-line px-5 pb-3.5 pt-4">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-[19px] font-semibold tracking-tight">Priority Queue</h2>
          <div className="ml-auto flex flex-none items-center gap-2">
            {controls}
            <label className="relative inline-flex items-center">
              <span className="pointer-events-none absolute left-3 font-mono text-[10.5px] uppercase tracking-[0.08em] text-faint">
                Sort:
              </span>
              <select
                value={sort}
                onChange={e => setSort(e.target.value as SortKey)}
                aria-label="Sort priority queue"
                className="cursor-pointer rounded-full border border-line bg-surface py-1.5 pl-[52px] pr-7 text-[12.5px] font-medium text-fg transition hover:border-line-strong focus:border-accent-border focus:outline-none"
              >
                <option value="priority">Priority</option>
                <option value="due">Due date</option>
              </select>
              <span className="pointer-events-none absolute right-3 text-[10px] text-faint">▾</span>
            </label>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {CHIPS.map(chip => {
            const active = filter === chip.key;
            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => setFilter(chip.key)}
                aria-pressed={active}
                className={clsx(
                  'rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition',
                  active
                    ? 'bg-accent text-white'
                    : 'text-muted hover:bg-surface-muted hover:text-fg',
                )}
              >
                {chip.label} <span className={clsx('font-mono text-[11px]', active ? 'text-white/80' : 'text-faint')}>({chip.n})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Rows */}
      <div>
        {rows.length === 0 ? (
          <div className="px-5 py-10 text-center text-[13px] text-faint">No items match this filter.</div>
        ) : (
          rows.map((item, i) => {
            const emphasis = i === 0;
            const due = DUE[item.tier ?? 'watch'];
            return (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => onOpen(item)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onOpen(item);
                  }
                }}
                className={clsx(
                  'group relative flex cursor-pointer items-center gap-3.5 border-b border-line px-5 py-3.5 transition last:border-b-0 hover:bg-surface-muted',
                  emphasis && (item.severity === 'high' ? 'bg-risk-bg/40' : 'bg-accent-bg/30'),
                )}
              >
                {emphasis && (
                  <span
                    aria-hidden="true"
                    className={clsx(
                      'absolute inset-y-0 left-0 w-[3px]',
                      item.severity === 'high' ? 'bg-risk' : 'bg-accent',
                    )}
                  />
                )}
                {/* Numbered severity-colored badge */}
                <span
                  className={clsx(
                    'grid h-7 w-7 flex-none place-items-center rounded-full text-[12px] font-bold tabular-nums',
                    SEV_BADGE[item.severity],
                  )}
                >
                  {i + 1}
                </span>
                {/* Avatar */}
                <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-surface-muted text-muted">
                  <Icon name="clients" size={15} />
                </span>
                {/* Title + reason */}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-semibold text-fg" title={`${item.clientName} — ${item.action}`}>
                    {item.clientName} <span className="text-muted">— {item.action}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-[12.5px] text-muted" title={item.reason}>
                    {item.reason}
                  </span>
                </span>
                {/* Severity pill */}
                <span
                  className={clsx(
                    'flex-none rounded-full px-2.5 py-1 text-[11px] font-semibold',
                    SEV_PILL[item.severity],
                  )}
                >
                  {SEV_LABEL[item.severity]}
                </span>
                {/* Due + chevron */}
                <span className={clsx('hidden flex-none text-[12.5px] font-medium sm:inline', due.tone)}>{due.label}</span>
                <span className="flex-none text-[15px] text-faint transition group-hover:text-muted">›</span>
              </div>
            );
          })
        )}
      </div>

      {/* View all footer */}
      <button
        type="button"
        onClick={onViewAll}
        className="flex w-full items-center gap-2 px-5 py-4 text-left text-[13px] font-semibold text-accent transition hover:bg-surface-muted"
      >
        {viewAllLabel} <span aria-hidden="true">→</span>
      </button>
    </div>
  );
}
