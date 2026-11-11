import { describe, expect, it } from 'vitest';
import { toKpiTrend, wealthUpgradeQueueItems, type WealthUpgradeResult, type WealthUpgradeRow } from '@shared';

// Real Claritas rows (latest month, 2026-11-10): $5M+ clients not yet in Wealth Management.
const row = (accountId: string, over: Partial<WealthUpgradeRow> = {}): WealthUpgradeRow => ({
  accountId, netWorthBand: '$5M+', wealthScore: 100, investScore: 100,
  lifeStage: '', prizm: '', category: 'Small Business', income: 0, ...over,
});
const brewer = row('001am00002AAAkKAAX');
const ellis = row('001am00002AAAdpAAH');
const names = { '001am00002AAAkKAAX': 'Brewer LLC Supply', '001am00002AAAdpAAH': 'Ellis Contractors' };
const result = (over: Partial<WealthUpgradeResult> = {}): WealthUpgradeResult => ({
  rows: [brewer, ellis], candidates: 0, fiveM: 0, highPropensity: 0,
  history: toKpiTrend([]),
  scope: 'book', ...over,
});
const opts = { segment: 'Wealth', now: new Date('2026-11-10T17:00:00Z') };

describe('wealthUpgradeQueueItems', () => {
  it('turns a $5M+ non-Wealth client into an upgrade call due in five days', () => {
    const [item] = wealthUpgradeQueueItems(result(), names, opts);
    expect(item).toMatchObject({
      id: 'wu0',
      clientId: '001am00002AAAkKAAX',
      clientName: 'Brewer LLC Supply',
      segment: 'Wealth',
      reason: 'Est. net worth $5M+ · wealth propensity 100 · still in Small Business',
      action: 'Wealth upgrade conversation',
      score: 0.8,
      severity: 'medium',
      source: 'Claritas propensity',
      relationshipValue: 0,
      dueDate: '2026-11-15',
    });
  });

  it('scores a $1M–$5M client by propensity, as low severity', () => {
    const mid = row('mid', { netWorthBand: '$1M-$5M', wealthScore: 62, category: 'Retail' });
    const [item] = wealthUpgradeQueueItems(result({ rows: [mid] }), {}, opts);
    expect(item.reason).toBe('Est. net worth $1M-$5M · wealth propensity 62 · still in Retail');
    expect(item.score).toBeCloseTo(0.698);
    expect(item.severity).toBe('low');
  });

  it('shows at most three upgrades and marks org-wide results', () => {
    const many = result({ rows: [brewer, ellis, row('c'), row('d'), row('e')], scope: 'org' });
    const items = wealthUpgradeQueueItems(many, names, opts);
    expect(items.map(i => i.id)).toEqual(['wu0', 'wu1', 'wu2']);
    expect(items[2].clientName).toBe('c');
    expect(items[0].source).toBe('Claritas propensity · org-wide');
  });
});
