import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ query: vi.fn(), crm: vi.fn() }));
vi.mock('@shared', () => ({ queryDataCloudForBook: mocks.query, executeGraphQL: mocks.crm }));

import { readCreditCohort } from './creditCohorts';

const owner = '005am000003PbFDAA0';
const predicate = `IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '${owner}')`;
const account = (i: number) => `001am000000${String(i).padStart(4, '0')}`;

beforeEach(() => {
  mocks.query.mockReset();
  mocks.crm.mockReset();
  mocks.crm.mockResolvedValue({ uiapi: { query: { Account: { edges: [] } } } });
});
describe('Commercial credit cohort readers', () => {
  it.each([
    [{ kind: 'supplier', band: '30+ days beyond terms' } as const, 'BT_DNB_Business_Credit__dlm', 'account_id__c'],
    [{ kind: 'revenue', band: '<$1M' } as const, 'BT_Zoominfo_Firmographics__dlm', 'account_id__c'],
    [{ kind: 'market', zip: '02446' } as const, 'BT_ESRI_GEO_Footprint__dlm', 'a.ssot__Id__c'],
  ])('reads %s without falling back outside the book', async (cohort, source, column) => {
    mocks.query.mockResolvedValue({ rows: [] });
    await readCreditCohort(owner, cohort, account(1));
    expect(mocks.query).toHaveBeenCalledWith(expect.any(Function), owner, 31, true);
    const [sql] = mocks.query.mock.calls[0];
    expect(sql(predicate)).toContain(source);
    expect(sql(predicate)).toContain(`${column} ${predicate}`);
    expect(sql(predicate)).toContain(`${column} > '${account(1)}'`);
    expect(mocks.crm).not.toHaveBeenCalled();
  });

  it('selects the original Credit Watch population even when payment days are unknown', async () => {
    mocks.query.mockResolvedValue({ rows: [] });
    await readCreditCohort(owner, { kind: 'supplier', band: '', watch: true });
    const [build] = mocks.query.mock.calls[0];
    expect(build(predicate)).toContain("AND (supplier_risk_level__c = 'Severe' OR paydex_score__c < 60)");
    expect(build(predicate)).not.toContain('average_days_beyond_terms__c IS NOT NULL');
  });

  it('verifies exact CRM membership and advances past a filtered source page', async () => {
    mocks.query.mockResolvedValue({ rows: Array.from({ length: 31 }, (_, i) => ({
      account_id: account(i), employee_band: '11-50', period: '2026-11-01',
    })) });
    mocks.crm.mockResolvedValue({ uiapi: { query: { Account: { edges: [
      { node: { Id: account(2), Name: { value: 'Verified company' } } },
    ] } } } });
    const page = await readCreditCohort(owner, { kind: 'revenue', band: '$1M-$10M' });
    expect(mocks.crm).toHaveBeenCalledWith(expect.stringContaining(`OwnerId: { eq: "${owner}" }, IsPersonAccount: { eq: false }`));
    expect(page.rows.map(r => r.id)).toEqual([account(2)]);
    expect(page.rows[0].employee_band).toBe('11-50');
    expect(page.next).toBe(account(29));
  });
});
