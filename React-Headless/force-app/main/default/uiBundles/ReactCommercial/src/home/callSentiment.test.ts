import { describe, expect, it } from 'vitest';
import { callSentimentQueueItems, type CallSentiment, type TxSignalResult } from '@shared';

// Real BT_Gong_Call_Sentiment__dlm rows, profile week 2026-11-09 (pulled 2026-11-11).
// Cameron-Olson and Carr Builders are in Allen Carter's book; the prep cases
// (a call within 14 days and stale or missing notes) are org-wide.
const cameronOlson: CallSentiment = {
  accountId: '001am00002AAAvtAAH', sentiment: 'Very Negative', dealRisk: 87.3,
  nextCall: '2026-12-20', lastNote: '2026-11-06', topics: ['Competitor'],
};
const carr: CallSentiment = {
  accountId: '001am00002AAAgrAAH', sentiment: 'Negative', dealRisk: 70.79,
  nextCall: '2027-01-04', lastNote: '2026-09-10', topics: ['Competitor', 'Pricing', 'Renewal'],
};
const walker: CallSentiment = {
  accountId: '001am00002AAB1GAAX', sentiment: 'Negative', dealRisk: 66.69,
  nextCall: '2026-11-11', lastNote: '', topics: ['Competitor', 'FeatureRequest'],
};
const conner: CallSentiment = {
  accountId: '001am00002A9flYAAR', sentiment: 'Negative', dealRisk: 55.14,
  nextCall: '2026-11-20', lastNote: '2026-09-10', topics: ['FeatureRequest', 'Pricing'],
};
const rhondaJones: CallSentiment = {
  accountId: '001am00002A9fJdAAJ', sentiment: 'Negative', dealRisk: 61.77,
  nextCall: '2026-11-16', lastNote: '2026-11-08', topics: ['Competitor', 'Pricing', 'Renewal'],
};

const names = {
  '001am00002AAAvtAAH': 'Cameron-Olson Construction',
  '001am00002AAAgrAAH': 'Carr Builders',
  '001am00002AAB1GAAX': 'Walker PLC Group',
  '001am00002A9flYAAR': 'Conner Household',
  '001am00002A9fJdAAJ': 'Rhonda T Jones',
};
const opts = { segment: 'Commercial', now: new Date('2026-11-11T18:00:00Z') };
const res = (rows: CallSentiment[], scope: 'book' | 'org' = 'book'): TxSignalResult<CallSentiment> => ({ rows, scope });

describe('callSentimentQueueItems (S1)', () => {
  it('makes Very Negative calls a high, due-today save call', () => {
    const [item] = callSentimentQueueItems(res([cameronOlson]), names, opts);
    expect(item).toMatchObject({
      id: 'gs0',
      clientName: 'Cameron-Olson Construction',
      segment: 'Commercial',
      reason: 'Very Negative & declining on calls · deal risk 87 · Competitor',
      action: 'Relationship save call',
      severity: 'high',
      source: 'Gong call sentiment',
      relationshipValue: 0,
      dueDate: '2026-11-11',
    });
    expect(item.score).toBeCloseTo(0.9365);
  });

  it('keeps Negative under deal risk 75 at medium, due in two days', () => {
    const [item] = callSentimentQueueItems(res([carr]), names, opts);
    expect(item).toMatchObject({
      reason: 'Negative & declining on calls · deal risk 71 · Competitor, Pricing, Renewal',
      action: 'Relationship save call',
      severity: 'medium',
      dueDate: '2026-11-13',
    });
  });

  it('flags a call today with no notes logged as prep, due today', () => {
    const [item] = callSentimentQueueItems(res([walker], 'org'), names, opts);
    expect(item).toMatchObject({
      reason: 'Negative & declining on calls · deal risk 67 · Competitor, FeatureRequest · call in 0d, notes stale',
      action: 'Prep for upcoming call — log notes',
      severity: 'medium',
      source: 'Gong call sentiment · org-wide',
      dueDate: '2026-11-11',
    });
    expect(item.score).toBeCloseTo(0.88345);
  });

  it('flags notes older than 21 days before a call in 9 days, due the day before it', () => {
    const [item] = callSentimentQueueItems(res([conner]), names, opts);
    expect(item.reason).toBe('Negative & declining on calls · deal risk 55 · FeatureRequest, Pricing · call in 9d, notes stale');
    expect(item.dueDate).toBe('2026-11-19');
  });

  it('skips the prep flag when notes are fresh, even with a call coming up', () => {
    const [item] = callSentimentQueueItems(res([rhondaJones]), names, opts);
    expect(item.action).toBe('Relationship save call');
    expect(item.reason).not.toContain('notes stale');
  });
});
