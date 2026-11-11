import { describe, expect, it } from 'vitest';
import { liquidityQueueItems, type JobChangeResult, type JobChangeRow } from '@shared';

// Real UserGems liquidity events from the last 180 days (BT_UserGems_Job_Changes__dlm, 2026-11-10).
// accountId is the person account; employerId is the employer they left.
const row = (over: Partial<JobChangeRow>): JobChangeRow => ({
  accountId: '', employerId: '', newEmployerId: null, newEmployerName: null, contactName: '', title: '',
  persona: '', wasChampion: false, riskScore: null, opportunityScore: null, detectedDate: '', ...over,
});
const charlotte = row({
  accountId: '001am00002AAARTAA5', employerId: '001am00002AAAkoAAH', contactName: 'Diego Garcia',
  newEmployerName: 'Ironbridge Ridge Foods Inc', opportunityScore: 99, detectedDate: '2026-05-24',
});
const brett = row({
  accountId: '001am00002AAAYMAA5', employerId: '001am00002A9jjXAAR', contactName: 'Michael Smith',
  opportunityScore: 40, detectedDate: '2026-10-29',
});
const names = {
  '001am00002AAARTAA5': 'Charlotte Y Moyer',
  '001am00002AAAkoAAH': 'Howard-Lee Practice',
  '001am00002AAAYMAA5': 'Brett A Watson',
  '001am00002A9jjXAAR': 'Watson LLC Outlet',
};
const result = (rows: JobChangeRow[], scope: JobChangeResult['scope'] = 'book'): JobChangeResult => ({ rows, total: rows.length, scope });
const opts = { segment: 'Wealth', now: new Date('2026-11-10T17:00:00Z') };

describe('liquidityQueueItems', () => {
  it('turns a high-opportunity departure into a liquidity conversation', () => {
    const [item] = liquidityQueueItems(result([charlotte]), names, opts);
    expect(item).toMatchObject({
      id: 'ul0',
      clientId: '001am00002AAARTAA5',
      clientName: 'Charlotte Y Moyer',
      segment: 'Wealth',
      reason: 'Charlotte Y Moyer left Howard-Lee Practice for Ironbridge Ridge Foods Inc · liquidity event',
      action: 'Liquidity conversation — rollover / equity proceeds',
      severity: 'high',
      source: 'UserGems liquidity',
      relationshipValue: 0,
      reserveSlot: true,
    });
    expect(item.score).toBeCloseTo(0.83);
  });

  it('is due a week after detection, but never before today', () => {
    expect(liquidityQueueItems(result([charlotte]), names, opts)[0].dueDate).toBe('2026-11-10');
    const early = { ...opts, now: new Date('2026-10-30T17:00:00Z') };
    expect(liquidityQueueItems(result([brett]), names, early)[0].dueDate).toBe('2026-11-05');
  });

  it('drops the new employer when there is none and grades opportunity below 70 as medium', () => {
    const [item] = liquidityQueueItems(result([brett]), names, opts);
    expect(item.reason).toBe('Brett A Watson left Watson LLC Outlet · liquidity event');
    expect(item.severity).toBe('medium');
    expect(item.score).toBeCloseTo(0.6333, 3);
  });

  it('names a new employer from CRM when it is an account', () => {
    const moved = { ...brett, newEmployerId: '001am00002AAAkoAAH', newEmployerName: 'stale name' };
    const [item] = liquidityQueueItems(result([moved]), names, opts);
    expect(item.reason).toBe('Brett A Watson left Watson LLC Outlet for Howard-Lee Practice · liquidity event');
  });

  it('falls back to the UserGems contact name and "their employer" outside CRM, and marks org-wide', () => {
    const [item] = liquidityQueueItems(result([{ ...brett, opportunityScore: null }], 'org'), {}, opts);
    expect(item.reason).toBe('Michael Smith left their employer · liquidity event');
    expect(item.clientName).toBe('001am00002AAAYMAA5');
    expect(item.score).toBe(0.5);
    expect(item.source).toBe('UserGems liquidity · org-wide');
  });
});
