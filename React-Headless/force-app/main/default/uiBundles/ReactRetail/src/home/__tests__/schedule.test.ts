import { describe, it, expect } from 'vitest';
import { tagSchedule, scheduleCounts, type ScheduleItem } from '@shared';

const TODAY = '2026-07-14';
const items: ScheduleItem[] = [
  { id: 'a', time: '2026-07-10', title: 'Overdue task', kind: 'task' },
  { id: 'b', time: '2026-07-14', title: 'Today task', kind: 'task' },
  { id: 'c', time: '2026-07-20', title: 'Future meeting', kind: 'meeting' },
  { id: 'd', time: '—', title: 'No date', kind: 'task' },
];

describe('tagSchedule', () => {
  it('assigns bucket by date vs today', () => {
    const m = new Map(tagSchedule(items, TODAY).map(i => [i.id, i.bucket]));
    expect(m.get('a')).toBe('overdue');
    expect(m.get('b')).toBe('today');
    expect(m.get('c')).toBe('upcoming');
  });
  it('puts undated items in upcoming (nothing dropped)', () => {
    expect(tagSchedule(items, TODAY).find(i => i.id === 'd')?.bucket).toBe('upcoming');
  });
  it('orders overdue group before today before upcoming', () => {
    const buckets = tagSchedule(items, TODAY).map(i => i.bucket);
    const firstToday = buckets.indexOf('today');
    const firstUpcoming = buckets.indexOf('upcoming');
    expect(buckets.indexOf('overdue')).toBeLessThan(firstToday);
    expect(firstToday).toBeLessThan(firstUpcoming);
  });
});

describe('scheduleCounts', () => {
  it('counts each bucket and all', () => {
    const c = scheduleCounts(tagSchedule(items, TODAY));
    expect(c.all).toBe(4);
    expect(c.overdue).toBe(1);
    expect(c.today).toBe(1);
    expect(c.upcoming).toBe(2);
  });
});
