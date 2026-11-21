import { beforeEach, describe, expect, it, vi } from 'vitest';
import { executeGraphQL } from '@shared/data/graphqlClient';
import { verifyHousehold } from './wealthHouseholdData';

vi.mock('@shared/data/graphqlClient', () => ({ executeGraphQL: vi.fn() }));

const owner = '005000000000001AAA';
const account = '001000000000001AAA';
const crm = vi.mocked(executeGraphQL);
const directory = (ids: string[]) => ({
  uiapi: { query: { Account: { edges: ids.map(Id => ({ node: { Id } })) } } },
});

beforeEach(() => crm.mockReset());

describe('Atlas household access', () => {
  it('requires both the book owner and exact household in the CRM query', async () => {
    crm.mockResolvedValue(directory([account]));
    await expect(verifyHousehold(owner, account)).resolves.toEqual({ Id: account });
    expect(crm.mock.calls[0][0]).toContain(`OwnerId: { eq: "${owner}" }, Id: { eq: "${account}" }`);
  });

  it('accepts a short record ID when CRM returns the corresponding canonical ID', async () => {
    crm.mockResolvedValue(directory([account]));
    await expect(verifyHousehold(owner, account.slice(0, 15))).resolves.toEqual({ Id: account });
  });

  it('does not grant access for an invalid, missing, or mismatched household', async () => {
    await expect(verifyHousehold(owner, 'unverified')).resolves.toBeNull();
    expect(crm).not.toHaveBeenCalled();

    crm.mockResolvedValueOnce(directory([]));
    await expect(verifyHousehold(owner, account)).resolves.toBeNull();

    crm.mockResolvedValueOnce(directory(['001000000000002AAA']));
    await expect(verifyHousehold(owner, account)).resolves.toBeNull();
  });
});
