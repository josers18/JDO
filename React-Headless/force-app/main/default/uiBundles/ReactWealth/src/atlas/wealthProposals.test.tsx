import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { executeGraphQL } from '@shared/data/graphqlClient';
import { fetchAtlasPlanReviews } from '@shared/data/planSignals';
import { fetchWhitespace } from '@shared/data/whitespace';
import { fetchWealthWhoToCall } from '@shared/data/wealthWhoToCall';
import WealthAtlasWorkspace, { type WealthAtlasWorkspaceProps } from './WealthAtlasWorkspace';

vi.mock('@shared/components/atlas/atlasPipelineData', () => ({
  fetchPipeline: vi.fn(async () => ({ stages: [] })),
}));
vi.mock('@shared/data/dataCloudClient', async importOriginal => ({
  ...await importOriginal<typeof import('@shared/data/dataCloudClient')>(),
  queryDataCloudForBook: vi.fn(async () => ({ rows: [] })),
}));
vi.mock('@shared/data/dataFreshness', () => ({ fetchDataFreshness: vi.fn(async () => null) }));
vi.mock('@shared/data/graphqlClient', async importOriginal => ({
  ...await importOriginal<typeof import('@shared/data/graphqlClient')>(),
  executeGraphQL: vi.fn(),
}));
vi.mock('@shared/data/kpiTrend', async importOriginal => ({
  ...await importOriginal<typeof import('@shared/data/kpiTrend')>(),
  fetchNetFlow: vi.fn(async () => null),
}));
vi.mock('@shared/data/planSignals', async importOriginal => ({
  ...await importOriginal<typeof import('@shared/data/planSignals')>(),
  fetchAtlasPlanReviews: vi.fn(async () => []),
  fetchPlanHealth: vi.fn(async () => null),
}));
vi.mock('@shared/data/jobChangeSignals', async importOriginal => ({
  ...await importOriginal<typeof import('@shared/data/jobChangeSignals')>(),
  fetchLiquidityEvents: vi.fn(async () => ({rows:[], scope:'book'})),
}));
vi.mock('@shared/data/tradingPulse', async importOriginal => ({
  ...await importOriginal<typeof import('@shared/data/tradingPulse')>(),
  fetchTradingPulse: vi.fn(async () => null),
}));
vi.mock('@shared/data/wealthWhoToCall', async importOriginal => ({
  ...await importOriginal<typeof import('@shared/data/wealthWhoToCall')>(),
  fetchWealthWhoToCall: vi.fn(),
}));
vi.mock('@shared/data/whitespace', async importOriginal => ({
  ...await importOriginal<typeof import('@shared/data/whitespace')>(),
  fetchWhitespace: vi.fn(),
}));
vi.mock('@shared/components/home/PrepModal', () => ({
  PrepModal: () => { throw new Error('Source evidence must open without AI preparation.'); },
}));
vi.mock('@shared/components/home/TaskModal', () => ({
  TaskModal: ({ clientId }: { clientId: string }) => <div role="dialog" aria-label="Create task">{clientId}</div>,
}));
vi.mock('./wealthAtlasData', async importOriginal => ({
  ...await importOriginal<typeof import('./wealthAtlasData')>(),
  fetchOutside: vi.fn(async () => ({ rows: [] })),
  fetchRecords: vi.fn(async () => ({ rows: [], total: 0 })),
}));

const ownerId = '005am000003PbCLAA0';
const actorScope = '005am000003PbCLAA1';
const accountId = '001am00000qvjsAAAQ';
const otherId = '001am00000qvjsABAA';
const storageKey = `cumulus.atlas.proposals.wealth.${actorScope}.${ownerId}`;
const today: WealthAtlasWorkspaceProps['today'] = {
  owner: { userId: ownerId, name: 'Advisor Example', firstName: 'Advisor', lastName: 'Example', orgName: '' },
  link: (path, title, className) => <a href={path} className={className}>{title}</a>,
};
const empty = { totalCount: 0, edges: [] };

function showWorkspace(page: string, params = '', scope = actorScope, book = ownerId) {
  return render(
    <MemoryRouter initialEntries={[`/${page}?${params}`]}>
      <WealthAtlasWorkspace page={page} ownerId={book} actorScope={scope}
        today={page === 'today' ? today : undefined} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  sessionStorage.clear();
  if (!HTMLDialogElement.prototype.showModal) {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value(this: HTMLDialogElement) { this.open = true; },
    });
  }
  vi.mocked(executeGraphQL).mockImplementation(async query =>
    query.includes('AtlasReviewHouseholds')
      ? { uiapi: { query: { Account: { edges: [
          { node: { Id: accountId, Name: { value: 'Morgan Household' } } },
          { node: { Id: otherId, Name: { value: 'Other Household' } } },
        ] } } } }
      : { uiapi: { query: { Task: empty, Opportunity: empty, Case: empty } } },
  );
  vi.mocked(fetchAtlasPlanReviews).mockResolvedValue([]);
  vi.mocked(fetchWealthWhoToCall).mockResolvedValue({
    clients: 1, multiSignal: 0, scope: 'book',
    rows: [{
      accountId, score: 0.24, heldAway: 500_000, monthlyFlow: null, heldAccounts: 1,
      institution: 'Example Brokerage', planSuccess: null, goalUsd: null, sentiment: null,
      dealRisk: null, ticker: null, concentration: null, drivers: [{ driver: 'held', points: 0.24 }],
    }],
  });
  vi.mocked(fetchWhitespace).mockResolvedValue({
    scope: 'book',
    products: [{ key: 'ira', label: 'Roth IRA' }, { key: 'managed', label: 'Managed Account' }],
    clients: [
      { id: otherId, name: 'Other Household', segment: 'Wealth', cells: {
        ira: { owned: false, code: 'ROTH_IRA', score: 60 },
      } },
      { id: accountId, name: 'Morgan Household', segment: 'Wealth', cells: {
        managed: { owned: false, code: 'MANAGED_ACCOUNT', score: 73, estValue: 1_250, recommendationRank: 1, reason: 'Modeled fit' },
      } },
    ],
  });
});
afterEach(cleanup);

describe('Wealth Atlas proposal workflows', () => {
  it('inspects the first move and saves a local proposal visible only in this actor and book', async () => {
    const home = showWorkspace('today');
    fireEvent.click(await screen.findByRole('button', { name: 'Why this household?' }));
    const evidence = screen.getByRole('dialog', { name: 'Morgan Household · source evidence' });
    expect(within(evidence).getByText('Example Brokerage', { exact: true })).toBeVisible();
    fireEvent.click(within(evidence).getByRole('button', { name: 'Create Salesforce task' }));
    expect(screen.getByRole('dialog', { name: 'Create task' })).toHaveTextContent(accountId);
    home.unmount();

    const reloaded = showWorkspace('today');
    fireEvent.click(await screen.findByRole('button', { name: 'Prepare my first move' }));
    const proposal = screen.getByRole('dialog', { name: 'New Task' });
    expect(within(proposal).getByLabelText('Subject')).toHaveValue('Held-away consolidation review');
    fireEvent.click(within(proposal).getByRole('button', { name: 'Save local proposal' }));
    expect(screen.queryByRole('dialog', { name: 'Create task' })).toBeNull();
    expect(JSON.parse(sessionStorage.getItem(storageKey) ?? '[]')).toMatchObject([{
      accountId, details: { AccountName: 'Morgan Household', EvidenceKind: 'Blended · Plaid held-away' },
    }]);
    reloaded.unmount();

    const work = showWorkspace('work', 'work=drafts');
    expect(screen.getByRole('heading', { name: 'Held-away consolidation review' })).toBeVisible();
    work.unmount();
    const otherActor = showWorkspace('work', 'work=drafts', ownerId);
    expect(screen.queryByRole('heading', { name: 'Held-away consolidation review' })).toBeNull();
    otherActor.unmount();
    showWorkspace('work', 'work=drafts', actorScope, actorScope);
    expect(screen.queryByRole('heading', { name: 'Held-away consolidation review' })).toBeNull();
  });

  it('keeps the selected household and product linked through Growth evidence and follow-up', async () => {
    showWorkspace('growth', `capitalHousehold=${accountId}&capitalProduct=managed`);
    fireEvent.click(await screen.findByRole('button', { name: 'Inspect product evidence' }));
    const evidence = screen.getByRole('dialog', { name: 'Household product evidence' });
    expect(within(evidence).getByText('Morgan Household · Managed Account')).toBeVisible();
    expect(within(evidence).getByText('Offer model action code MANAGED_ACCOUNT')).toBeVisible();
    expect(within(evidence).getByRole('button', { name: 'Prepare opportunity' })).toBeVisible();
    fireEvent.click(within(evidence).getByRole('button', { name: 'Prepare follow-up' }));
    const proposal = screen.getByRole('dialog', { name: 'New Task' });
    expect(within(proposal).getByLabelText('Subject')).toHaveValue('Follow up on Managed Account · Morgan Household');
    fireEvent.click(within(proposal).getByRole('button', { name: 'Save local proposal' }));
    expect(JSON.parse(sessionStorage.getItem(storageKey) ?? '[]')).toMatchObject([{
      accountId, details: { Product: 'Managed Account', ProductCode: 'MANAGED_ACCOUNT', AccountName: 'Morgan Household' },
    }]);
    fireEvent.change(screen.getByLabelText('Household'), { target: { value: otherId } });
    fireEvent.click(screen.getByRole('button', { name: 'Inspect product evidence' }));
    const unranked = screen.getByRole('dialog', { name: 'Household product evidence' });
    expect(within(unranked).getByText('Not ranked')).toBeVisible();
    expect(within(unranked).queryByRole('button', { name: 'Prepare opportunity' })).toBeNull();
  });

  it('reviews the selected provider plan and prepares a linked follow-up', async () => {
    vi.mocked(fetchAtlasPlanReviews).mockResolvedValue([{
      accountId: otherId, successPct: 61.5, goalUsd: 420_000, goals: 2,
      nextReview: '2026-12-12', updated: '2026-11-17', stale: false,
    }]);
    showWorkspace('today');
    fireEvent.click(await screen.findByRole('button', { name: /Other Household/ }));
    const evidence = screen.getByRole('dialog', { name: 'Other Household · source evidence' });
    expect(within(evidence).getByText('61.5%', { exact: true })).toBeVisible();
    expect(within(evidence).getByText(otherId, { exact: true })).toBeVisible();
    fireEvent.click(within(evidence).getByRole('button', { name: 'Prepare follow-up' }));
    const proposal = screen.getByRole('dialog', { name: 'New Task' });
    expect(within(proposal).getByLabelText('Due date')).toHaveValue('2026-12-12');
    fireEvent.click(within(proposal).getByRole('button', { name: 'Save local proposal' }));
    expect(JSON.parse(sessionStorage.getItem(storageKey) ?? '[]')).toMatchObject([{
      accountId: otherId, details: { AccountName: 'Other Household', EvidenceKind: 'MoneyGuidePro', EvidencePeriod: '2026-11-17' },
    }]);
  });
});
