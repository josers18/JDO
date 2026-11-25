import { executeGraphQL } from '@shared/data/graphqlClient';
import { queryDataCloudForBook } from '@shared/data/dataCloudClient';
import { accountId, readBook, type BookNode, type Row } from './retailData';

const sources = {
  transactions: { table: 'ssot__FinancialAccountTransaction__dlm', account: 'SFAccountID__c',
    columns: 'ssot__TransactionDate__c dt, ssot__FinancialTransactionCategory__c cat, ssot__FinancialAccountTransactionType__c typ, ssot__TransactionAmount__c amt', order: 'ssot__TransactionDate__c', limit: 12 },
  interactions: { table: 'InteractionSummary_Home__dlm', account: 'AccountId__c',
    columns: 'CreatedDate__c dt, Name__c nm, InteractionPurpose__c purp, MeetingNotes__c notes, NextSteps__c nxt', order: 'CreatedDate__c', limit: 8 },
  notes: { table: 'Meeting_Note_c_Home__dlm', account: 'Account_c__c',
    columns: 'Date_c__c dt, Title_c__c ttl, Notes_c__c notes', order: 'Date_c__c', limit: 6 },
  campaigns: { table: 'Marketing_Campaigns__dlm', account: 'AccountID__c',
    columns: 'Campaign_Name__c nm, Product_Name__c prod, Email_Action__c act, Send_Date__c dt', order: 'Send_Date__c', limit: 8 },
  satisfaction: { table: 'CSAT_Snowflake__dlm', account: 'accountid__c',
    columns: 'csat_score__c csat, nps_score__c nps, score_date__c dt', order: 'score_date__c', limit: 8 },
  screening: { table: 'BT_WorldCheck_AML__dlm', account: 'account_id__c',
    columns: 'overall_risk_rating__c rating, profile_date__c dt, change_since_last_run__c change_type, case_reference__c reference, sanctions_hit__c sanctions, pep_hit__c pep, adverse_media_hit__c media', order: 'profile_date__c', limit: 6 },
  property: { table: 'BT_Corelogic_Property__dlm', account: 'account_id__c',
    columns: 'estimated_property_value__c val, equity_usd__c eq, outstanding_mortgage_balance__c mortgage, primary_property_type__c property_type, is_owner__c is_owner, profile_quarter__c dt', order: 'profile_quarter__c', limit: 1 },
  offers: { table: 'BT_Offer_Eligibility__dlm', account: 'account_id__c',
    columns: 'action_code__c code, recommended_action_rank__c rank, conversion_probability__c probability, expected_value_uplift__c value, recommended_channels__c channels',
    order: 'recommended_action_rank__c', limit: 15 },
} as const;

export async function readCustomerSource(customer: BookNode, ownerId: string, source: keyof typeof sources) {
  if (!accountId.test(customer.Id)) throw new Error('The relationship could not be verified.');
  const spec = sources[source];
  const eligibility = source === 'offers' ? 'AND conversion_probability__c IS NOT NULL' : '';
  return queryDataCloudForBook<Row>(filter => `
    SELECT ${spec.columns}
    FROM ${spec.table}
    WHERE ${spec.account} = '${customer.Id}' AND ${spec.account} ${filter}
      ${eligibility}
    ORDER BY ${spec.order} ${source === 'offers' ? 'ASC NULLS LAST' : 'DESC'}
    LIMIT ${spec.limit}
  `, ownerId, spec.limit, true);
}

export async function readCustomerHoldings(customer: BookNode) {
  if (!accountId.test(customer.Id)) throw new Error('The relationship could not be verified.');
  type Connection = { totalCount: number; edges: { node: BookNode }[] };
  const data = await executeGraphQL<{ uiapi?: { query?: { FinServ__FinancialAccount__c?: Connection } } }>(`query AtlasRetailCustomerHoldings {
    uiapi { query {
      FinServ__FinancialAccount__c(first: 40, where: { FinServ__PrimaryOwner__c: { eq: "${customer.Id}" } }) {
        totalCount
        edges { node { Id Name @optional { value } FinServ__FinancialAccountType__c @optional { value }
          FinServ__Balance__c @optional { value } FinServ__Status__c @optional { value } } }
      }
    } }
  }`);
  const connection = data.uiapi?.query?.FinServ__FinancialAccount__c;
  if (!connection) throw new Error('Financial accounts are unavailable.');
  return { total: connection.totalCount, rows: connection.edges.map(({ node }) => node) };
}

export function readCustomerCrm(root: 'Task' | 'Event' | 'Case' | 'FinancialGoal' | 'PersonLifeEvent' | 'Opportunity',
  ownerId: string, customer: BookNode, count = 12) {
  return readBook(root, ownerId, { count, customerId: customer.Id, forCustomer: true });
}
