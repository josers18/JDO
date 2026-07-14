/**
 * Resolve a client's email straight from their Account record, so the banker
 * never types it. Person Accounts (Retail) hold it on `Account.PersonEmail`;
 * business Accounts (Wealth / Commercial) hold it on the primary related
 * Contact. One query covers both with a fallback.
 *
 * Best-effort by contract: any failure (no email on file, GraphQL unavailable,
 * a non-Account id) resolves to '' so the caller simply leaves its field
 * editable — this never makes a modal worse than typing by hand.
 */
import { executeGraphQL } from './graphqlClient';

interface AccountEmailShape {
  uiapi?: { query?: { Account?: { edges?: {
    node: {
      PersonEmail?: { value?: string | null };
      Contacts?: { edges?: { node: { Email?: { value?: string | null } } }[] };
    };
  }[] } } };
}

/**
 * @param accountId 15/18-char Account Id (the `clientId` every home view model
 *   already carries). Non-Account ids resolve to ''.
 * @returns the client's email, or '' when none is on file / lookup fails.
 */
export async function fetchAccountEmail(accountId?: string): Promise<string> {
  const id = (accountId ?? '').replace(/[^A-Za-z0-9]/g, '');
  if (!id) return '';
  // NOTE: no `(first: N)` on the Contacts child connection — the uiapi GraphQL
  // parser rejects it (top-level Account takes `first`, this child does not).
  // We read edges[0] client-side instead. Verified live against v67.0.
  const query = `query AccountEmail {
    uiapi { query {
      Account(first: 1, where: { Id: { eq: "${id}" } }) {
        edges { node {
          PersonEmail @optional { value }
          Contacts @optional { edges { node { Email @optional { value } } } }
        } }
      }
    } }
  }`;
  try {
    const data = await executeGraphQL<AccountEmailShape>(query);
    const node = data.uiapi?.query?.Account?.edges?.[0]?.node;
    const personEmail = node?.PersonEmail?.value ?? '';
    if (personEmail) return personEmail;
    const contactEmail = node?.Contacts?.edges?.[0]?.node?.Email?.value ?? '';
    return contactEmail || '';
  } catch {
    return '';
  }
}
