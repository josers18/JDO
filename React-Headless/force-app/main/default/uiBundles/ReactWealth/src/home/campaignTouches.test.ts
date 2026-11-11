import { describe, expect, it } from 'vitest';
import { campaignTouchQueueItems, type CampaignTouch, type CampaignTouchResult } from '@shared';

// Real Marketing_Engagements__dlm rows (Personal persona), 2026-11-11. Jose Sifontes'
// book has no Personal click-throughs, so Wealth shows the org-wide rows.
const freeman: CampaignTouch = {
  accountId: '001am00002AYPmZAAX', campaign: 'Rewards Credit Card Offer — November 2026', product: 'Credit Card',
  clicks: 2, opens: 2, lastTouch: '2026-11-11',
};
const hernandez: CampaignTouch = {
  accountId: '001am00002A9fjCAAR', campaign: 'Retirement Readiness — October 2026', product: 'Retirement Account',
  clicks: 2, opens: 2, lastTouch: '2026-10-24',
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
      reason: 'Clicked "Retirement Readiness — October 2026" 2× (2 opens), last 2026-10-24',
      action: 'Follow up on Retirement Account interest',
      dueDate: '2026-11-11',
    });
  });
});
