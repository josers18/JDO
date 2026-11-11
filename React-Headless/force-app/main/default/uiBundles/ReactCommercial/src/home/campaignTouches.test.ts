import { afterEach, describe, expect, it } from 'vitest';
import { campaignTouchQueueItems, type CampaignTouch, type CampaignTouchResult } from '@shared';

// Real Marketing_Engagements__dlm row (Business persona), Allen Carter's book, 2026-11-11.
const sloan: CampaignTouch = {
  accountId: '001am00002AYRCDAA5', campaign: 'Payroll Services — November 2026', product: 'Payroll Services',
  clicks: 2, opens: 2, lastTouch: '2026-11-11',
};
const names = { '001am00002AYRCDAA5': 'Sloan Contractors' };
const res = (rows: CampaignTouch[], scope: 'book' | 'org' = 'book'): CampaignTouchResult => ({ rows, scope });

const original = process.env.TZ;
afterEach(() => { process.env.TZ = original; });

describe('campaignTouchQueueItems (S6)', () => {
  it('turns a click-through into a due-today product follow-up', () => {
    const [item] = campaignTouchQueueItems(res([sloan]), names, { segment: 'Commercial', now: new Date('2026-11-11T18:00:00Z') });
    expect(item).toMatchObject({
      id: 'mc0',
      clientName: 'Sloan Contractors',
      segment: 'Commercial',
      reason: 'Clicked "Payroll Services — November 2026" 2× (2 opens), last 2026-11-11',
      action: 'Follow up on Payroll Services interest',
      severity: 'medium',
      source: 'Marketing engagement',
      relationshipValue: 0,
      dueDate: '2026-11-11',
    });
    expect(item.score).toBeCloseTo(0.65);
  });

  it('keeps a single click at low severity and labels org-wide rows', () => {
    const [item] = campaignTouchQueueItems(res([{ ...sloan, clicks: 1 }], 'org'), names, { segment: 'Commercial' });
    expect(item.severity).toBe('low');
    expect(item.source).toBe('Marketing engagement · org-wide');
  });

  it('is due on the banker’s calendar day, not UTC’s', () => {
    process.env.TZ = 'America/Los_Angeles';
    // 6pm Nov 10 in Los Angeles is already Nov 11 in UTC.
    const [item] = campaignTouchQueueItems(res([sloan]), names, { segment: 'Commercial', now: new Date('2026-11-11T02:00:00Z') });
    expect(item.dueDate).toBe('2026-11-10');
  });
});
