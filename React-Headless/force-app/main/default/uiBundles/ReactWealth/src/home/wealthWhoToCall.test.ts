import { describe, expect, it, vi } from 'vitest';

// Real W9 rows for Jose Sifontes' book (005am000003PbCLAA0), pulled 2026-11-11 through
// /apexrest/dc/query: the rows query's nine rows (top 8 by score, then the book's most
// concentrated client at rank 20), its summary, and three held-away rows from the same book.
const raw = (over: Record<string, unknown>) => ({
  held: null, flow: null, held_accts: null, inst: null, success: null, goal: null,
  sentiment: null, deal_risk: null, ticker: null, conc: null, ...over,
});
const w9Rows = [
  raw({ account_id: '001am00002AA8OFAA1', score: 0.2723083333333333, success: '59.340000000000000000', goal: '4649744.000000000000000000', sentiment: 'Very Negative', deal_risk: '73.390000000000000000', rk: 1 }),
  raw({ account_id: '001am00002A9fC4AAJ', score: 0.2697083333333333, success: '60.090000000000000000', goal: '3502514.000000000000000000', sentiment: 'Very Negative', deal_risk: '74.850000000000000000', rk: 2 }),
  raw({ account_id: '001am00002A9g0RAAR', score: 0.24458333333333332, success: '58.530000000000000000', goal: '3344494.000000000000000000', sentiment: 'Very Negative', deal_risk: '59.600000000000000000', rk: 3 }),
  raw({ account_id: '001am00002AYALEAA5', score: 0.23308333333333334, success: '42.030000000000000000', goal: '4062701.000000000000000000', rk: 4 }),
  raw({ account_id: '001am00002AA81dAAD', score: 0.23241666666666666, success: '42.110000000000000000', goal: '4647487.000000000000000000', rk: 5 }),
  raw({ account_id: '001am00002AYAMIAA5', score: 0.23183333333333334, success: '42.180000000000000000', goal: '2835126.000000000000000000', rk: 6 }),
  raw({ account_id: '001am00002AYOZGAA5', score: 0.23058333333333333, success: '42.330000000000000000', goal: '4133261.000000000000000000', rk: 7 }),
  raw({ account_id: '001am00002AYOMnAAP', score: 0.22958333333333333, success: '42.450000000000000000', goal: '2898746.000000000000000000', rk: 8 }),
  raw({ account_id: '001am00000qvjsAAAQ', score: 0.2095354761904762, success: '61.020000000000000000', goal: '4822758.000000000000000000', ticker: 'MSFT', conc: '0.314305', rk: 20 }),
];
const chen = raw({ account_id: '001am000026ZtgIAAS', score: 0.07837632900000001, inst: 'Charles Schwab', held_accts: 1, flow: '-157.470000000000000000', held: '783763.290000000000000000' });
const patel = raw({ account_id: '001am000026ZtgKAAS', score: 0.075000148, inst: 'Wealthfront', held_accts: 1, flow: '2384.020000000000000000', held: '34795.480000000000000000' });

// The DC bridge answers each POST in order: the rows query, then the summary.
const replies: unknown[][] = [];
const posted: string[] = [];
vi.mock('@salesforce/platform-sdk', () => ({
  createDataSDK: async () => ({
    fetch: async (_url: string, init: { body: string }) => {
      posted.push(JSON.parse(init.body).sql);
      const rows = replies.shift() ?? [];
      return { ok: true, status: 200, json: async () => ({ columns: [], rows, rowCount: rows.length, warning: null }) };
    },
  }),
}));

const { fetchWealthWhoToCall, wealthWhoToCallItems, callSentimentQueueItems, dropCovered, inheritDue } = await import('@shared');

const JOSE = '005am000003PbCLAA0';
const names = {
  '001am00002AA8OFAA1': 'Graham Household', '001am00002A9fC4AAJ': 'Garcia Household',
  '001am00002A9g0RAAR': 'Gill Household', '001am00002AYALEAA5': 'Robles Household',
  '001am00000qvjsAAAQ': 'Julie E Morris', '001am000026ZtgIAAS': 'David H Chen',
  '001am000026ZtgKAAS': 'Anika A Patel', '001am00002AYONUAA5': 'Ramirez Household',
  '001am00002A9flYAAR': 'Conner Household',
};
const load = async (rows: unknown[], summary: unknown[] = [{ clients: 3023, multi: 6 }]) => {
  replies.length = 0; posted.length = 0;
  replies.push(rows, summary);
  return fetchWealthWhoToCall(JOSE);
};
const opts = { segment: 'Private Wealth' };

describe('fetchWealthWhoToCall (W9)', () => {
  it('scopes to the banker’s book and reads the summary counts', async () => {
    const res = await load(w9Rows);
    expect(res).toMatchObject({ scope: 'book', clients: 3023, multiSignal: 6 });
    expect(posted[0]).toContain(`ssot__OwnerId__c = '${JOSE}'`);
  });

  it('gives the eighth slot to the most concentrated client when the score leaves them out', async () => {
    const { rows } = await load(w9Rows);
    expect(rows).toHaveLength(8);
    expect(rows.map(r => r.accountId)).not.toContain('001am00002AYOMnAAP'); // rank 8 gives way
    expect(rows[7]).toMatchObject({ accountId: '001am00000qvjsAAAQ', ticker: 'MSFT', concentration: 0.314305 });
  });

  it('parses DC decimal strings and orders drivers strongest first', async () => {
    const [graham] = (await load(w9Rows)).rows;
    expect(graham).toMatchObject({ planSuccess: 59.34, goalUsd: 4649744, dealRisk: 73.39, sentiment: 'Very Negative', heldAway: null });
    expect(graham.drivers.map(d => d.driver)).toEqual(['gong', 'plan']);
    expect(graham.drivers[0].points).toBeCloseTo(0.183475);
    expect(graham.drivers[1].points).toBeCloseTo(0.0888333);
  });

  it('skips the outflow driver when money is flowing in', async () => {
    const [c, p] = (await load([chen, patel])).rows;
    expect(c.drivers.map(d => d.driver)).toEqual(['held']);
    expect(c.drivers[0].points).toBeCloseTo(0.0783763);
    expect(p.drivers.map(d => d.driver)).toEqual(['outflow', 'held']);
    expect(p.drivers[0].points).toBeCloseTo(0.0715206);
  });

  it('falls back to the row count when the summary comes back empty', async () => {
    replies.length = 0;
    replies.push([chen]);
    const res = await fetchWealthWhoToCall(JOSE);
    expect(res.clients).toBe(1);
    expect(res.multiSignal).toBe(0);
  });
});

describe('wealthWhoToCallItems (W9)', () => {
  it('leads a souring household with the save call and names both drivers', async () => {
    const [item] = wealthWhoToCallItems(await load(w9Rows), names, opts);
    expect(item).toMatchObject({
      id: 'c0',
      clientId: '001am00002AA8OFAA1',
      clientName: 'Graham Household',
      segment: 'Private Wealth',
      reason: 'Very Negative & declining calls (risk 73) · plan 59% likely to succeed',
      action: 'Relationship save call',
      severity: 'high',
      tier: 'today',
      source: 'Blended · Gong + MoneyGuidePro',
      relationshipValue: 0,
    });
    expect(item.score).toBeCloseTo(0.2723083);
    expect(item.drivers?.map(d => [d.label, d.tone])).toEqual([['Gong', 'risk'], ['Plan', 'risk']]);
  });

  it('makes a plan under 50% a high plan review on its own', async () => {
    const item = wealthWhoToCallItems(await load(w9Rows), names, opts)[3];
    expect(item).toMatchObject({
      clientName: 'Robles Household',
      reason: 'plan 42% likely to succeed',
      action: 'Plan review — goals, savings rate, allocation',
      severity: 'high',
      source: 'Blended · MoneyGuidePro',
    });
  });

  it('turns the reserved concentration slot into a diversification review', async () => {
    const item = wealthWhoToCallItems(await load(w9Rows), names, opts)[7];
    expect(item).toMatchObject({
      id: 'c7',
      clientName: 'Julie E Morris',
      reason: 'MSFT is 31% of holdings · plan 61% likely to succeed',
      action: 'Diversification review — MSFT',
      severity: 'high',
      source: 'Blended · Holdings + MoneyGuidePro',
    });
  });

  it('keeps held-away-only clients on watch and outflow clients this week', async () => {
    const [c, p] = wealthWhoToCallItems(await load([chen, patel]), names, opts);
    expect(c).toMatchObject({
      reason: '$783.8K held away at Charles Schwab',
      action: 'Held-away consolidation review',
      severity: 'low',
      tier: 'watch',
      source: 'Blended · Plaid held-away',
      relationshipValue: 783763.29,
    });
    expect(c.drivers?.[0].tone).toBe('opportunity');
    expect(p).toMatchObject({
      reason: '$2.4K/mo still flowing out · $34.8K held away at Wealthfront',
      action: 'Held-away consolidation review',
      severity: 'medium',
      tier: 'week',
      source: 'Blended · Plaid flows + Plaid held-away',
    });
  });
});

describe('Who-to-Call vs the Gong feed (homeDataReal wiring)', () => {
  // The same book's S1 rows from the same day: the three Very Negative households are
  // already W9 rows; Ramirez and Conner are not.
  const gong = {
    scope: 'book' as const,
    rows: [
      { accountId: '001am00002A9fC4AAJ', sentiment: 'Very Negative' as const, dealRisk: 74.85, nextCall: '2026-12-25', lastNote: '2026-10-26', topics: ['Competitor', 'Pricing'] },
      { accountId: '001am00002AA8OFAA1', sentiment: 'Very Negative' as const, dealRisk: 73.39, nextCall: '2027-01-03', lastNote: '', topics: ['FeatureRequest', 'Pricing'] },
      { accountId: '001am00002A9g0RAAR', sentiment: 'Very Negative' as const, dealRisk: 59.6, nextCall: '', lastNote: '2026-11-02', topics: ['Pricing'] },
      { accountId: '001am00002AYONUAA5', sentiment: 'Negative' as const, dealRisk: 56.44, nextCall: '', lastNote: '2026-11-08', topics: ['Competitor', 'FeatureRequest', 'Renewal'] },
      { accountId: '001am00002A9flYAAR', sentiment: 'Negative' as const, dealRisk: 55.14, nextCall: '2026-11-20', lastNote: '2026-09-10', topics: ['FeatureRequest', 'Pricing'] },
    ],
  };
  const now = new Date('2026-11-11T18:00:00Z');

  it('drops Gong clients the blended list already covers', async () => {
    const callList = wealthWhoToCallItems(await load(w9Rows), names, opts);
    const gongSignals = callSentimentQueueItems(gong, names, { segment: 'Wealth', now });
    expect(dropCovered(gongSignals, callList).map(g => g.clientName)).toEqual(['Ramirez Household', 'Conner Household']);
  });

  it('takes a covered Gong due date only when it beats the staggered SLA', async () => {
    const callList = wealthWhoToCallItems(await load(w9Rows), names, opts);
    const gongSignals = callSentimentQueueItems(gong, names, { segment: 'Wealth', now });
    const [graham, garcia, gill] = inheritDue(callList, [gongSignals], now);
    // High rows are due today (even slots) or tomorrow (odd slots); Gong's save call is due today,
    // so only the odd slot moves up. Graham's own SLA is already today.
    expect(graham.dueDate).toBeUndefined();
    expect(garcia.dueDate).toBe('2026-11-11');
    expect(gill.dueDate).toBeUndefined();
  });
});
