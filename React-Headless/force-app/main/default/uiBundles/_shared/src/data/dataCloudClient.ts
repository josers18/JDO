/**
 * Data Cloud path. For data with NO Salesforce origin (Connector Type =
 * SNOWFLAKE / Databricks / AIPlatform / streaming in the DC inventory): the
 * Cumulus enrichment suite, ML predictions, CSAT/NPS, financial trades,
 * held-away, MGP plans, demographics, property, call sentiment, AML, etc.
 *
 * Goes through the Apex REST bridge (DcBridgeRest) because @AuraEnabled Apex is
 * not callable from UI bundles. Internally the bridge runs read-only ANSI SQL
 * via ConnectApi.CdpQuery.queryAnsiSqlV2 — the same mechanism the LWCs use.
 */
import { createDataSDK } from '@salesforce/platform-sdk';

export interface DataCloudColumn {
  name: string;
  type: string;
}

export interface DataCloudResult<TRow = Record<string, unknown>> {
  columns: DataCloudColumn[];
  rows: TRow[];
  rowCount: number;
  warning: string | null;
}

export async function queryDataCloud<TRow = Record<string, unknown>>(
  sql: string,
  maxRows?: number
): Promise<DataCloudResult<TRow>> {
  const sdk = await createDataSDK();
  if (!sdk.fetch) {
    throw new Error('fetch is not available on this surface');
  }
  const res = await sdk.fetch('/services/apexrest/dc/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, maxRows }),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.error ?? `Data Cloud query failed (HTTP ${res.status})`);
  }
  return json as DataCloudResult<TRow>;
}

/** Which slice of the org a book-scoped query actually returned. */
export type BookScope = 'book' | 'org';

export interface BookScopedResult<TRow> extends DataCloudResult<TRow> {
  scope: BookScope;
  /** The predicate that produced these rows — reuse it for companion queries
   *  (e.g. a book-total aggregate) so they cover the same slice. */
  accountFilter: string;
}

const SF_ID = /^[a-zA-Z0-9]{15}(?:[a-zA-Z0-9]{3})?$/;
/** This org's Account key prefix. The unified profile spans several source
 *  orgs (001al / 001Wt / 001a5 …) whose Ids have no local Account record. */
const ORG_ACCOUNT_FILTER = "LIKE '001am%'";

/**
 * Run a Data Cloud query scoped to the accounts the given user owns (their
 * "book"), joined DC-side through `ssot__Account__dlm.ssot__OwnerId__c` —
 * books are 5–11K accounts, far too many for a client-built IN list.
 *
 * `build` receives the predicate to append after the account-key column
 * (e.g. `account_id__c ${filter}`). Falls back to the org-wide filter when
 * there is no user or the book has no rows for this DMO (e.g. a business
 * banker opening the Wealth cockpit), and reports which scope it used.
 */
export async function queryDataCloudForBook<TRow = Record<string, unknown>>(
  build: (accountFilter: string) => string,
  ownerId: string | null | undefined,
  maxRows?: number
): Promise<BookScopedResult<TRow>> {
  if (ownerId && SF_ID.test(ownerId)) {
    const accountFilter = `IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '${ownerId}')`;
    const book = await queryDataCloud<TRow>(build(accountFilter), maxRows);
    if (book.rows.length) return { ...book, scope: 'book', accountFilter };
  }
  const org = await queryDataCloud<TRow>(build(ORG_ACCOUNT_FILTER), maxRows);
  return { ...org, scope: 'org', accountFilter: ORG_ACCOUNT_FILTER };
}
