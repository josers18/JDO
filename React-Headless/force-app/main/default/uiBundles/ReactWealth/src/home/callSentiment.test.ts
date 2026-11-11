import { describe, expect, it } from 'vitest';
import { callSentimentQueueItems, type CallSentiment, type TxSignalResult } from '@shared';

// Real BT_Gong_Call_Sentiment__dlm rows for Jose Sifontes' book, profile week 2026-11-09
// (pulled 2026-11-11). Gill has no call booked; Graham has never had notes logged.
const garcia: CallSentiment = {
  accountId: '001am00002A9fC4AAJ', sentiment: 'Very Negative', dealRisk: 74.85,
  nextCall: '2026-12-25', lastNote: '2026-10-26', topics: ['Competitor', 'Pricing'],
};
const graham: CallSentiment = {
  accountId: '001am00002AA8OFAA1', sentiment: 'Very Negative', dealRisk: 73.39,
  nextCall: '2027-01-03', lastNote: '', topics: ['FeatureRequest', 'Pricing'],
};
const gill: CallSentiment = {
  accountId: '001am00002A9g0RAAR', sentiment: 'Very Negative', dealRisk: 59.6,
  nextCall: '', lastNote: '2026-11-02', topics: ['Pricing'],
};
const ramirez: CallSentiment = {
  accountId: '001am00002AYONUAA5', sentiment: 'Negative', dealRisk: 56.44,
  nextCall: '', lastNote: '2026-11-08', topics: ['Competitor', 'FeatureRequest', 'Renewal'],
};
const conner: CallSentiment = {
  accountId: '001am00002A9flYAAR', sentiment: 'Negative', dealRisk: 55.14,
  nextCall: '2026-11-20', lastNote: '2026-09-10', topics: ['FeatureRequest', 'Pricing'],
};
const names = {
  '001am00002A9fC4AAJ': 'Garcia Household', '001am00002AA8OFAA1': 'Graham Household',
  '001am00002A9g0RAAR': 'Gill Household', '001am00002AYONUAA5': 'Ramirez Household',
  '001am00002A9flYAAR': 'Conner Household',
};
const opts = { segment: 'Wealth', now: new Date('2026-11-11T18:00:00Z') };
const res = (rows: CallSentiment[]): TxSignalResult<CallSentiment> => ({ rows, scope: 'book' });

describe('callSentimentQueueItems (S1, Wealth)', () => {
  it('makes a Very Negative household a high, due-today save call', () => {
    const [item] = callSentimentQueueItems(res([garcia]), names, opts);
    expect(item).toMatchObject({
      id: 'gs0',
      clientName: 'Garcia Household',
      segment: 'Wealth',
      reason: 'Very Negative & declining on calls · deal risk 75 · Competitor, Pricing',
      action: 'Relationship save call',
      severity: 'high',
      source: 'Gong call sentiment',
      dueDate: '2026-11-11',
    });
    expect(item.score).toBeCloseTo(0.874250);
  });

  it('skips the prep flag when the next call is more than 14 days out, even with no notes', () => {
    const [item] = callSentimentQueueItems(res([graham]), names, opts);
    expect(item.action).toBe('Relationship save call');
    expect(item.reason).not.toContain('notes stale');
  });

  it('handles a household with no call booked', () => {
    const [g, r] = callSentimentQueueItems(res([gill, ramirez]), names, opts);
    expect(g).toMatchObject({ reason: 'Very Negative & declining on calls · deal risk 60 · Pricing', severity: 'high', dueDate: '2026-11-11' });
    expect(r).toMatchObject({ id: 'gs1', severity: 'medium', action: 'Relationship save call', dueDate: '2026-11-13' });
  });

  it('flags a call in 9 days with two-month-old notes as prep, due the day before', () => {
    const [item] = callSentimentQueueItems(res([conner]), names, opts);
    expect(item).toMatchObject({
      reason: 'Negative & declining on calls · deal risk 55 · FeatureRequest, Pricing · call in 9d, notes stale',
      action: 'Prep for upcoming call — log notes',
      severity: 'medium',
      dueDate: '2026-11-19',
    });
    expect(item.score).toBeCloseTo(0.8257);
  });
});
