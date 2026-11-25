import { beforeEach, expect, it, vi } from 'vitest';

const { queryDataCloudForBook } = vi.hoisted(() => ({ queryDataCloudForBook: vi.fn() }));
vi.mock('@shared/data/dataCloudClient', () => ({ queryDataCloudForBook }));
import { fetchCommercialCompanyWhoToCall } from '@shared/data/commercialWhoToCall';

const owner = '005am000003PbFDAA0';
const account = '001am00002AAAvtAAH';
const book = `IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '${owner}')`;
beforeEach(() => queryDataCloudForBook.mockReset());

it('applies one exact, strict book predicate to each of the five driver sources', async () => {
  queryDataCloudForBook.mockResolvedValue({ rows: [{ account_id: account, paydex: '68', deal_risk: '87.3', outlook: 'Negative', score: '0.27825' }] });
  const row = await fetchCommercialCompanyWhoToCall(owner, account);
  expect(queryDataCloudForBook).toHaveBeenCalledOnce();
  expect(queryDataCloudForBook).toHaveBeenCalledWith(expect.any(Function), owner, 1, true);
  const [sql] = queryDataCloudForBook.mock.calls[0];
  expect(sql(book).split(`ssot__Id__c ${book} AND ssot__Id__c = '${account}'`)).toHaveLength(6);
  expect(row).toMatchObject({ accountId: account, paydex: 68, score: 0.27825, outlook: 'Negative' });
  expect(row?.drivers.map(driver => driver.driver)).toEqual(['gong', 'outlook']);
});

it('discards a mismatched source Account and rejects an invalid exact ID', async () => {
  queryDataCloudForBook.mockResolvedValue({ rows: [{ account_id: '001am00002AAAxuAAH', score: 1 }] });
  await expect(fetchCommercialCompanyWhoToCall(owner, account)).resolves.toBeNull();
  await expect(fetchCommercialCompanyWhoToCall(owner, '005invalid')).rejects.toThrow('verified company Account ID');
  expect(queryDataCloudForBook).toHaveBeenCalledOnce();
});
