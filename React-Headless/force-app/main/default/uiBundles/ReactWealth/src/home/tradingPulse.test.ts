import { describe, expect, it } from 'vitest';
import { netSellerQueueItems, type TradingPulseResult, type NetSellerRow } from '@shared';

// The two biggest net sellers in the latest trade week (BT_Financial_Trades, as of 2026-11-09).
const crawford: NetSellerRow = { accountId: '001am00002A9jtFAAR', netSold: 1_169_278.76, trades: 6, instrument: 'U' };
const maddox: NetSellerRow = { accountId: '001am00002A9jZiAAJ', netSold: 1_049_537.8, trades: 5, instrument: 'Mativ Holdings, Inc.' };
const names = { '001am00002A9jtFAAR': 'Crawford PLC Holdings', '001am00002A9jZiAAJ': 'Maddox-Palmer Contractors' };
const pulse = (over: Partial<TradingPulseResult> = {}): TradingPulseResult => ({
  weeks: [], asOf: '2026-11-09', buys: 0, sells: 0, net: 0, sellers: [crawford, maddox], scope: 'book', ...over,
});
const opts = { segment: 'Wealth', now: new Date('2026-11-10T17:00:00Z') };

describe('netSellerQueueItems', () => {
  it('turns each net seller into a reinvest call due in three days', () => {
    const items = netSellerQueueItems(pulse(), names, opts);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      id: 'ts0',
      clientId: '001am00002A9jtFAAR',
      clientName: 'Crawford PLC Holdings',
      segment: 'Wealth',
      reason: 'Net seller $1.2M across 6 trades · incl. U',
      action: 'Reinvest the cash raised',
      severity: 'medium',
      source: 'Trades · as of Nov 9',
      relationshipValue: 1_169_278.76,
      dueDate: '2026-11-13',
    });
    expect(items[1].reason).toBe('Net seller $1M across 5 trades · incl. Mativ Holdings, Inc.');
  });

  it('caps the score at 0.85 for sellers of $700K or more', () => {
    const items = netSellerQueueItems(pulse(), names, opts);
    expect(items.map(i => i.score)).toEqual([0.85, 0.85]);
  });

  it('scores a smaller single-trade seller lower and as low severity', () => {
    const small = { ...crawford, netSold: 300_000, trades: 1, instrument: '' };
    const [item] = netSellerQueueItems(pulse({ sellers: [small] }), names, opts);
    expect(item.reason).toBe('Net seller $300K across 1 trade');
    expect(item.score).toBeCloseTo(0.65);
    expect(item.severity).toBe('low');
  });

  it('marks org-wide results and falls back to the account id', () => {
    const [item] = netSellerQueueItems(pulse({ scope: 'org' }), {}, opts);
    expect(item.source).toBe('Trades · as of Nov 9 · org-wide');
    expect(item.clientName).toBe('001am00002A9jtFAAR');
  });
});
