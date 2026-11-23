import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@shared/data/dataCloudClient', () => ({ queryDataCloud: vi.fn() }));
vi.mock('@shared/data/graphqlClient', () => ({ executeGraphQL: vi.fn() }));

import { queryDataCloud } from '@shared/data/dataCloudClient';
import { executeGraphQL } from '@shared/data/graphqlClient';
import { fetchComplianceEvents } from '@shared/data/complianceEvents';

const dc = vi.mocked(queryDataCloud);
const gql = vi.mocked(executeGraphQL);
const ACCT = '001am00002A9jm4AAB';
const rows = (r: Record<string, unknown>[]) => ({ columns: [], rows: r, rowCount: r.length, warning: null });

/** Route each Data Cloud query by the table it reads. */
const route = (by: { graph?: Record<string, unknown>[]; aml?: Record<string, unknown>[]; firm?: Record<string, unknown>[] }) =>
  dc.mockImplementation(async (sql: string) => {
    if (sql.includes('BT_Synth_Relationship_Graph__dlm')) return rows(by.graph ?? []) as never;
    if (sql.includes('BT_WorldCheck_AML__dlm')) return rows(by.aml ?? []) as never;
    return rows(by.firm ?? []) as never;
  });
const docs = (nodes: { id: string; type?: string; exp?: string }[]) =>
  gql.mockResolvedValue({ uiapi: { query: { FinServ__IdentificationDocument__c: { edges: nodes.map(n => ({ node: {
    Id: n.id, FinServ__DocumentType__c: { value: n.type ?? 'Passport' }, FinServ__ExpirationDate__c: { value: n.exp ?? null },
  } })) } } } } as never);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 23, 12));
  dc.mockReset(); gql.mockReset();
  route({}); docs([]);
});
afterEach(() => vi.useRealTimers());

describe('fetchComplianceEvents', () => {
  it('ownershipEdge', async () => {
    route({ graph: [{ edge_discovered_date__c: '2026-11-10T00:00:00.000Z', dst_account_id__c: '001am00002A9iD0AAJ' }] });
    const ev = await fetchComplianceEvents(ACCT);
    expect(ev).toEqual([{ kind: 'ownership', detected: '2026-11-10', detail: expect.stringContaining('ownership') }]);
    const sql = dc.mock.calls.map(c => c[0]).find(s => s.includes('BT_Synth_Relationship_Graph__dlm'))!;
    expect(sql).toContain("edge_type__c = 'BUSINESS_OWNER'");
    expect(sql).toContain(`src_account_id__c = '${ACCT}'`);
  });

  it('screeningChange', async () => {
    route({ aml: [{ profile_date__c: '2026-11-20T00:00:00.000Z', change_since_last_run__c: 'Changed', overall_risk_rating__c: 'High', pep_hit__c: true, sanctions_hit__c: false, adverse_media_hit__c: false }] });
    const ev = await fetchComplianceEvents(ACCT);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ kind: 'screening', detected: '2026-11-20' });
    expect(ev[0].detail).toMatch(/High/);
    expect(ev[0].detail).toMatch(/PEP/);
  });

  it('addressChange', async () => {
    route({ firm: [
      { profile_month__c: '2026-11-01T00:00:00.000Z', hq_postal_code__c: '45303' },
      { profile_month__c: '2026-10-01T00:00:00.000Z', hq_postal_code__c: '45040' },
    ] });
    const ev = await fetchComplianceEvents(ACCT);
    expect(ev).toEqual([{ kind: 'address', detected: '2026-11-01', detail: expect.stringContaining('45303') }]);
    expect(ev[0].detail).toContain('45040');
  });

  it('noAddressEventWhenPostalUnchanged', async () => {
    route({ firm: [
      { profile_month__c: '2026-11-01T00:00:00.000Z', hq_postal_code__c: '45303' },
      { profile_month__c: '2026-10-01T00:00:00.000Z', hq_postal_code__c: '45303' },
    ] });
    expect(await fetchComplianceEvents(ACCT)).toEqual([]);
  });

  it('expiringDocument', async () => {
    docs([
      { id: 'a', type: 'Passport', exp: '2026-12-15' },
      { id: 'b', type: 'Driver License', exp: '2026-10-01' },
      { id: 'c', exp: '2027-06-01' },
      { id: 'd', exp: null as unknown as string },
    ]);
    const ev = await fetchComplianceEvents(ACCT);
    expect(ev.map(e => e.kind)).toEqual(['document', 'document']);
    expect(ev.find(e => e.detail.includes('Driver License'))!.detail).toMatch(/expired/i);
    expect(ev.find(e => e.detail.includes('Passport'))!.detail).toMatch(/expires/i);
  });

  it('emptyWhenNothing', async () => {
    expect(await fetchComplianceEvents(ACCT)).toEqual([]);
  });

  it('newestFirst', async () => {
    route({
      graph: [{ edge_discovered_date__c: '2026-11-10T00:00:00.000Z' }],
      aml: [{ profile_date__c: '2026-11-20T00:00:00.000Z', change_since_last_run__c: 'New', overall_risk_rating__c: 'Low' }],
    });
    const ev = await fetchComplianceEvents(ACCT);
    expect(ev.map(e => e.kind)).toEqual(['screening', 'ownership']);
  });

  it('oneSourceFailingDoesNotHideOthers', async () => {
    dc.mockImplementation(async (sql: string) => {
      if (sql.includes('BT_WorldCheck_AML__dlm')) throw new Error('boom');
      if (sql.includes('BT_Synth_Relationship_Graph__dlm')) return rows([{ edge_discovered_date__c: '2026-11-10' }]) as never;
      return rows([]) as never;
    });
    gql.mockRejectedValue(new Error('gql down'));
    const ev = await fetchComplianceEvents(ACCT);
    expect(ev.map(e => e.kind)).toEqual(['ownership']);
  });

  it('noVendorNamesInDetail', async () => {
    route({
      graph: [{ edge_discovered_date__c: '2026-11-10' }],
      aml: [{ profile_date__c: '2026-11-20', change_since_last_run__c: 'Changed', overall_risk_rating__c: 'High', pep_hit__c: true }],
      firm: [{ profile_month__c: '2026-11-01', hq_postal_code__c: '1' }, { profile_month__c: '2026-10-01', hq_postal_code__c: '2' }],
    });
    for (const e of await fetchComplianceEvents(ACCT)) expect(e.detail).not.toMatch(/world-?check|zoominfo|d&b|dun/i);
  });

  it('rejectsMalformedAccountId', async () => {
    expect(await fetchComplianceEvents("x' OR '1'='1")).toEqual([]);
    expect(dc).not.toHaveBeenCalled();
  });
});
