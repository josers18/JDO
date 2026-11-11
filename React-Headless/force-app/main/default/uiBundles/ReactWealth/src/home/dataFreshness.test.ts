import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Real S8 rows from DcBridgeRest, pulled 2026-11-11 with ReactWealth's source list.
// Timestamp sources come back in UTC in three shapes; the rest are dates. Trades is
// a date stored at midnight UTC.
const LIVE: Array<[string, string]> = [
  ['transactions', '2026-11-11 06:59:59+00'],
  ['marketing', '2026-11-11 14:57:48.693364+00'],
  ['serviceNow', '2026-10-24 15:38:00+00'],
  ['worldCheck', '2026-11-11'],
  ['gong', '2026-11-09'],
  ['graph', '2026-11-09'],
  ['offers', '2026-11-01'],
  ['plaid', '2026-11-01'],
  ['moneyGuidePro', '2026-11-01'],
  ['trades', '2026-11-11 00:00:00.000 Z'],
  ['claritas', '2026-11-01'],
];

// Like the bridge, an unaliased CAST(...) column comes back as `_col1`.
const sent: string[] = [];
vi.mock('@salesforce/platform-sdk', () => ({
  createDataSDK: async () => ({
    fetch: async (_url: string, init: { body: string }) => {
      const { sql } = JSON.parse(init.body) as { sql: string };
      sent.push(sql);
      const col = /\bAS as_of\b/.test(sql) ? 'as_of' : '_col1';
      const rows = LIVE.map(([src, v]) => ({ src, [col]: v }));
      return { ok: true, status: 200, json: async () => ({ columns: [], rows, rowCount: rows.length, warning: null }) };
    },
  }),
}));

const { fetchDataFreshness, localDay } = await import('@shared');

const originalTz = process.env.TZ;
beforeEach(() => { process.env.TZ = 'America/Los_Angeles'; sent.length = 0; });
afterEach(() => { process.env.TZ = originalTz; });

// homeDataReal's S8 source list for Wealth; 10am Nov 11 in Los Angeles.
const KEYS = ['transactions', 'worldCheck', 'marketing', 'serviceNow', 'gong', 'graph', 'offers', 'plaid', 'moneyGuidePro', 'trades', 'claritas'] as const;
const NOW = new Date('2026-11-11T18:00:00Z');
const load = () => fetchDataFreshness([...KEYS], NOW);
const byLabel = (res: Awaited<ReturnType<typeof load>>) => Object.fromEntries(res.sources.map(s => [s.label, s]));

describe('fetchDataFreshness (S8)', () => {
  it('names the date column so every Data Cloud source reaches the meter', async () => {
    const res = await load();
    expect(sent[0]).toContain('CAST(MAX(ssot__TransactionDate__c) AS VARCHAR) AS as_of FROM ssot__FinancialAccountTransaction__dlm');
    // CRM plus all 11 sources, not CRM alone.
    expect(res.sources).toHaveLength(12);
  });

  it('dates UTC timestamps on the banker’s day and keeps dates where they are', async () => {
    const s = byLabel(await load());
    // 06:59 UTC on Nov 11 is 10:59pm on Nov 10 in Los Angeles.
    expect(s['Transactions']).toMatchObject({ asOf: '2026-11-10', ageDays: 1, current: true });
    expect(s['Marketing engagement']).toMatchObject({ asOf: '2026-11-11', ageDays: 0, current: true });
    expect(s['ServiceNow cases']).toMatchObject({ asOf: '2026-10-24', ageDays: 18, current: false });
    // Midnight UTC is a date, not 4pm on Nov 10.
    expect(s['Trades']).toMatchObject({ asOf: '2026-11-11', ageDays: 0, current: true });
    expect(s['Gong call sentiment']).toMatchObject({ asOf: '2026-11-09', ageDays: 2, current: true });
    expect(s['MoneyGuidePro plans']).toMatchObject({ asOf: '2026-11-01', ageDays: 10, current: true });
  });

  it('reports 11 of 12 sources current; only ServiceNow is past its daily allowance', async () => {
    const res = await load();
    expect(res.sources.filter(x => !x.current).map(x => x.label)).toEqual(['ServiceNow cases']);
    expect(res.pct).toBe(92);
  });

  it('keeps the UTC day east of UTC, and trades stays on its date', async () => {
    process.env.TZ = 'Asia/Tokyo';
    const s = byLabel(await load());
    // 06:59 UTC is 3:59pm in Tokyo; 14:57 UTC is 11:57pm, still Nov 11.
    expect(s['Transactions'].asOf).toBe('2026-11-11');
    expect(s['Marketing engagement'].asOf).toBe('2026-11-11');
    expect(s['ServiceNow cases'].asOf).toBe('2026-10-25');
    expect(s['Trades'].asOf).toBe('2026-11-11');
  });
});

describe('localDay (timestamp shapes from CAST AS VARCHAR)', () => {
  it('parses +00 offsets, microseconds and a spaced Z', () => {
    expect(localDay('2026-11-11 06:59:59+00')).toBe('2026-11-10');
    expect(localDay('2026-11-11 14:57:48.693364+00')).toBe('2026-11-11');
    expect(localDay('2026-11-11 00:00:00.000 Z')).toBe('2026-11-11');
    expect(localDay('2026-11-07 06:27:05.000 UTC')).toBe('2026-11-06');
  });
});
