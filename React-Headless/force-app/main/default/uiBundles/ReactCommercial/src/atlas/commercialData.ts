import { executeGraphQL, queryDataCloudForBook } from '@shared';

type Field = { value?: string | number | boolean | null };
export type RecordNode = { Id: string } & Partial<Record<
  'Name' | 'Industry' | 'BillingCity' | 'BillingState' | 'Phone' | 'Website' | 'NumberOfEmployees' |
  'FinServ__Balance__c' | 'FinServ__FinancialAccountType__c' | 'FinServ__Status__c' | 'FinServ__OpenDate__c' | 'FinServ__FinancialAccountNumber__c' | 'OwnerId' | 'Description' | 'Type' |
  'Subject' | 'ActivityDate' | 'ActivityDateTime' | 'CreatedDate' | 'Status' | 'Priority' | 'Location' |
  'CaseNumber' | 'WhatId' | 'WhoId' | 'AccountId' | 'StageName' | 'Amount' | 'CloseDate' |
  'Company' | 'LeadSource' | 'FirstName' | 'LastName' | 'Email' | 'AnnualRevenue' | 'IsPersonAccount' | 'TargetAmount' | 'ActualAmount' | 'TargetDate' | 'EventType' | 'EventDate', Field
>> & { Account?: { Id?: string; Name?: Field };
  FinancialPlan?: { Id: string; Name?: Field; Account?: { Id: string; Name?: Field } };
  PrimaryPerson?: { Id: string; Account?: { Id: string; Name?: Field } } };
type Connection = { edges?: { node: RecordNode; cursor?: string }[]; totalCount?: number; pageInfo?: { hasNextPage: boolean; endCursor: string } };
export type Root = Record<string, Connection | undefined>;
export const str = (row: RecordNode, key: keyof RecordNode) => {
  const v = row[key];
  return typeof v === 'object' && v && 'value' in v ? String(v.value ?? '') : '';
};
export const nodes = (connection?: Connection) => connection?.edges?.map(edge => edge.node) ?? [];
export const validId = (id: string) => /^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/.test(id);
export const recordKey = (id: string) => id.slice(0, 15);
export const sameId = (a: string, b: string) => recordKey(a) === recordKey(b);
const fields = (names: string) => names.split(' ').map(name => `${name} @optional { value }`).join(' ');
const accountFields = fields('Name Industry BillingCity BillingState OwnerId Description Type IsPersonAccount AnnualRevenue Phone Website NumberOfEmployees');
const nameRelation = 'Account @optional { Id Name @optional { value } }';

async function crm(selection: string): Promise<Root> {
  const r = await executeGraphQL<{ uiapi?: { query?: Root } }>(`query CommercialAtlas { uiapi { query { ${selection} } } }`);
  if (!r.uiapi?.query) throw new Error('Salesforce returned no query result.');
  return r.uiapi.query;
}

export function findCompanies(ownerId: string, query = '', industry = '', after?: string) {
  const term = query.trim();
  const like = JSON.stringify('%' + term.replace(/[\\%_]/g, '\\$&') + '%');
  const match = validId(term) ? `Id: { eq: ${JSON.stringify(term)} }` :
    `or: [{ Name: { like: ${like} } }, { Industry: { like: ${like} } }, { BillingCity: { like: ${like} } }, { BillingState: { like: ${like} } }]`;
  return crm(`Account(first: 48${after ? ', after: ' + JSON.stringify(after) : ''}, where: { OwnerId: { eq: "${ownerId}" }, IsPersonAccount: { eq: false } ${industry ? ', Industry: { eq: ' + JSON.stringify(industry) + ' }' : ''} ${term ? ', ' + match : ''} }, orderBy: { Name: { order: ASC } }) {
    totalCount pageInfo { hasNextPage endCursor } edges { node { Id ${accountFields} } }
  }`);
}

export async function readBookAccountCount(ownerId: string) {
  const result = await crm(`Account(first: 1, where: { OwnerId: { eq: "${ownerId}" } }) { totalCount }`);
  return result.Account?.totalCount ?? null;
}

export async function verifyAccounts(ownerId: string, ids: string[]) {
  const unique = [...new Set(ids.filter(validId))];
  const batches = Array.from({ length: Math.ceil(unique.length / 50) }, (_, i) => unique.slice(i * 50, i * 50 + 50));
  const results = await Promise.all(batches.map(batch => crm(`Account(first: 50, where: { OwnerId: { eq: "${ownerId}" }, IsPersonAccount: { eq: false }, Id: { in: ${JSON.stringify(batch)} } }) { edges { node { Id ${accountFields} } } }`)));
  return new Map(results.flatMap(r => nodes(r.Account)).map(a => [recordKey(a.Id), a]));
}

export const workKinds = ['tasks', 'meetings', 'cases'] as const;
export type WorkKind = typeof workKinds[number];
export type WorkScope = 'company' | 'assigned';
export function readWork(ownerId: string, kind: WorkKind, month?: string, accountId?: string, scope: WorkScope = 'company') {
  const user = JSON.stringify(ownerId);
  const company = `OwnerId: { eq: ${user} }, IsPersonAccount: { eq: false }`;
  const assignment = `OwnerId: { eq: ${user} }`;
  const where = scope === 'assigned' ? assignment : kind === 'cases' ? `Account: { ${company} }`
    : `${assignment}, WhatId: { inq: { Account: { ${company} }, ApiName: "Id" } }`;
  const exact = accountId && validId(accountId)
    ? `${kind === 'cases' ? 'AccountId' : 'WhatId'}: { eq: ${JSON.stringify(accountId)} }` : '';
  const filter = exact ? `and: [{ ${where} }, { ${exact} }]` : where;
  const monthStart = month && new Date(month.slice(0, 7) + '-01T00:00:00Z');
  const monthEnd = monthStart && new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));
  const dateFilter = monthStart && monthEnd ? `, ActivityDateTime: { gte: { value: "${monthStart.toISOString()}" }, lt: { value: "${monthEnd.toISOString()}" } }` : '';
  const spec = {
    tasks: ['Task', 'ActivityDate', 'Subject ActivityDate Status Priority Description AccountId WhatId WhoId OwnerId'],
    meetings: ['Event', 'ActivityDateTime', 'Subject ActivityDateTime Description Location AccountId WhatId WhoId OwnerId'],
    cases: ['Case', 'CreatedDate', 'Subject CreatedDate Description Status Priority CaseNumber AccountId OwnerId'],
  }[kind];
  return crm(`Records: ${spec[0]}(first: ${month ? 200 : 48}, where: { ${filter}${kind === 'meetings' ? dateFilter : ''} }, orderBy: { ${spec[1]}: { order: DESC } }) {
    totalCount edges { node { Id ${fields(spec[2])} ${nameRelation} } }
  }`);
}

export function readPipeline(ownerId: string) {
  return crm(`Opportunity(first: 5, where: { OwnerId: { eq: "${ownerId}" }, IsClosed: { eq: false } }, orderBy: { Amount: { order: DESC } }) {
    totalCount edges { node { Id ${fields('Name StageName Amount CloseDate AccountId')} ${nameRelation} } }
  }`);
}

export function readLeads(ownerId: string) {
  return crm(`Lead(first: 48, where: { OwnerId: { eq: "${ownerId}" }, IsConverted: { eq: false } }, orderBy: { CreatedDate: { order: DESC } }) {
    totalCount edges { node { Id ${fields('Name FirstName LastName Company Status LeadSource Email AnnualRevenue CreatedDate')} } }
  }`);
}

const creditSource = 'BT_DNB_Business_Credit__dlm';
export const latestCreditPeriod = `profile_month__c = (SELECT MAX(profile_month__c) FROM ${creditSource})`;
export const paymentBandSql = `CASE WHEN average_days_beyond_terms__c >= 30 THEN '30+ days beyond terms'
  WHEN average_days_beyond_terms__c > 05 THEN '15–29 days beyond terms'
  WHEN average_days_beyond_terms__c > 0 THEN '1–14 days beyond terms'
  ELSE 'Paying on terms' END`;
export type CreditRow = { account_id: string; paydex: number | null; failure: number | null; tier: string | null; delinquency: number | null; days_beyond: number | null; as_of: string; band: string };
export type PaymentBand = { band: string; cnt: number; paydex: number | null; as_of: string };
export function readCredit(ownerId: string, band = '') {
  return queryDataCloudForBook<CreditRow>(filter => `
    SELECT account_id__c AS account_id, paydex_score__c AS paydex, failure_risk_score__c AS failure,
      supplier_risk_level__c AS tier, delinquency_predictor_score__c AS delinquency,
      average_days_beyond_terms__c AS days_beyond, profile_month__c AS as_of, ${paymentBandSql} AS band
    FROM ${creditSource}
    WHERE ${latestCreditPeriod} AND account_id__c ${filter} AND average_days_beyond_terms__c IS NOT NULL
      ${band ? `AND (${paymentBandSql}) = '${band.replace(/'/g, "''")}'` : ''}
    ORDER BY days_beyond DESC, account_id ASC LIMIT 16`, ownerId, 16, true);
}
export function readPaymentBands(ownerId: string) {
  return queryDataCloudForBook<PaymentBand>(filter => `
    SELECT ${paymentBandSql} AS band, COUNT(*) AS cnt, AVG(paydex_score__c) AS paydex, MAX(profile_month__c) AS as_of
    FROM ${creditSource}
    WHERE ${latestCreditPeriod} AND account_id__c ${filter} AND average_days_beyond_terms__c IS NOT NULL
    GROUP BY 1 ORDER BY MIN(average_days_beyond_terms__c) ASC`, ownerId, 5, true);
}

export function readPersonalPlanning(ownerId: string) {
  return crm(`
    FinancialGoal(first: 36, where: { FinancialPlan: { Account: { OwnerId: { eq: "${ownerId}" }, IsPersonAccount: { eq: true } } } }, orderBy: { TargetDate: { order: ASC } }) {
      edges { node { Id ${fields('Name TargetAmount ActualAmount TargetDate Status Priority Type Description')}
        FinancialPlan @optional { Id Name @optional { value } Account @optional { Id Name @optional { value } } }
      } }
    }
    PersonLifeEvent(first: 36, where: { PrimaryPerson: { Account: { OwnerId: { eq: "${ownerId}" }, IsPersonAccount: { eq: true } } } }, orderBy: { EventDate: { order: DESC } }) {
      edges { node { Id ${fields('Name EventType EventDate')}
        PrimaryPerson @optional { Id Account @optional { Id Name @optional { value } } }
      } }
    }
  `);
}

export async function assertActivity(ownerId: string, accountId: string, recordId: string, kind: 'Task' | 'Event') {
  if (!validId(recordId)) throw new Error('The activity ID is invalid.');
  const result = await crm(`Activity: ${kind}(first: 1, where: { Id: { eq: "${recordId}" }, OwnerId: { eq: "${ownerId}" }, WhatId: { eq: "${accountId}" } }) { edges { node { Id } } }`);
  if (!nodes(result.Activity).length) throw new Error('This activity could not be verified for the selected company and owner.');
}

export async function readCompanyFinance(ownerId: string, accountId: string) {
  const [accounts, positions] = await Promise.allSettled([
    crm(`FinancialAccounts: FinServ__FinancialAccount__c(first: 48, where: { FinServ__PrimaryOwner__c: { eq: "${accountId}" } }) {
      totalCount edges { node { Id ${fields('Name FinServ__Balance__c FinServ__FinancialAccountType__c FinServ__Status__c FinServ__OpenDate__c FinServ__FinancialAccountNumber__c')} } }
    }
    Opportunity(first: 32, where: { OwnerId: { eq: "${ownerId}" }, AccountId: { eq: "${accountId}" }, IsClosed: { eq: false } }, orderBy: { Amount: { order: DESC } }) {
      totalCount edges { node { Id ${fields('Name StageName Amount CloseDate LeadSource')} } }
    }`),
    queryDataCloudForBook<{ dt: string; category: string; kind: string; amount: number | null }>(filter => `
      SELECT ssot__TransactionDate__c AS dt, ssot__FinancialTransactionCategory__c AS category,
        ssot__FinancialAccountTransactionType__c AS kind, ssot__TransactionAmount__c AS amount
      FROM ssot__FinancialAccountTransaction__dlm WHERE SFAccountID__c = '${accountId}' AND SFAccountID__c ${filter}
      ORDER BY ssot__TransactionDate__c DESC LIMIT 24`, ownerId, 24, true),
  ]);
  return { accounts, positions };
}
