import { useMemo, useState } from 'react';
import { Icon } from '../iconMap';
import { scheduleCounts } from './schedule';
import type { ScheduleItem, ScheduleBucketKey } from './types';

type BucketFilter = 'all' | ScheduleBucketKey;
type KindFilter = 'all' | 'tasks' | 'meetings';

const BUCKET_CHIP: Record<ScheduleBucketKey, { label: string; chip: string }> = {
  overdue: { label: 'Overdue', chip: 'bg-risk-bg text-risk' },
  today: { label: 'Today', chip: 'bg-accent-bg text-accent' },
  upcoming: { label: 'Upcoming', chip: 'bg-track text-muted' },
};

function isMeeting(it: ScheduleItem): boolean {
  return it.kind === 'meeting' || it.kind === 'call';
}

export function ScheduleTable({
  items,
  onOpen,
}: {
  items: ScheduleItem[];
  onOpen: (item: ScheduleItem) => void;
}) {
  const [bucket, setBucket] = useState<BucketFilter>('all');
  const [kind, setKind] = useState<KindFilter>('all');
  const counts = useMemo(() => scheduleCounts(items), [items]);

  const rows = items.filter(it => {
    if (bucket !== 'all' && it.bucket !== bucket) return false;
    if (kind === 'tasks' && isMeeting(it)) return false;
    if (kind === 'meetings' && !isMeeting(it)) return false;
    return true;
  });

  const chip = (key: BucketFilter, label: string, count: number) => (
    <button
      key={key}
      type="button"
      onClick={() => setBucket(key)}
      className={`rounded-full px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] transition ${
        bucket === key ? 'bg-fg text-bg' : 'bg-track text-muted hover:text-fg'
      }`}
    >
      {label} <span className="opacity-70">{count}</span>
    </button>
  );

  const kindChip = (key: KindFilter, label: string) => (
    <button
      key={key}
      type="button"
      onClick={() => setKind(key)}
      className={`rounded-full px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] transition ${
        kind === key ? 'bg-accent-bg text-accent' : 'bg-track text-muted hover:text-fg'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="rounded-[18px] border border-line bg-surface-glass shadow-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        {chip('all', 'All', counts.all)}
        {chip('overdue', 'Overdue', counts.overdue)}
        {chip('today', 'Today', counts.today)}
        {chip('upcoming', 'Upcoming', counts.upcoming)}
        <span className="mx-1 h-4 w-px bg-line" />
        {kindChip('all', 'All types')}
        {kindChip('tasks', 'Tasks')}
        {kindChip('meetings', 'Meetings')}
      </div>

      {rows.length === 0 ? (
        <p className="px-5 py-6 text-[13px] text-muted">Nothing in this view.</p>
      ) : (
        <ul>
          {rows.map(it => {
            const b = it.bucket ?? 'upcoming';
            const meeting = isMeeting(it);
            return (
              <li key={it.id}>
                <div
                  role="button"
                  aria-label={`Open ${it.title}`}
                  onClick={() => onOpen(it)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onOpen(it);
                    }
                  }}
                  tabIndex={0}
                  className="flex w-full cursor-pointer items-center gap-3 border-b border-line px-5 py-3 text-left transition last:border-b-0 hover:bg-track/50"
                >
                  <span
                    className={`grid h-8 w-8 flex-none place-items-center rounded-[9px] ${
                      meeting ? 'bg-accent-bg text-accent' : 'bg-track text-muted'
                    }`}
                  >
                    <Icon name={meeting ? 'call' : 'task'} size={14} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium text-fg">{it.title}</span>
                    {it.clientName && <span className="block truncate text-[12px] text-muted">{it.clientName}</span>}
                  </span>
                  <span className={`flex-none rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] ${BUCKET_CHIP[b].chip}`}>
                    {BUCKET_CHIP[b].label}
                  </span>
                  {it.priority === 'High' && (
                    <span className="flex-none rounded-full bg-risk-bg px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-risk">High</span>
                  )}
                  <span className="flex-none font-mono text-[11px] text-muted">{it.time}</span>
                  <Icon name="arrow" size={14} className="flex-none text-faint" />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
