import { afterEach, describe, expect, it } from 'vitest';
import { localIsoDate } from '@shared';
import { dueFrom } from '@shared/data/transactionSignals';

// Node re-reads process.env.TZ on assignment, so each case runs in a real zone.
const original = process.env.TZ;
afterEach(() => { process.env.TZ = original; });
const inZone = <T>(tz: string, fn: () => T): T => { process.env.TZ = tz; return fn(); };

// 2026-11-10 17:00Z: Nov 10 in the US and UTC, already Nov 11 in Tokyo.
const afternoon = new Date('2026-11-10T17:00:00Z');
// 2026-11-11 01:30Z: still Nov 10 (5:30pm) in Los Angeles, Nov 11 in UTC.
const ptEvening = new Date('2026-11-11T01:30:00Z');

describe('localIsoDate', () => {
  it.each([
    ['America/Los_Angeles', '2026-11-12'],
    ['America/New_York', '2026-11-12'],
    ['UTC', '2026-11-12'],
    ['Asia/Tokyo', '2026-11-13'],
  ])('adds days to the banker’s calendar date in %s', (tz, want) => {
    expect(inZone(tz, () => localIsoDate(afternoon, 2))).toBe(want);
  });

  it('keeps a Los Angeles evening on its own date', () => {
    expect(inZone('America/Los_Angeles', () => localIsoDate(ptEvening))).toBe('2026-11-10');
  });

  it('crosses month ends and the DST change', () => {
    expect(inZone('America/Los_Angeles', () => localIsoDate(new Date('2026-10-30T17:00:00Z'), 3))).toBe('2026-11-02');
  });
});

describe('dueFrom', () => {
  it('is due today on a Los Angeles evening, not tomorrow', () => {
    expect(inZone('America/Los_Angeles', () => dueFrom('', 0, ptEvening))).toBe('2026-11-10');
  });

  it('adds the SLA to the signal date', () => {
    expect(inZone('Asia/Tokyo', () => dueFrom('2026-11-12', 14, afternoon))).toBe('2026-11-26');
  });

  it('never falls before today', () => {
    expect(inZone('America/Los_Angeles', () => dueFrom('2026-08-13', 14, afternoon))).toBe('2026-11-10');
  });

  it('falls back to today on an unparseable date', () => {
    expect(inZone('UTC', () => dueFrom('not-a-date', 3, afternoon))).toBe('2026-11-10');
  });
});
