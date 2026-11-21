import { executeGraphQL } from '../../data/graphqlClient';

const USER_ID = /^005[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?$/;
const retailStageOrder = ['Qualification', 'Proposal/Quote', 'Prospecting'];

export function orderRetailStages<Stage extends { name: string }>(stages: Stage[]): Stage[] {
  const rank = (name: string) => {
    const index = retailStageOrder.indexOf(name);
    return index === -1 ? retailStageOrder.length : index;
  };
  return [...stages].sort((a, b) => rank(a.name) - rank(b.name));
}

export async function fetchPipeline(ownerId: string) {
  if (!USER_ID.test(ownerId)) throw new Error('A verified pipeline owner is required.');
  type Group = { node: { aggregate?: { Amount?: { sum?: { value?: number | null } }; StageName?: { value?: string | null }; Id?: { count?: { value?: number } } } } };
  type Aggregate = { uiapi?: { aggregate?: { Opportunity?: { edges?: Group[] }; Stages?: { edges?: Group[] } } } };
  const where = `where: { OwnerId: { eq: "${ownerId}" }, IsClosed: { eq: false } }`;
  const result = await executeGraphQL<Aggregate>(`query AtlasPipeline {
    uiapi { aggregate {
      Opportunity(${where}) { edges { node { aggregate { Amount { sum { value } } } } } }
      Stages: Opportunity(${where}, groupBy: { StageName: { group: true } }) {
        edges { node { aggregate { StageName { value } Amount { sum { value } } Id { count { value } } } } }
      }
    } }
  }`);
  const aggregate = result.uiapi?.aggregate;
  return {
    amount: aggregate?.Opportunity?.edges?.[0]?.node.aggregate?.Amount?.sum?.value ?? null,
    stages: (aggregate?.Stages?.edges ?? []).flatMap(({ node }) => {
      const row = node.aggregate;
      const name = row?.StageName?.value;
      return name ? [{ name, amount: row.Amount?.sum?.value ?? 0, count: row.Id?.count?.value ?? null }] : [];
    }).sort((a, b) => b.amount - a.amount),
  };
}

type TextField = { value?: string | null };
type NumberField = { value?: number | null };
export type AtlasDeal = {
  Id: string;
  Name?: TextField;
  AccountId?: TextField;
  Account?: { Name?: TextField };
  StageName?: TextField;
  CloseDate?: TextField;
  Amount?: NumberField;
  Probability?: NumberField;
  LeadSource?: TextField;
  Description?: TextField;
};

export async function fetchPipelineDeals(ownerId: string, search: string, stage: string, after: string | null, pageSize = 40, recordId?: string) {
  if (!USER_ID.test(ownerId)) throw new Error('A verified pipeline owner is required.');
  type Connection = { totalCount: number; edges: { node: AtlasDeal }[]; pageInfo: { endCursor: string | null; hasNextPage: boolean } };
  if (recordId && !/^006[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?$/.test(recordId)) throw new Error('An exact opportunity ID is required.');
  const size = Math.min(100, Math.max(1, Math.trunc(pageSize)));
  const terms: string[] = [];
  const filter = ['IsClosed: { eq: false }', `OwnerId: { eq: "${ownerId}" }`];
  const variables: Record<string, string | null> = { after };
  if (recordId) filter.push(`Id: { eq: "${recordId}" }`);
  if (stage) {
    terms.push('$stage: Picklist');
    filter.push('StageName: { eq: $stage }');
    variables.stage = stage;
  }
  if (search) {
    terms.push('$term: String');
    filter.push('or: [{ Name: { like: $term } }, { Account: { Name: { like: $term } } }]');
    variables.term = '%' + search.replace(/[\\%_]/g, '\\$&') + '%';
  }
  const result = await executeGraphQL<{ uiapi?: { query?: { Opportunity?: Connection } } }>(`
    query AtlasPipelineDeals(${['$after: String', ...terms].join(', ')}) {
      uiapi { query {
        Opportunity(first: ${size}, after: $after, where: { ${filter.join(', ')} },
          orderBy: { Amount: { order: DESC }, Id: { order: ASC } }) {
          totalCount
          pageInfo { endCursor hasNextPage }
          edges { node {
            Id Name @optional { value } AccountId @optional { value }
            Account @optional { Name @optional { value } }
            StageName @optional { value } CloseDate @optional { value }
            Amount @optional { value } Probability @optional { value }
            LeadSource @optional { value } Description @optional { value }
          } }
        }
      } }
    }
  `, variables);
  if (!result.uiapi?.query?.Opportunity) throw new Error('The opportunity worklist is unavailable.');
  return result.uiapi.query.Opportunity;
}
