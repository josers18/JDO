/**
 * Type-ahead lookups for the editable reference fields on the schedule modal —
 * Assigned To (User) and Related To (Account). Native records edit Owner/What
 * via a search box, not a fixed list (the candidate set is every user / every
 * account), so we resolve matches with a live name search.
 *
 * Best-effort by contract: any failure resolves to [] so the field stays usable
 * (the caller keeps whatever was typed) — a lookup outage never blocks a save.
 */
import { executeGraphQL } from './graphqlClient';

export interface LookupHit {
  id: string;
  name: string;
}

/** Escape a user-typed term for safe inlining into a GraphQL `like` string. */
function escapeTerm(term: string): string {
  // Keep it conservative: strip quotes/backslashes that would break the literal
  // or let a term escape the string. SOSL/SOQL wildcards aren't needed — we wrap
  // the whole term in %…%.
  return term.replace(/["\\%_]/g, '').trim();
}

interface UserShape {
  uiapi?: { query?: { User?: { edges?: { node: { Id?: string; Name?: { value?: string } } }[] } } };
}
interface AccountShape {
  uiapi?: { query?: { Account?: { edges?: { node: { Id?: string; Name?: { value?: string } } }[] } } };
}

/** Search active Users by name for the Assigned To lookup. */
export async function searchUsers(term: string, limit = 8): Promise<LookupHit[]> {
  const t = escapeTerm(term);
  if (t.length < 2) return [];
  const query = `query UserSearch {
    uiapi { query {
      User(first: ${limit}, where: { Name: { like: "%${t}%" }, IsActive: { eq: true } }, orderBy: { Name: { order: ASC } }) {
        edges { node { Id Name @optional { value } } }
      }
    } }
  }`;
  try {
    const data = await executeGraphQL<UserShape>(query);
    return (data.uiapi?.query?.User?.edges ?? [])
      .map(e => ({ id: e.node.Id ?? '', name: e.node.Name?.value ?? '' }))
      .filter(h => h.id && h.name);
  } catch {
    return [];
  }
}

/** Search Accounts by name for the Related To (customer) lookup. */
export async function searchAccounts(term: string, limit = 8): Promise<LookupHit[]> {
  const t = escapeTerm(term);
  if (t.length < 2) return [];
  const query = `query AccountSearch {
    uiapi { query {
      Account(first: ${limit}, where: { Name: { like: "%${t}%" } }, orderBy: { Name: { order: ASC } }) {
        edges { node { Id Name @optional { value } } }
      }
    } }
  }`;
  try {
    const data = await executeGraphQL<AccountShape>(query);
    return (data.uiapi?.query?.Account?.edges ?? [])
      .map(e => ({ id: e.node.Id ?? '', name: e.node.Name?.value ?? '' }))
      .filter(h => h.id && h.name);
  } catch {
    return [];
  }
}
