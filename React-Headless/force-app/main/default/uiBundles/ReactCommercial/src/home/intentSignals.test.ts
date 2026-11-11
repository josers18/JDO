import { describe, expect, it } from 'vitest';
import { intentQueueItems, type IntentSignalResult, type IntentSignalRow } from '@shared';

// Real Demandbase rows, week of 2026-11-09 (BT_Demandbase_Intent_Signals__dlm).
const montgomery: IntentSignalRow = {
  accountId: '001am00002A9jqjAAB', kind: 'competitor', topic: 'International Payments and FX', stage: 'Purchase',
  intentScore: 100, researchers: 28, competitor: 'Live Oak Bank', signalDate: '2026-11-07',
};
const wagner: IntentSignalRow = {
  accountId: '001am00002AAB0mAAH', kind: 'surge', topic: 'International Payments and FX', stage: 'Consideration',
  intentScore: 100, researchers: 12, competitor: null, signalDate: '2026-11-04',
};
const names = { '001am00002A9jqjAAB': 'Montgomery Holdings', '001am00002AAB0mAAH': 'Wagner Group Holdings' };
const result = (over: Partial<IntentSignalResult> = {}): IntentSignalResult => ({
  rows: [montgomery, wagner], surging: 0, competitor: 0, scope: 'book', ...over,
});
const opts = { segment: 'Commercial', now: new Date('2026-11-10T17:00:00Z') };

describe('intentQueueItems', () => {
  it('turns competitor research at Purchase into a high-severity defend call', () => {
    const [item] = intentQueueItems(result(), names, opts);
    expect(item).toMatchObject({
      id: 'di0',
      clientId: '001am00002A9jqjAAB',
      clientName: 'Montgomery Holdings',
      segment: 'Commercial',
      reason: 'Researching Live Oak Bank · Purchase · International Payments and FX',
      action: 'Defend the relationship',
      score: 0.8,
      severity: 'high',
      source: 'Demandbase intent',
      dueDate: '2026-11-14',
      reserveSlot: true,
    });
  });

  it('turns a Consideration surge into a medium get-ahead call', () => {
    const item = intentQueueItems(result(), names, opts)[1];
    expect(item).toMatchObject({
      clientName: 'Wagner Group Holdings',
      reason: 'Surging on International Payments and FX · Consideration stage · 12 researchers',
      action: 'Get ahead of the evaluation',
      score: 0.75,
      severity: 'medium',
      dueDate: '2026-11-11',
      reserveSlot: true,
    });
  });

  it('grades severity by stage for each kind', () => {
    const rows: IntentSignalRow[] = [
      { ...montgomery, stage: 'Decision' },
      { ...montgomery, stage: 'Consideration' },
      { ...wagner, stage: 'Purchase' },
    ];
    expect(intentQueueItems(result({ rows }), names, opts).map(i => i.severity)).toEqual(['high', 'medium', 'high']);
  });

  it('says "researcher" for one and scores lower intent lower', () => {
    const [item] = intentQueueItems(result({ rows: [{ ...wagner, researchers: 1, intentScore: 40 }] }), names, opts);
    expect(item.reason).toBe('Surging on International Payments and FX · Consideration stage · 1 researcher');
    expect(item.score).toBeCloseTo(0.6);
  });

  it('never dates an old signal before today, and marks org-wide results', () => {
    const [item] = intentQueueItems(result({ scope: 'org' }), {}, { ...opts, now: new Date('2026-11-20T17:00:00Z') });
    expect(item.dueDate).toBe('2026-11-20');
    expect(item.source).toBe('Demandbase intent · org-wide');
    expect(item.clientName).toBe('001am00002A9jqjAAB');
  });
});
