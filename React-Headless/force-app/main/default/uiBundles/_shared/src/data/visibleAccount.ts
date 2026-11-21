import { executeGraphQL } from './graphqlClient';

type AccountField = { value?: string | number | boolean | null };
type VisibleAccount = { Id: string } & Partial<Record<string, AccountField>>;

/** Resolve an individual profile through UI API sharing and field permissions. */
export async function readVisibleAccount(id: string): Promise<VisibleAccount | null> {
  if (!/^001[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?$/.test(id)) return null;
  const data = await executeGraphQL<{
    uiapi: { query: { Account: { edges: { node: VisibleAccount }[] } } };
  }>(`query AtlasAccountProfile {
    uiapi { query {
      Account(first: 1, where: { Id: { eq: "${id}" } }) {
        edges { node {
          Id Name @optional { value } OwnerId @optional { value } Type @optional { value }
          PersonEmail @optional { value } PersonContactId @optional { value } IsPersonAccount @optional { value }
          Industry @optional { value } BillingCity @optional { value } BillingState @optional { value }
          Phone @optional { value } Website @optional { value } Description @optional { value }
          NumberOfEmployees @optional { value } AnnualRevenue @optional { value }
        } }
      }
    } }
  }`);
  const account = data.uiapi.query.Account.edges[0]?.node;
  return account?.Id.slice(0, 15) === id.slice(0, 15) ? account : null;
}
