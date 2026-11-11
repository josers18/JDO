import { describe, expect, it } from 'vitest';
import { CONCENTRATION_THRESHOLD, concentrationQueueItems, type HoldingsConcentrationResult } from '@shared';

// Jose's book as the W8 Concentration risk card showed it on 2026-11-10:
// 1 of 13 clients concentrated, Julie E Morris with MSFT at 31% ($586.8K of $1.9M, 20 positions).
const julie = {
  accountId: 'julie',
  ticker: 'MSFT',
  issuer: 'Microsoft Corporation',
  positionUsd: 586_800,
  totalUsd: 1_893_000,
  weight: 0.31,
  positions: 20,
};
const book = (over: Partial<HoldingsConcentrationResult> = {}): HoldingsConcentrationResult => ({
  scope: 'book',
  clients: 13,
  concentrated: 1,
  aum: 4_900_000,
  singleStockShare: 0.76,
  rows: [julie],
  exposures: [],
  ...over,
});
const opts = { segment: 'Wealth', now: new Date('2026-11-10T17:00:00Z') };

describe('concentrationQueueItems', () => {
  it('flags a single stock at 20% or more', () => {
    expect(CONCENTRATION_THRESHOLD).toBe(0.2);
  });

  it('turns the concentrated client into a diversification review due in a week', () => {
    const [item] = concentrationQueueItems(book(), { julie: 'Julie E Morris' }, opts);
    expect(item).toMatchObject({
      id: 'hc0',
      clientId: 'julie',
      clientName: 'Julie E Morris',
      segment: 'Wealth',
      reason: 'MSFT is 31% of holdings ($586.8K of $1.9M)',
      action: 'Diversification review — trim or hedge',
      severity: 'low',
      source: 'CRM holdings',
      relationshipValue: 1_893_000,
      dueDate: '2026-11-17',
    });
    expect(item.score).toBeCloseTo(0.71);
  });

  it('raises severity at 35% and caps the score at 0.85', () => {
    const [heavy] = concentrationQueueItems(book({ rows: [{ ...julie, weight: 0.6 }] }), {}, opts);
    expect(heavy.severity).toBe('medium');
    expect(heavy.score).toBe(0.85);
  });

  it('queues at most three clients and falls back to the account id', () => {
    const rows = ['a', 'b', 'c', 'd'].map(accountId => ({ ...julie, accountId }));
    const items = concentrationQueueItems(book({ rows }), {}, opts);
    expect(items.map(i => i.clientName)).toEqual(['a', 'b', 'c']);
  });

  it('marks org-wide results in the source', () => {
    const [item] = concentrationQueueItems(book({ scope: 'org' }), {}, opts);
    expect(item.source).toBe('CRM holdings · org-wide');
  });
});
