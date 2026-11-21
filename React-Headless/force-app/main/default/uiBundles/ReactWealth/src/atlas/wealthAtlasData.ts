import { executeGraphQL } from '@shared/data/graphqlClient';
import { bookAccountFilter, queryDataCloud } from '@shared/data/dataCloudClient';

type Scalar = string | number | boolean | null;
type Field = { value?: Scalar };
export type RecordNode = { Id: string; [key: string]: unknown };
type Connection = {
  edges?: { node: RecordNode }[];
  totalCount?: number;
  pageInfo?: { hasNextPage: boolean; endCursor: string };
};

export function field(node: RecordNode | undefined, key: string): Scalar {
  const value = node?.[key];
  return typeof value === 'object' && value !== null && 'value' in value
    ? ((value as Field).value ?? null)
    : null;
}

export function stringField(node: RecordNode | undefined, key: string): string {
  return String(field(node, key) ?? '');
}

export function relation(node: RecordNode | undefined, key: string): RecordNode | undefined {
  const value = node?.[key];
  if (value && typeof value === 'object' && 'Id' in value && typeof value.Id === 'string')
    return value as RecordNode;
}

const fields = (keys: string) =>
  keys
    .split(' ')
    .map(key => `${key} @optional { value }`)
    .join(' ');

function ownerFilter(ownerId: string) {
  if (!/^005[a-z\d]{12}(?:[a-z\d]{3})?$/i.test(ownerId))
    throw new Error('The selected banker could not be verified.');
  return `OwnerId: { eq: "${ownerId}" }`;
}

export async function fetchRecords(
  ownerId: string,
  source:
    | 'Account'
    | 'Task'
    | 'Event'
    | 'Case'
    | 'Lead'
    | 'FinancialGoal'
    | 'FinancialPlan'
    | 'PersonLifeEvent',
  after?: string,
  accountSearch = '',
  accountId?: string
) {
  const owner = ownerFilter(ownerId);
  if (accountId && !/^001[a-z\d]{12}(?:[a-z\d]{3})?$/i.test(accountId))
    throw new Error('Invalid household record.');
  const account = accountId ? `, Id: { eq: "${accountId}" }` : '';
  const related = accountId ? `, WhatId: { eq: "${accountId}" }` : '';
  const search = accountSearch.trim().replace(/[%_\\]/g, '');
  const accountMatch = search
    ? /^001[a-z\d]{12}(?:[a-z\d]{3})?$/i.test(search)
      ? `, Id: { eq: ${JSON.stringify(search)} }`
      : `, or: [{ Name: { like: ${JSON.stringify(`%${search}%`)} } }, { PersonEmail: { like: ${JSON.stringify(`%${search}%`)} } }]`
    : '';
  const queries = {
    Account: `where: { ${owner}${account || accountMatch} }, orderBy: { Name: { order: ASC } }`,
    Task: `where: { ${owner}${related} }, orderBy: { ActivityDate: { order: DESC } }`,
    Event: `where: { ${owner}${related} }, orderBy: { ActivityDateTime: { order: DESC } }`,
    Case: `where: { Account: { ${owner}${account} } }, orderBy: { CreatedDate: { order: DESC } }`,
    Lead: `where: { ${owner}, IsConverted: { eq: false } }`,
    FinancialPlan: `where: { Account: { ${owner}${account} } }`,
    FinancialGoal: `where: { FinancialPlan: { Account: { ${owner}${account} } } }, orderBy: { TargetDate: { order: ASC } }`,
    PersonLifeEvent: `where: { PrimaryPerson: { Account: { ${owner}${account} } } }, orderBy: { EventDate: { order: DESC } }`,
  };
  const selections = {
    Account: fields('Name PersonEmail PersonContactId Type Industry BillingCity BillingState Phone'),
    Task: fields('Subject ActivityDate Status Priority Description WhatId WhoId OwnerId IsClosed'),
    Event: fields('Subject ActivityDateTime ShowAs Description WhatId WhoId OwnerId Location'),
    Case: `${fields('CaseNumber Subject Status Priority CreatedDate Description')} Account @optional { Id ${fields('Name')} }`,
    Lead: fields('Name Company Status LeadSource Email FirstName LastName AnnualRevenue'),
    FinancialPlan: `${fields('Name AccountId')} Account @optional { Id ${fields('Name')} }`,
    FinancialGoal: `${fields('Name Type Status Priority TargetDate TargetAmount ActualAmount Description FinancialPlanId')} FinancialPlan @optional { Id ${fields('Name AccountId')} Account @optional { Id ${fields('Name')} } }`,
    PersonLifeEvent: `${fields('Name EventType EventDate PrimaryPersonId')} PrimaryPerson @optional { Id ${fields('Name AccountId')} Account @optional { Id ${fields('Name')} } }`,
  };
  const result = await executeGraphQL<{
    uiapi?: { query?: Record<string, Connection> };
  }>(`query WealthAtlasRecords {
    uiapi { query { ${source}(first: 200, ${queries[source]}${after ? `, after: ${JSON.stringify(after)}` : ''}) {
      totalCount pageInfo { hasNextPage endCursor } edges { node { Id ${selections[source]} } }
    } } }
  }`);
  const records = result.uiapi?.query?.[source];
  if (!records?.edges) throw new Error('Source records are unavailable.');
  return {
    rows: records.edges.map(edge => edge.node),
    total: records.totalCount,
    next: records.pageInfo?.hasNextPage ? records.pageInfo.endCursor : undefined,
  };
}

export type ProviderPlan = {
  account_id: string;
  account_name?: string;
  success: number | null;
  goal_usd: number | null;
  goals: number | null;
  next_review: string;
  updated: string;
  status: string;
  stale: number;
  retirement_age: number | null;
  monthly_income: number | null;
  allocation: string | null;
};

const PROVIDER = 'BT_MoneyGuidePro_Financial_Plans__dlm';
const LATEST = `profile_month__c = (SELECT MAX(profile_month__c) FROM ${PROVIDER})`;
const ACTIVE = "plan_status__c IN ('Active','Stale')";
const STALE = "(plan_status__c = 'Stale' OR plan_last_updated_date__c < CURRENT_DATE - INTERVAL '12' MONTH)";
const DUE = "next_review_date__c BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30' DAY";

export type ReviewLens = 'due' | 'risk' | 'critical' | 'stale' | 'all' | 'provider';

function filter(ownerId: string): string {
  const book = bookAccountFilter(ownerId);
  if (book.scope !== 'book') throw new Error('A verified advisory book is required.');
  return book.accountFilter;
}

export async function fetchProviderPlans(
  ownerId: string,
  lens: ReviewLens = 'provider',
  accountId?: string,
  exactOnly = false,
  maxResults = 200
) {
  const accountFilter = filter(ownerId);
  const lenses = {
    due: DUE,
    risk: 'monte_carlo_success_pct__c < 70',
    critical: 'monte_carlo_success_pct__c < 50',
    stale: STALE,
    all: '1 = 1',
    provider: '1 = 1',
  };
  const exact =
    accountId && /^001[a-z\d]{12}(?:[a-z\d]{3})?$/i.test(accountId)
      ? `OR account_id__c = '${accountId}'`
      : '';
  const onlyAccount = exactOnly && exact ? exact.replace(/^OR /, 'AND ') : '';
  const limit = onlyAccount ? 1 : Math.min(200, Math.max(1, Math.trunc(maxResults)));
  const result = await queryDataCloud<ProviderPlan>(
    `
    SELECT account_id__c AS account_id, monte_carlo_success_pct__c AS success, total_goal_amount_usd__c AS goal_usd,
      goal_count__c AS goals, CAST(next_review_date__c AS VARCHAR) AS next_review,
      CAST(plan_last_updated_date__c AS VARCHAR) AS updated, plan_status__c AS status,
      CASE WHEN ${STALE} THEN 1 ELSE 0 END AS stale,
      retirement_target_age__c AS retirement_age, monthly_income_target_usd__c AS monthly_income,
      recommended_asset_allocation__c AS allocation
    FROM ${PROVIDER}
    WHERE ${LATEST} AND account_id__c ${accountFilter} AND (${lenses[lens]} ${exact}) ${onlyAccount}
      AND ${lens === 'provider' ? '1 = 1' : ACTIVE}
    ORDER BY ${exact ? `CASE WHEN account_id__c = '${accountId}' THEN 0 ELSE 1 END,` : ''} next_review_date__c, account_id__c
    LIMIT ${limit}
  `,
    limit
  );
  const ids = [
    ...new Set(
      result.rows.map(row => row.account_id).filter(id => /^001[a-z\d]{12}(?:[a-z\d]{3})?$/i.test(id))
    ),
  ];
  const batches = await Promise.allSettled(
    Array.from({ length: Math.ceil(ids.length / 50) }, (_, i) =>
      executeGraphQL<{ uiapi?: { query?: { Account?: Connection } } }>(`query AtlasProviderNames {
      uiapi { query { Account(first: 50, where: { ${ownerFilter(ownerId)}, Id: { in: ${JSON.stringify(ids.slice(i * 50, (i + 1) * 50))} } }) {
        edges { node { Id Name @optional { value } } }
      } } }
    }`)
    )
  );
  const names = new Map(
    batches.flatMap(batch =>
      batch.status === 'fulfilled'
        ? (batch.value.uiapi?.query?.Account?.edges?.map(
            ({ node }) => [node.Id, stringField(node, 'Name')] as const
          ) ?? [])
        : []
    )
  );
  return result.rows.map(row => ({ ...row, account_name: names.get(row.account_id) }));
}

type PlanSummary = {
  plans: number;
  critical: number;
  at_risk: number;
  due30: number;
  stale: number;
  at_risk_goal_usd: number;
};
export async function fetchPlanSummary(ownerId: string) {
  const result = await queryDataCloud<PlanSummary>(
    `
    SELECT COUNT(*) AS plans, SUM(CASE WHEN monte_carlo_success_pct__c < 50 THEN 1 ELSE 0 END) AS critical,
      SUM(CASE WHEN monte_carlo_success_pct__c < 70 THEN 1 ELSE 0 END) AS at_risk,
      SUM(CASE WHEN ${DUE} THEN 1 ELSE 0 END) AS due30,
      SUM(CASE WHEN ${STALE} THEN 1 ELSE 0 END) AS stale,
      SUM(CASE WHEN monte_carlo_success_pct__c < 70 THEN total_goal_amount_usd__c ELSE 0 END) AS at_risk_goal_usd
    FROM ${PROVIDER} WHERE ${LATEST} AND ${ACTIVE} AND account_id__c ${filter(ownerId)}
  `,
    1
  );
  return result.rows[0];
}

export async function fetchCapitalAccountNames(ids: string[]) {
  const accountIds = ids.filter(id => /^001[a-z\d]{12}(?:[a-z\d]{3})?$/i.test(id));
  if (!accountIds.length) return new Map<string, string>();
  const result = await executeGraphQL<{ uiapi?: { query?: { Account?: Connection } } }>(`
    query CapitalAccountNames {
      uiapi { query {
        Account(first: ${accountIds.length}, where: { Id: { in: ${JSON.stringify(accountIds)} } }) {
          edges { node { Id Name @optional { value } } }
        }
      } }
    }
  `);
  return new Map((result.uiapi?.query?.Account?.edges ?? []).map(({ node }) => [node.Id, stringField(node, 'Name')]));
}

export type OutsideRow = {
  account_id: string;
  balance: number;
  institution: string;
  acct_type: string;
  net_flow: number;
  holdings: number;
};
export async function fetchOutside(ownerId: string, accountId?: string) {
  if (accountId && !/^001[a-z\d]{12}(?:[a-z\d]{3})?$/i.test(accountId))
    throw new Error('Invalid household record.');
  const exact = accountId ? `AND account_id__c = '${accountId}'` : '';
  const constraints = `profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Plaid_Held_Away__dlm)
    AND is_active__c = true AND balance_usd__c > 0 AND institution_type__c IN ('Brokerage', 'Robo-Advisor')
    AND account_id__c ${filter(ownerId)} ${exact}`;
  const [detail, total] = await Promise.all([
    queryDataCloud<OutsideRow>(
      `
      SELECT account_id, balance, institution, acct_type, net_flow, holdings FROM (
        SELECT account_id__c AS account_id, SUM(balance_usd__c) OVER (PARTITION BY account_id__c) AS balance,
          SUM(monthly_net_flow_usd__c) OVER (PARTITION BY account_id__c) AS net_flow,
          COUNT(*) OVER (PARTITION BY account_id__c) AS holdings, institution_name__c AS institution,
          account_type__c AS acct_type, ROW_NUMBER() OVER (PARTITION BY account_id__c ORDER BY balance_usd__c DESC) AS rn
        FROM BT_Plaid_Held_Away__dlm WHERE ${constraints}
      ) t WHERE rn = 1 ORDER BY balance DESC LIMIT 32
    `,
      32
    ),
    queryDataCloud<{ clients: number; balance: number }>(
      `
      SELECT COUNT(DISTINCT account_id__c) AS clients, SUM(balance_usd__c) AS balance
      FROM BT_Plaid_Held_Away__dlm WHERE ${constraints}
    `,
      1
    ),
  ]);
  return { rows: detail.rows, total: total.rows[0] };
}
