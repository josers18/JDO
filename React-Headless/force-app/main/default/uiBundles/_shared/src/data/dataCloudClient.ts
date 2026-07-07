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
