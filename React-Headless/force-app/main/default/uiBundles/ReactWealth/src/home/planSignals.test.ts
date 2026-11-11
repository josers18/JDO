import { describe, expect, it } from 'vitest';
import { toKpiTrend, planRiskQueueItems, planReviewQueueItems, type PlanHealthResult, type PlanRow } from '@shared';

// Real MoneyGuidePro rows from BT_MoneyGuidePro_Financial_Plans__dlm, latest month, 2026-11-10.
const nigel: PlanRow = { accountId: '001al00000EkcjwAAB', successPct: 46.57, goalUsd: 7_930_705, goals: 5, nextReview: '', updated: '2024-05-15', stale: true };
const larsen: PlanRow = { accountId: '001am00002AYRjSAAX', successPct: 67.86, goalUsd: 50_000_000, goals: 5, nextReview: '2027-08-23', updated: '2025-12-05', stale: false };
const soto: PlanRow = { accountId: '001am00002AYRieAAH', successPct: 74.46, goalUsd: 50_000_000, goals: 4, nextReview: '2026-12-04', updated: '2026-07-04', stale: false };
const names = { '001al00000EkcjwAAB': 'Nigel Morris', '001am00002AYRjSAAX': 'Larsen Group', '001am00002AYRieAAH': 'Soto Holdings' };
const health = (over: Partial<PlanHealthResult> = {}): PlanHealthResult => ({
  atRiskRows: [nigel, larsen], reviewRows: [soto],
  plans: 0, atRisk: 0, critical: 0, atRiskGoalUsd: 0, due30: 0, stale: 0,
  history: toKpiTrend([]),
  scope: 'book', ...over,
});
const opts = { segment: 'Wealth', now: new Date('2026-11-10T17:00:00Z') };

describe('planRiskQueueItems', () => {
  it('makes a plan below 50% a high-severity rework due today', () => {
    const [item] = planRiskQueueItems(health(), names, opts);
    expect(item).toMatchObject({
      id: 'pr0',
      clientName: 'Nigel Morris',
      reason: 'Plan success 47% · $7.9M across 5 goals · plan stale',
      action: 'Rework the plan — success below 50%',
      severity: 'high',
      source: 'MoneyGuidePro plan',
      relationshipValue: 7_930_705,
      dueDate: '2026-11-10',
    });
    expect(item.score).toBeCloseTo(0.9405, 3);
  });

  it('makes a plan from 50% to 70% a medium check-in due in five days', () => {
    const item = planRiskQueueItems(health(), names, opts)[1];
    expect(item).toMatchObject({
      reason: 'Plan success 68% · $50M across 5 goals',
      action: 'Plan check-in — success below 70%',
      severity: 'medium',
      dueDate: '2026-11-15',
    });
    expect(item.score).toBeCloseTo(0.5857, 3);
  });

  it('caps the score at 0.95 and says "goal" for one goal', () => {
    const [item] = planRiskQueueItems(health({ atRiskRows: [{ ...nigel, successPct: 5, goals: 1, stale: false }] }), names, opts);
    expect(item.score).toBe(0.95);
    expect(item.reason).toBe('Plan success 5% · $7.9M across 1 goal');
  });

  it('marks org-wide results', () => {
    expect(planRiskQueueItems(health({ scope: 'org' }), names, opts)[0].source).toBe('MoneyGuidePro plan · org-wide');
  });
});

describe('planReviewQueueItems', () => {
  it('dates the queue item on the review itself', () => {
    const [item] = planReviewQueueItems(health(), names, { segment: 'Wealth' });
    expect(item).toMatchObject({
      id: 'rv0',
      clientName: 'Soto Holdings',
      reason: 'Plan review due Dec 4 · success 74% · $50M in goals',
      action: 'Prep the plan review',
      score: 0.55,
      severity: 'low',
      source: 'MoneyGuidePro review',
      dueDate: '2026-12-04',
    });
  });

  it('notes a stale plan and raises the priority when success is below 70%', () => {
    const row = { ...soto, successPct: 67.86, stale: true };
    const [item] = planReviewQueueItems(health({ reviewRows: [row] }), names, { segment: 'Wealth' });
    expect(item.reason).toBe('Plan review due Dec 4 · success 68% · $50M in goals · plan last updated Jul 4');
    expect(item.score).toBe(0.7);
    expect(item.severity).toBe('medium');
  });
});
