import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CampaignTouch, CampaignTouchResult } from '@shared';

// The DC bridge answers each POST in order (book query, then the org fallback).
const replies: unknown[][] = [];
vi.mock('@salesforce/platform-sdk', () => ({
  createDataSDK: async () => ({
    fetch: async () => {
      const rows = replies.shift() ?? [];
      return { ok: true, status: 200, json: async () => ({ columns: [], rows, rowCount: rows.length, warning: null }) };
    },
  }),
}));

const { campaignTouchQueueItems, fetchCampaignTouches } = await import('@shared');

const originalTz = process.env.TZ;
afterEach(() => { process.env.TZ = originalTz; });

// Real Marketing_Engagements__dlm rows (Personal persona), 2026-11-11. Jose Sifontes'
// book has no Personal click-throughs, so Wealth shows the org-wide rows.
const freeman: CampaignTouch = {
  accountId: '001am00002AYPmZAAX', campaign: 'Rewards Credit Card Offer — November 2026', product: 'Credit Card',
  clicks: 2, opens: 2, lastTouch: '2026-11-11',
};
const hernandez: CampaignTouch = {
  accountId: '001am00002A9fjCAAR', campaign: 'Retirement Readiness — October 2026', product: 'Retirement Account',
  clicks: 2, opens: 2, lastTouch: '2026-10-23', // 00:58 UTC Oct 24, the evening before in Los Angeles
};
const names = { '001am00002AYPmZAAX': 'Joshua N Freeman', '001am00002A9fjCAAR': 'James S Hernandez' };
const res = (rows: CampaignTouch[]): CampaignTouchResult => ({ rows, scope: 'org' });
const opts = { segment: 'Wealth', now: new Date('2026-11-11T18:00:00Z') };

describe('campaignTouchQueueItems (S6, Wealth)', () => {
  it('turns a personal click-through into a due-today follow-up, labelled org-wide', () => {
    const [item] = campaignTouchQueueItems(res([freeman]), names, opts);
    expect(item).toMatchObject({
      id: 'mc0',
      clientName: 'Joshua N Freeman',
      segment: 'Wealth',
      reason: 'Clicked "Rewards Credit Card Offer — November 2026" 2× (2 opens), last 2026-11-11',
      action: 'Follow up on Credit Card interest',
      severity: 'medium',
      source: 'Marketing engagement · org-wide',
      relationshipValue: 0,
      dueDate: '2026-11-11',
    });
    expect(item.score).toBeCloseTo(0.65);
  });

  it('keeps an older click due today too, since the interest is already cooling', () => {
    const [, item] = campaignTouchQueueItems(res([freeman, hernandez]), names, opts);
    expect(item).toMatchObject({
      id: 'mc1',
      reason: 'Clicked "Retirement Readiness — October 2026" 2× (2 opens), last 2026-10-23',
      action: 'Follow up on Retirement Account interest',
      dueDate: '2026-11-11',
    });
  });
});

describe('fetchCampaignTouches (S6, Personal)', () => {
  // The raw rows behind Freeman and Hernandez: last_at is a UTC timestamp.
  const raw = [
    { account_id: '001am00002AYPmZAAX', campaign: 'Rewards Credit Card Offer — November 2026', product: 'Credit Card', clicks: 2, opens: 2, last_at: '2026-11-11 13:05:57.026 UTC' },
    { account_id: '001am00002A9fjCAAR', campaign: 'Retirement Readiness — October 2026', product: 'Retirement Account', clicks: 2, opens: 2, last_at: '2026-10-24 00:58:13.072 UTC' },
  ];
  const load = () => { replies.length = 0; replies.push([], raw); return fetchCampaignTouches('005am000003PbCLAA0', 'Personal'); };

  it('dates the last click on the banker’s day, not UTC’s', async () => {
    process.env.TZ = 'America/Los_Angeles';
    const res = await load();
    expect(res.scope).toBe('org');
    // 00:58 UTC on Oct 24 is 5:58pm on Oct 23 in Los Angeles; 13:05 UTC Nov 11 is still Nov 11.
    expect(res.rows.map(r => r.lastTouch)).toEqual(['2026-11-11', '2026-10-23']);
    expect(res.rows[1]).toEqual(hernandez);
  });

  it('keeps the UTC day east of UTC when it is already that day', async () => {
    process.env.TZ = 'Asia/Tokyo';
    expect((await load()).rows.map(r => r.lastTouch)).toEqual(['2026-11-11', '2026-10-24']);
  });
});
