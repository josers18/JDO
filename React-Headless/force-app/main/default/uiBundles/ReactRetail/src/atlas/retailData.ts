import { executeGraphQL } from '@shared/data/graphqlClient';
import { queryDataCloudForBook } from '@shared/data/dataCloudClient';
import { decodeEntities } from '@shared/data/decodeEntities';
import { sourceQueries, type RetailSource } from './retailSourceQueries';

export const accountId = /^001[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?$/;
const ownerIdPattern = /^005[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?$/;
const validId = /^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/;
export type Row = Record<string, unknown>;
type Node = Row & { Id: string };
type Connection = { totalCount: number; rows: Node[]; next: string | null };
type Result = { uiapi?: { query?: Record<string, {
  totalCount: number;
  edges: { node: Node }[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
}> } };

export function field(row: Row | undefined, key: string): unknown {
  const wrapper = row?.[key];
  return wrapper && typeof wrapper === 'object' && 'value' in wrapper ? wrapper.value : undefined;
}
export function relation(row: Row | undefined, key: string): Row | undefined {
  const value = row?.[key];
  return value && typeof value === 'object' ? value as Row : undefined;
}
export function label(row: Row | undefined, key: string, fallback = '—') {
  const value = field(row, key);
  return typeof value === 'string' && value ? decodeEntities(value) : fallback;
}
export function numeric(value: unknown): number | null {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
const fields = (...keys: string[]) => keys.map(key => `${key} @optional { value }`).join(' ');
const accountFields = fields('Name', 'Type', 'Industry', 'BillingCity', 'BillingState', 'Phone', 'PersonEmail', 'PersonContactId', 'AnnualRevenue', 'NumberOfEmployees', 'Website');
const detail = {
  Account: { fields: accountFields, order: 'Name', ascending: true },
  Task: { fields: fields('Subject', 'ActivityDate', 'Status', 'Priority', 'WhatId', 'Description', 'OwnerId', 'Type'), order: 'ActivityDate', ascending: true },
  Event: { fields: fields('Subject', 'ActivityDateTime', 'Type', 'Description', 'WhatId', 'OwnerId', 'Location', 'ShowAs', 'DurationInMinutes'), order: 'ActivityDateTime', ascending: true },
  Case: { fields: fields('CaseNumber', 'Subject', 'Priority', 'Status', 'CreatedDate', 'Description') + ' Account @optional { Id Name @optional { value } }', order: 'CreatedDate' },
  Opportunity: { fields: fields('Name', 'StageName', 'Amount', 'CloseDate', 'Probability') + ' Account @optional { Id Name @optional { value } }', order: 'CloseDate', ascending: true },
  Lead: { fields: fields('Name', 'FirstName', 'LastName', 'Company', 'Status', 'LeadSource', 'AnnualRevenue', 'Email', 'Phone', 'CreatedDate'), order: 'Name', ascending: true },
  FinancialGoal: {
    fields: fields('Name', 'Status', 'Priority', 'Type', 'Description', 'TargetDate', 'TargetAmount', 'ActualAmount', 'FinancialPlanId')
      + ' FinancialPlan @optional { Name @optional { value } Account @optional { Id Name @optional { value } } }',
    order: 'TargetDate',
    ascending: true,
  },
  PersonLifeEvent: {
    fields: fields('Name', 'EventType', 'EventDate', 'PrimaryPersonId')
      + ' PrimaryPerson @optional { Name @optional { value } Account @optional { Id Name @optional { value } } }',
    order: 'EventDate',
  },
};
export type ObjectName = keyof typeof detail;
const assignedTo = (ownerId: string) => `OwnerId: { eq: "${ownerId}" }`;

function ownership(root: ObjectName, ownerId: string) {
  const owner = assignedTo(ownerId);
  if (root === 'Case') return `Account: { ${owner} }`;
  if (root === 'FinancialGoal') return `FinancialPlan: { Account: { ${owner} } }`;
  if (root === 'PersonLifeEvent') return `PrimaryPerson: { Account: { ${owner} } }`;
  return owner;
}

interface BookOptions {
  count?: number;
  after?: string | null;
  search?: string;
  record?: string;
  source?: string;
  status?: string;
  ids?: string[];

  kind?: string;
  upcoming?: boolean;
  recorded?: boolean;
  priority?: string;
  customerId?: string;
  leadSource?: string;
  wonSince?: string;
  exactName?: string;
  forCustomer?: boolean;
}

export async function readBook(root: ObjectName, ownerId: string, options: BookOptions = {}): Promise<Connection> {
  if (!ownerIdPattern.test(ownerId)) throw new Error('The selected banker could not be verified.');
  const config = detail[root];
  if (options.forCustomer && (!options.customerId || !accountId.test(options.customerId))) throw new Error('The customer could not be verified.');
  const customerScoped = options.forCustomer && ['Event', 'Task', 'Opportunity', 'Case', 'FinancialGoal', 'PersonLifeEvent'].includes(root);
  const predicates = customerScoped ? [] : [ownership(root, ownerId)];
  if (!options.record && !options.forCustomer && !options.wonSince && ['Task', 'Opportunity', 'Case'].includes(root)) predicates.push('IsClosed: { eq: false }');
  if (!options.record && root === 'Event' && options.upcoming) predicates.push('ActivityDateTime: { gte: { literal: TODAY } }');
  if (!options.record && root === 'Event' && options.recorded) predicates.push('ActivityDateTime: { lte: { literal: TODAY } }');
  if (root === 'Case' && options.priority) predicates.push(`Priority: { eq: ${JSON.stringify(options.priority)} }`);
  if (!options.record && root === 'Lead') predicates.push('IsConverted: { eq: false }');
  if (options.record) {
    if (!validId.test(options.record)) throw new Error('This record link is invalid.');
    predicates.push(`Id: { eq: "${options.record}" }`);
  }
  if (options.customerId) {
    if (!accountId.test(options.customerId)) throw new Error('The customer could not be verified.');
    const customer = `Account: { Id: { eq: "${options.customerId}" } }`;
    if (root === 'PersonLifeEvent') predicates.push(`PrimaryPerson: { ${customer} }`);
    if (root === 'FinancialGoal') predicates.push(`FinancialPlan: { ${customer} }`);
    if (root === 'Case') predicates.push(customer);
    if (root === 'Task' || root === 'Event') predicates.push(`WhatId: { eq: "${options.customerId}" }`);
    if (root === 'Opportunity') predicates.push(`AccountId: { eq: "${options.customerId}" }`);
  }
  if (options.ids) {
    if (!options.ids.length) return { totalCount: 0, rows: [], next: null };
    predicates.push(`Id: { in: ${JSON.stringify(options.ids.filter(id => validId.test(id)))} }`);
  }
  if (options.search?.trim()) {
    const term = options.search.trim().slice(0, 100);
    const like = JSON.stringify(`%${term.replace(/[%_]/g, '')}%`);
    const searchFields = root === 'Account' ? ['Name', 'Industry', 'BillingCity', 'BillingState'] : ['Name', 'Company'];
    const parts = searchFields.map(key => `{ ${key}: { like: ${like} } }`);
    if (validId.test(term)) parts.push(`{ Id: { eq: "${term}" } }`);
    predicates.push(`or: [${parts.join(', ')}]`);
  }
  if (root === 'Lead' && options.source) {
    predicates.push(options.source === 'Referral'
      ? 'or: [{ LeadSource: { eq: "Referral" } }, { LeadSource: { eq: "Employee Referral" } }, { LeadSource: { eq: "Partner Referral" } }]'
      : `LeadSource: { eq: ${JSON.stringify(options.source)} }`);
  }
  if (root === 'Lead' && options.status) predicates.push(`Status: { eq: ${JSON.stringify(options.status)} }`);
  if (root === 'PersonLifeEvent' && options.kind) predicates.push(`EventType: { eq: ${JSON.stringify(options.kind)} }`);
  if (root === 'Opportunity') {
    if (options.leadSource) predicates.push(`LeadSource: { eq: ${JSON.stringify(options.leadSource)} }`);
    if (options.exactName) predicates.push(`Name: { eq: ${JSON.stringify(options.exactName)} }`);
    if (options.wonSince) predicates.push(`IsWon: { eq: true }, CloseDate: { gte: { value: ${JSON.stringify(options.wonSince)} } }`);
  }
  const where = `where: { and: [${predicates.map(predicate => `{ ${predicate} }`).join(', ')}] }`;
  const after = options.after ? `, after: ${JSON.stringify(options.after)}` : '';
  const order = `orderBy: { ${config.order}: { order: ${'ascending' in config && !options.recorded ? 'ASC' : 'DESC'} } }`;
  const response = await executeGraphQL<Result>(`query RetailAtlas${root} {
    uiapi { query {
      ${root}(first: ${options.count ?? 12}${after}, ${where}, ${order}) {
        totalCount
        edges { node { Id ${config.fields} } }
        pageInfo { hasNextPage endCursor }
      }
    } }
  }`);
  const connection = response.uiapi?.query?.[root];
  if (!connection?.edges || typeof connection.totalCount !== 'number') throw new Error('The Salesforce source is unavailable.');
  return { rows: connection.edges.map(({ node }) => node), totalCount: connection.totalCount,
    next: connection.pageInfo?.hasNextPage ? connection.pageInfo.endCursor : null };
}

export async function readPipelineAmount(ownerId: string) {
  if (!ownerIdPattern.test(ownerId)) throw new Error('The selected banker could not be verified.');
  type Sum = { Amount?: { sum?: { value?: number | null } }; Id?: { count?: { value?: number } }; StageName?: { value?: string } };
  type Group = { edges: { node: { aggregate?: Sum } }[] };
  type Result = { uiapi?: { aggregate?: { Opportunity?: Group; Stages?: Group } } };
  const result = await executeGraphQL<Result>(`query RetailAtlasPipelineTotal {
    uiapi { aggregate {
      Opportunity(where: { IsClosed: { eq: false }, ${assignedTo(ownerId)} }) {
        edges { node { aggregate { Amount { sum { value } } Id { count { value } } } } }
      }
      Stages: Opportunity(where: { IsClosed: { eq: false }, ${assignedTo(ownerId)} }, groupBy: { StageName: { group: true } }) {
        edges { node { aggregate { StageName { value } Amount { sum { value } } Id { count { value } } } } }
      }
    } }
  }`);
  const row = result.uiapi?.aggregate?.Opportunity?.edges?.[0]?.node.aggregate;
  if (!row) throw new Error('The pipeline aggregate is unavailable.');
  return { amount: row.Amount?.sum?.value ?? (row.Id?.count?.value === 0 ? 0 : null), count: row.Id?.count?.value ?? null,
    stages: (result.uiapi?.aggregate?.Stages?.edges ?? []).flatMap(({ node }) => {
      const name = node.aggregate?.StageName?.value;
      return name ? [{ name, amount: node.aggregate?.Amount?.sum?.value, count: node.aggregate?.Id?.count?.value }] : [];
    }).sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0)),
  };
}

export async function readSource(source: RetailSource, ownerId: string) {
  if (!ownerIdPattern.test(ownerId)) throw new Error('The selected banker could not be verified.');
  const { sql, limit } = sourceQueries[source];
  return queryDataCloudForBook<Row>(sql, ownerId, limit, true);
}

export async function bookNames(ownerId: string, rows: Row[], key = 'account_id') {
  const ids = [...new Set(rows.map(row => String(row[key] ?? '')).filter(id => accountId.test(id)))];
  const chunks = Array.from({ length: Math.ceil(ids.length / 50) }, (_, i) => ids.slice(i * 50, i * 50 + 50));
  const names = await Promise.all(chunks.map(chunk => readBook('Account', ownerId, { ids: chunk, count: 50 })));
  return new Map(names.flatMap(chunk => chunk.rows.map(row => [row.Id, label(row, 'Name', row.Id)])));
}

export type BookNode = Node;

export async function readHoldings(ids: string[]) {
  const visibleIds = [...new Set(ids.filter(id => accountId.test(id)))];
  if (!visibleIds.length) return [];
  const root = 'FinServ__FinancialAccount__c';
  const result = await executeGraphQL<Result>(`query AtlasRetailHoldings {
    uiapi { query {
      ${root}(first: 400, where: { and: [
        { FinServ__PrimaryOwner__c: { in: ${JSON.stringify(visibleIds)} } },
        { FinServ__Status__c: { ne: "Closed" } }
      ] }) { totalCount edges { node { Id ${fields('Name', 'FinServ__PrimaryOwner__c', 'FinServ__Status__c')} } } }
    } }
  }`);
  const connection = result.uiapi?.query?.[root];
  if (!connection?.edges) throw new Error('Open financial accounts are unavailable.');
  return connection.edges.map(({ node }) => node);
}

export async function readOfferHistory(ownerId: string, id: string, code: string) {
  if (!ownerIdPattern.test(ownerId) || !accountId.test(id) || !/^[A-Z0-9-]{1,25}$/.test(code)) throw new Error('The selected offer could not be verified.');
  return queryDataCloudForBook<Row>(filter => `
    SELECT CAST(start_date__c AS VARCHAR) AS period,
           conversion_probability__c AS probability, expected_value_uplift__c AS expected_value
    FROM BT_Offer_Eligibility_History__dlm
    WHERE account_id__c = '${id}' AND account_id__c ${filter} AND action_code__c = '${code}'
    ORDER BY start_date__c DESC LIMIT 6
  `, ownerId, 6, true);
}
