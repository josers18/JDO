import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAtlasBook } from '@shared/components/atlas/AtlasToday';
import { executeGraphQL } from '@shared/data/graphqlClient';

vi.mock('@shared/data/graphqlClient', () => ({ executeGraphQL: vi.fn() }));

const owner = '005am000003PbCLAA0';
const empty = { totalCount: 0, edges: [] };

describe('Atlas Today book scope', () => {
  beforeEach(() => vi.resetAllMocks());

  it('keeps an empty book empty and scopes every connection', async () => {
    const book = { Task: empty, Opportunity: empty, Case: empty };
    vi.mocked(executeGraphQL).mockResolvedValue({ uiapi: { query: book } });

    await expect(fetchAtlasBook(owner)).resolves.toEqual(book);

    const filter = `OwnerId: { eq: "${owner}" }`;
    const query = vi.mocked(executeGraphQL).mock.calls[0][0];
    expect(query).toContain(`Task(first: 8, where: { ${filter},`);
    expect(query).toContain(`Opportunity(first: 8, where: { ${filter},`);
    expect(query).toContain(`Case(first: 8, where: { Account: { ${filter} },`);
    expect(executeGraphQL).toHaveBeenCalledTimes(1);
  });

  it('stops an unresolved owner before querying Salesforce', async () => {
    await expect(fetchAtlasBook('')).rejects.toThrow('banker could not be verified');
    expect(executeGraphQL).not.toHaveBeenCalled();
  });

  it('reports an inaccessible connection as unavailable', async () => {
    vi.mocked(executeGraphQL).mockResolvedValue({ uiapi: { query: { Task: empty } } });
    await expect(fetchAtlasBook(owner)).rejects.toThrow('book is unavailable');
  });
});
