import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { GlobalSearch } from '@shared/components/GlobalSearch';
import { executeGraphQL } from '@shared/data/graphqlClient';
import { readVisibleAccount } from '@shared/data/visibleAccount';

vi.mock('@shared/data/graphqlClient', () => ({ executeGraphQL: vi.fn() }));

const id = '001000000000001AAA';
afterEach(() => vi.clearAllMocks());

it('opens a visible person account owned by another banker inside the app', async () => {
  vi.mocked(executeGraphQL).mockResolvedValue({ uiapi: { query: { Account: { edges: [{ node: {
    Id: id, Name: { value: 'Julie Morris' }, OwnerId: { value: '005000000000002AAA' }, IsPersonAccount: { value: true },
  } }] } } } });
  const navigate = vi.fn();
  render(<GlobalSearch appearance="atlas" onSelectAccount={navigate} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Julie Morris' } });
  fireEvent.click(await screen.findByRole('option', { name: /Julie Morris.*Open profile/ }));
  expect(navigate).toHaveBeenCalledWith(id);
});

it('resolves the exact profile using Salesforce visibility for short and canonical IDs', async () => {
  const node = { Id: id, OwnerId: { value: '005000000000002AAA' } };
  vi.mocked(executeGraphQL).mockResolvedValue({ uiapi: { query: { Account: { edges: [{ node }] } } } });
  for (const requested of [id, id.slice(0, 15)]) {
    await expect(readVisibleAccount(requested)).resolves.toEqual(node);
    expect(vi.mocked(executeGraphQL).mock.lastCall?.[0]).toContain(`where: { Id: { eq: "${requested}" } }`);
  }
});

it('rejects invalid, invisible, and mismatched accounts', async () => {
  await expect(readVisibleAccount('')).resolves.toBeNull();
  expect(executeGraphQL).not.toHaveBeenCalled();
  for (const edges of [[], [{ node: { Id: '001000000000002AAA' } }]]) {
    vi.mocked(executeGraphQL).mockResolvedValue({ uiapi: { query: { Account: { edges } } } });
    await expect(readVisibleAccount(id)).resolves.toBeNull();
  }
});
