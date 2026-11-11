import { afterEach, describe, expect, it } from 'vitest';
import { buildPriorityQueue, commercialWhoToCallItems, type CommercialWhoToCallResult, type CommercialWhoToCallRow } from '@shared';

// Real C10 blended rows for Allen Carter's book, pulled 2026-11-11. Driver points are
// what fetchCommercialWhoToCall derives from each row (weights credit .3, Gong .25,
// Moody's .1, fees .2, offer .15), strongest first; they sum to the DC score.
const cameronOlson: CommercialWhoToCallRow = {
  accountId: '001am00002AAAvtAAH', score: 0.56508, creditIdx: 45.3, tier: 'High', paydex: 68, daysBeyond: 18,
  sentiment: 'Very Negative', dealRisk: 87.3, outlook: 'Negative', rating: 'Ba2', fees: null,
  offerCode: 'BIZ-CHK', conversionPct: 32.36,
  drivers: [
    { driver: 'gong', points: 0.21825 },
    { driver: 'credit', points: 0.18975 },
    { driver: 'offer', points: 0.09708 },
    { driver: 'outlook', points: 0.06 },
  ],
};
const burgess: CommercialWhoToCallRow = {
  accountId: '001am00002AAArWAAX', score: 0.50275, creditIdx: 69.7, tier: 'High', paydex: 26, daysBeyond: 100,
  sentiment: null, dealRisk: null, outlook: 'Watch', rating: 'Baa3', fees: null,
  offerCode: 'BIZ-CARD', conversionPct: 34.25,
  drivers: [
    { driver: 'credit', points: 0.3 },
    { driver: 'offer', points: 0.10275 },
    { driver: 'outlook', points: 0.1 },
  ],
};
const schroeder: CommercialWhoToCallRow = {
  accountId: '001am00002AAAxuAAH', score: 0.28467, creditIdx: null, tier: null, paydex: null, daysBeyond: null,
  sentiment: 'Negative', dealRisk: 63.06, outlook: null, rating: null, fees: null,
  offerCode: 'BIZ-CHK', conversionPct: 42.34,
  drivers: [{ driver: 'gong', points: 0.15765 }, { driver: 'offer', points: 0.12702 }],
};
const kennedy: CommercialWhoToCallRow = {
  accountId: '001am00002AAB5BAAX', score: 0.14388, creditIdx: null, tier: null, paydex: null, daysBeyond: null,
  sentiment: null, dealRisk: null, outlook: null, rating: null, fees: null,
  offerCode: 'BIZ-CHK', conversionPct: 47.96,
  drivers: [{ driver: 'offer', points: 0.14388 }],
};

const names = {
  '001am00002AAAvtAAH': 'Cameron-Olson Construction',
  '001am00002AAArWAAX': 'Burgess Supply',
  '001am00002AAAxuAAH': 'Schroeder Contractors',
  '001am00002AAB5BAAX': 'Kennedy Ltd Enterprises',
};
const res = (rows: CommercialWhoToCallRow[], scope: 'book' | 'org' = 'book'): CommercialWhoToCallResult => ({
  rows, clients: rows.length, multiSignal: 0, scope,
});

describe('commercialWhoToCallItems (C10)', () => {
  it('leads with the strongest driver and names every driver in the reason and source', () => {
    const [item] = commercialWhoToCallItems(res([cameronOlson]), names);
    expect(item).toMatchObject({
      id: 'c0',
      clientName: 'Cameron-Olson Construction',
      segment: "Moody's Ba2",
      reason: "Very Negative & declining calls (risk 87) · PAYDEX 68 (High failure risk), 18 days beyond terms · 32% likely: business checking · Moody's Negative (Ba2)",
      action: 'Relationship save call',
      score: 0.56508,
      severity: 'high',
      tier: 'today',
      source: "Blended · Gong + D&B credit + Offer model + Moody's",
    });
    expect(item.drivers).toEqual([
      { label: 'Gong', points: 0.21825, tone: 'risk' },
      { label: 'Credit', points: 0.18975, tone: 'risk' },
      { label: 'Offer', points: 0.09708, tone: 'opportunity' },
      { label: 'Outlook', points: 0.06, tone: 'risk' },
    ]);
  });

  it('sends a credit-led row to a covenant review', () => {
    const [item] = commercialWhoToCallItems(res([burgess]), names);
    expect(item).toMatchObject({
      segment: "Moody's Baa3",
      reason: "PAYDEX 26 (High failure risk), 100 days beyond terms · 34% likely: commercial card · Moody's Watch (Baa3)",
      action: 'Credit / covenant review',
      severity: 'high',
    });
  });

  it('keeps one Negative (not Very Negative) risk driver at medium, this week', () => {
    const [item] = commercialWhoToCallItems(res([schroeder]), names);
    expect(item).toMatchObject({
      segment: 'Commercial',
      reason: 'Negative & declining calls (risk 63) · 42% likely: business checking',
      action: 'Relationship save call',
      severity: 'medium',
      tier: 'week',
    });
  });

  it('treats an offer-only row as a low-severity watch with the offer as the action', () => {
    const [item] = commercialWhoToCallItems(res([kennedy], 'org'), names);
    expect(item).toMatchObject({
      reason: '48% likely: business checking',
      action: 'Next-best offer — business checking',
      severity: 'low',
      tier: 'watch',
      source: 'Blended · Offer model · org-wide',
    });
  });
});

describe('Who-to-Call due dates in the priority queue', () => {
  const original = process.env.TZ;
  afterEach(() => { process.env.TZ = original; });

  it('dates the SLA on the banker’s calendar day east of UTC', () => {
    process.env.TZ = 'Asia/Tokyo';
    // Noon Nov 11 in Tokyo. Local midnight is still Nov 10 in UTC, which is the
    // date toISOString() used to give a high item due today.
    const now = new Date('2026-11-11T03:00:00Z');
    const primary = commercialWhoToCallItems(res([cameronOlson, schroeder]), names);
    const queue = buildPriorityQueue({ primary, now });
    const due = Object.fromEntries(queue.map(q => [q.clientName, q.dueDate]));
    expect(due['Cameron-Olson Construction']).toBe('2026-11-11'); // high: SLA 0
    expect(due['Schroeder Contractors']).toBe('2026-11-14'); // medium, second item: SLA 2 + 1
  });
});
