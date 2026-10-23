/**
 * "View as" — preview a cockpit from another banker's book.
 *
 * A session-scoped override of whose book the home page loads. While set:
 *   · every Data Cloud signal is book-scoped to the chosen banker, because
 *     `fetchEffectiveUser()` stands in for `fetchCurrentUser()` as the owner Id;
 *   · the CRM GraphQL roots get an owner filter via `ownerScopedQuery()`.
 * It does NOT change the session: GraphQL still runs with the logged-in user's
 * sharing, and CRM writes from the page are still made as (and owned by) them.
 * For an exact replica of someone's permissions use Setup → Users → Login.
 */
import { useSyncExternalStore } from 'react';
import { fetchCurrentUser, type CurrentUser } from './crmWriteClient';
import { queryDataCloud } from './dataCloudClient';
import { executeGraphQL } from './graphqlClient';

export interface ViewAsUser extends CurrentUser {
  /** Local accounts the banker owns (picker sub-label). */
  accounts?: number;
}

const KEY = 'cumulus.viewAs';
const SF_ID = /^005[a-zA-Z0-9]{12}(?:[a-zA-Z0-9]{3})?$/;
const listeners = new Set<() => void>();

function read(): ViewAsUser | null {
  try {
    const v = JSON.parse(globalThis.sessionStorage?.getItem(KEY) ?? 'null') as ViewAsUser | null;
    return v && SF_ID.test(v.userId) ? v : null;
  } catch {
    return null;
  }
}

let current: ViewAsUser | null = read();

export function getViewAs(): ViewAsUser | null {
  return current;
}

/** Set (or clear with null) the banker whose book the cockpit shows. */
export function setViewAs(user: ViewAsUser | null): void {
  current = user && SF_ID.test(user.userId) ? user : null;
  try {
    if (current) globalThis.sessionStorage?.setItem(KEY, JSON.stringify(current));
    else globalThis.sessionStorage?.removeItem(KEY);
  } catch { /* storage unavailable — keep the in-memory value */ }
  listeners.forEach(l => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => { listeners.delete(l); };
};

/** React binding — re-renders when the override changes. */
export function useViewAs(): ViewAsUser | null {
  return useSyncExternalStore(subscribe, getViewAs, getViewAs);
}

/** The banker the home page should load for: the override, else the session user. */
export async function fetchEffectiveUser(): Promise<CurrentUser | null> {
  return current ?? fetchCurrentUser();
}

/**
 * Client-centric roots are scoped by the CLIENT's owner, not the record owner:
 * life events and customer goals are data-loaded (owned by the loader), and a
 * case belongs to the banker of the account it's on. Everything else (tasks,
 * events, opportunities, leads, banker goals) filters on its own `OwnerId`.
 * Verified live 2026-10-22 (Sarah Smith: 10,672 life events, 1,650 open cases).
 */
const OWNER_PATH: Record<string, (eq: string) => string> = {
  PersonLifeEvent: eq => `PrimaryPerson: { Account: { OwnerId: ${eq} } }`,
  CustomerGoal: eq => `FinancialPlan: { Account: { OwnerId: ${eq} } }`,
  Case: eq => `Account: { OwnerId: ${eq} }`,
};

/**
 * Add an owner filter to every root connection of a uiapi query — the ones
 * written `Root(first: N…` or `Alias: Root(first: N…` (child connections take no
 * `first:`). Merges into an existing `where: {` or adds one. No-op without an Id.
 */
export function ownerScopedQuery(query: string, ownerId: string | null | undefined): string {
  if (!ownerId || !SF_ID.test(ownerId)) return query;
  const eq = `{ eq: "${ownerId}" }`;
  return query.replace(
    /(?:(\w+): )?(\w+)\(first: (\d+)(, where: \{ )?/g,
    (_m, alias: string | undefined, root: string, first: string, where: string | undefined) => {
      const filter = (OWNER_PATH[alias ?? root] ?? OWNER_PATH[root] ?? (e => `OwnerId: ${e}`))(eq);
      const head = `${alias ? `${alias}: ` : ''}${root}(first: ${first}`;
      return where ? `${head}, where: { ${filter}, ` : `${head}, where: { ${filter} }`;
    },
  );
}

/** Bankers worth previewing: users who own 100+ local accounts, largest book first. */
export async function fetchBankers(): Promise<ViewAsUser[]> {
  const owners = await queryDataCloud<{ owner_id: string; n: unknown }>(`
    SELECT ssot__OwnerId__c AS owner_id, COUNT(*) AS n
    FROM ssot__Account__dlm
    WHERE ssot__Id__c LIKE '001am%' AND ssot__OwnerId__c IS NOT NULL
    GROUP BY ssot__OwnerId__c
    HAVING COUNT(*) >= 100
    ORDER BY n DESC
    LIMIT 12
  `, 12);
  const ids = owners.rows.map(r => String(r.owner_id)).filter(id => SF_ID.test(id));
  if (!ids.length) return [];
  type Node = { Id: string; Name?: { value?: string }; FirstName?: { value?: string }; LastName?: { value?: string } };
  const users = await executeGraphQL<{ uiapi?: { query?: { User?: { edges?: { node: Node }[] } } } }>(`
    query ViewAsBankers {
      uiapi {
        query {
          User(first: 12, where: { Id: { in: [${ids.map(id => `"${id}"`).join(', ')}] } }) {
            edges { node { Id Name @optional { value } FirstName @optional { value } LastName @optional { value } } }
          }
        }
      }
    }`);
  const byId = new Map((users.uiapi?.query?.User?.edges ?? []).map(e => [e.node.Id, e.node]));
  return owners.rows.flatMap(r => {
    const u = byId.get(String(r.owner_id));
    if (!u) return [];
    return [{
      userId: u.Id,
      name: u.Name?.value ?? '',
      firstName: u.FirstName?.value ?? '',
      lastName: u.LastName?.value ?? '',
      accounts: Number(r.n) || 0,
    }];
  });
}
