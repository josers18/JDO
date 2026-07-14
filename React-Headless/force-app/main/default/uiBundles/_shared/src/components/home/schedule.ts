import type { ScheduleItem, ScheduleBucketKey } from './types';

/**
 * Assign each item an Overdue / Today / Upcoming bucket by comparing its ISO
 * date-string against today. ISO dates (YYYY-MM-DD) sort chronologically as
 * plain strings, so no timezone math is needed. Undated items ('—') fall into
 * Upcoming so nothing is silently dropped. Returns a new sorted array: overdue
 * group first (most-overdue on top, DESC), then today (ASC), then upcoming (ASC).
 */
export function tagSchedule(items: ScheduleItem[], todayISO?: string): ScheduleItem[] {
  const today = todayISO ?? new Date().toISOString().slice(0, 10);
  const bucketOf = (it: ScheduleItem): ScheduleBucketKey => {
    const d = (it.time || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return 'upcoming';
    if (d < today) return 'overdue';
    if (d === today) return 'today';
    return 'upcoming';
  };
  const tagged = items.map(it => ({ ...it, bucket: bucketOf(it) }));
  const order: Record<ScheduleBucketKey, number> = { overdue: 0, today: 1, upcoming: 2 };
  return tagged.sort((a, b) => {
    if (a.bucket !== b.bucket) return order[a.bucket!] - order[b.bucket!];
    // overdue newest-first (most recently overdue on top); today/upcoming soonest-first
    const dir = a.bucket === 'overdue' ? -1 : 1;
    return a.time < b.time ? -dir : a.time > b.time ? dir : 0;
  });
}

/** Bucket totals for the filter chips. Accepts tagged or untagged items. */
export function scheduleCounts(
  items: ScheduleItem[],
): { all: number; overdue: number; today: number; upcoming: number } {
  const tagged = items.every(i => i.bucket) ? items : tagSchedule(items);
  return {
    all: tagged.length,
    overdue: tagged.filter(i => i.bucket === 'overdue').length,
    today: tagged.filter(i => i.bucket === 'today').length,
    upcoming: tagged.filter(i => i.bucket === 'upcoming').length,
  };
}
