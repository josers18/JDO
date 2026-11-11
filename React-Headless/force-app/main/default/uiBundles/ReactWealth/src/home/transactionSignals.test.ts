import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Real S5 rows (ssot__FinancialAccountTransaction__dlm, last 7 days) pulled 2026-11-11.
// Marcus G Rodriguez's tax refund is in Jose Sifontes' book; Joshua V Arroyo's bonus
// is the org's largest and is in another banker's book.
const rodriguez = { account_id: '001am000026ZtgJAAS', amount: '4449.520000000000000000', description: 'IRS TREAS 310 TAX REF', tx_date: '2026-11-07 06:27:05.000 UTC' };
const arroyo = { account_id: '001am00002AYPeOAAX', amount: '35510.560000000000000000', description: 'Bonus', tx_date: '2026-11-07 06:54:06.000 UTC' };

const replies: unknown[][] = [];
vi.mock('@salesforce/platform-sdk', () => ({
  createDataSDK: async () => ({
    fetch: async () => {
      const rows = replies.shift() ?? [];
      return { ok: true, status: 200, json: async () => ({ columns: [], rows, rowCount: rows.length, warning: null }) };
    },
  }),
}));

const { fetchLargeInflows, inflowQueueItems, localDay } = await import('@shared');

// DC timestamps are UTC; the fetch reports the day in the banker's zone. Pin one.
const originalTz = process.env.TZ;
beforeEach(() => { process.env.TZ = 'America/Los_Angeles'; });
afterEach(() => { process.env.TZ = originalTz; });

const JOSE = '005am000003PbCLAA0';
const names = { '001am000026ZtgJAAS': 'Marcus G Rodriguez', '001am00002AYPeOAAX': 'Joshua V Arroyo' };
// homeDataReal's S5 options for Wealth.
const opts = { segment: 'Wealth', action: 'Invest new cash — portfolio top-up', now: new Date('2026-11-11T18:00:00Z') };
const load = (...pages: unknown[][]) => { replies.length = 0; replies.push(...pages); return fetchLargeInflows(JOSE); };

describe('fetchLargeInflows (S5 personal credits)', () => {
  it('reads a tax refund from the IRS description and dates it on the banker’s day', async () => {
    const res = await load([rodriguez]);
    // 06:27 UTC on Nov 7 is 10:27pm on Nov 6 in Los Angeles.
    expect(res).toEqual({
      scope: 'book',
      rows: [{ accountId: '001am000026ZtgJAAS', amount: 4449.52, kind: 'Tax refund', date: '2026-11-06' }],
    });
  });

  it('keeps the UTC day where it is already that day locally', async () => {
    process.env.TZ = 'Asia/Tokyo';
    // 06:27 UTC is 3:27pm in Tokyo, still Nov 7.
    expect((await load([rodriguez])).rows[0].date).toBe('2026-11-07');
  });

  it('falls back to the org when the book has no fresh credits', async () => {
    const res = await load([], [arroyo]);
    expect(res.scope).toBe('org');
    expect(res.rows[0]).toMatchObject({ accountId: '001am00002AYPeOAAX', amount: 35510.56, kind: 'Bonus' });
  });
});

describe('inflowQueueItems (S5, Wealth)', () => {
  it('turns a tax refund into a low-severity portfolio top-up with no payer', async () => {
    const [item] = inflowQueueItems(await load([rodriguez]), names, opts);
    expect(item).toMatchObject({
      id: 'tx0',
      clientName: 'Marcus G Rodriguez',
      segment: 'Wealth',
      reason: 'Tax refund deposit $4.4K on 2026-11-06',
      action: 'Invest new cash — portfolio top-up',
      severity: 'low',
      source: 'Transactions',
      relationshipValue: 4449.52,
      dueDate: '2026-11-11', // Nov 6 + 2 is past, so today
    });
    expect(item.score).toBeCloseTo(0.5444952);
  });

  it('makes a $35K bonus high and labels the org-wide fallback', async () => {
    const [item] = inflowQueueItems(await load([], [arroyo]), names, opts);
    expect(item).toMatchObject({
      clientName: 'Joshua V Arroyo',
      reason: 'Bonus deposit $35.5K on 2026-11-06',
      severity: 'high',
      source: 'Transactions · org-wide',
    });
    expect(item.score).toBeCloseTo(0.8551056);
  });
});

describe('localDay', () => {
  it('passes date-only values through in any zone', () => {
    process.env.TZ = 'Asia/Tokyo';
    expect(localDay('2026-11-09')).toBe('2026-11-09');
    process.env.TZ = 'America/Los_Angeles';
    expect(localDay('2026-11-09')).toBe('2026-11-09');
  });

  it('falls back to the first ten characters when it can’t parse the value', () => {
    expect(localDay('2026-11-07 not a time')).toBe('2026-11-07');
    expect(localDay(null)).toBe('');
  });
});
