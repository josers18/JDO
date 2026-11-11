import { describe, expect, it } from 'vitest';
import { fundingQueueItems, type FundingSignalResult } from '@shared';

// BT_Harmonic_Company_Signals__dlm rows from the latest profile month (queried 2026-11-10);
// the first two are the funding items the Commercial queue showed that day.
const missoula = { accountId: '001am00000qvjsVAAQ', stage: 'Series C', status: 'Venture-Backed', roundUsd: 83_450_000, runwayMonths: 49, leadInvestor: 'Insight Partners', fundingDate: '2026-08-13' };
const techLabs = { accountId: '001am00000qvjsMAAQ', stage: 'Series B', status: 'Venture-Backed', roundUsd: 36_250_000, runwayMonths: 40, leadInvestor: 'Index Ventures', fundingDate: '2026-11-19' };
const seed = { accountId: '001Wt00000wg1CvIAI', stage: 'Seed', status: 'Angel-Seed', roundUsd: 2_900_000, runwayMonths: 41, leadInvestor: 'Insight Partners', fundingDate: '2026-09-10' };
const names = { '001am00000qvjsVAAQ': 'Missoula & Sons Inc.', '001am00000qvjsMAAQ': 'Tech Labs' };
const result = (over: Partial<FundingSignalResult> = {}): FundingSignalResult => ({ rows: [missoula, techLabs], funded: 2, scope: 'book', ...over });
const opts = { segment: 'Commercial', now: new Date('2026-11-10T17:00:00Z') };

describe('fundingQueueItems', () => {
  it('writes the round, runway and lead investor as the reason', () => {
    const items = fundingQueueItems(result(), names, opts);
    expect(items.map(i => i.reason)).toEqual([
      'Raised $83.5M Series C · 49 mo runway · led by Insight Partners',
      'Raised $36.3M Series B · 40 mo runway · led by Index Ventures',
    ]);
    expect(items.every(i => i.action === 'Excess-cash / treasury conversation')).toBe(true);
  });

  it('carries the client, segment and round size, and reserves a queue slot', () => {
    const [item] = fundingQueueItems(result(), names, opts);
    expect(item).toMatchObject({
      id: 'hf0',
      clientId: '001am00000qvjsVAAQ',
      clientName: 'Missoula & Sons Inc.',
      segment: 'Commercial',
      relationshipValue: 83_450_000,
      source: 'Harmonic funding',
      reserveSlot: true,
    });
  });

  it('is due two weeks after the round, never before today', () => {
    // Aug 13 + 14 days is long past, so it is due today.
    expect(fundingQueueItems(result(), names, opts)[0].dueDate).toBe('2026-11-10');
    const recent = { ...techLabs, fundingDate: '2026-11-05' };
    expect(fundingQueueItems(result({ rows: [recent] }), names, opts)[0].dueDate).toBe('2026-11-19');
  });

  it('counts a future funding date as today, so it is due in at most 14 days', () => {
    // Tech Labs' round is dated 2026-11-19, after `now`.
    expect(fundingQueueItems(result(), names, opts)[1].dueDate).toBe('2026-11-24');
  });

  it('ranks Series A and later above seed rounds', () => {
    const items = fundingQueueItems(result({ rows: [missoula, seed] }), names, opts);
    expect(items.map(i => [i.severity, i.score])).toEqual([['high', 0.8], ['medium', 0.6]]);
  });

  it('falls back to the account id and drops missing details', () => {
    const bare = { ...seed, runwayMonths: null, leadInvestor: null };
    const [item] = fundingQueueItems(result({ rows: [bare] }), names, opts);
    expect(item.clientName).toBe('001Wt00000wg1CvIAI');
    expect(item.reason).toBe('Raised $2.9M Seed');
  });

  it('marks org-wide results in the source', () => {
    expect(fundingQueueItems(result({ scope: 'org' }), names, opts)[0].source).toBe('Harmonic funding · org-wide');
  });
});
