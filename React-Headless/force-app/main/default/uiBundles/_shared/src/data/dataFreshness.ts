/**
 * S8 — data freshness. Instead of a hardcoded "AI confidence", the hero shows how
 * current the sources behind the page are. Each source gets its latest date and an
 * expected cadence, and counts as current while its age is within that cadence's
 * allowance. The meter is the share of current sources; CRM (GraphQL) is live
 * and always current.
 *
 * Latest dates verified live 2026-10-22: transactions + World-Check today; Gong
 * and the relationship graph 10-19; Plaid + D&B 10-01 (monthly); marketing 09-24;
 * CSAT 09-01; offer model 08-12 (single scoring run); ServiceNow 2025-02-13.
 */
import { queryDataCloud } from './dataCloudClient';

export type Cadence = 'live' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'batch';

/** Days a source may lag before it reads as stale. */
const ALLOWANCE: Record<Cadence, number> = { live: Infinity, daily: 3, weekly: 10, monthly: 45, quarterly: 100, batch: 120 };

const SOURCES = {
  transactions: { label: 'Transactions', cadence: 'daily', sql: 'MAX(ssot__TransactionDate__c) FROM ssot__FinancialAccountTransaction__dlm' },
  worldCheck: { label: 'World-Check AML', cadence: 'daily', sql: 'MAX(profile_date__c) FROM BT_WorldCheck_AML__dlm' },
  marketing: { label: 'Marketing engagement', cadence: 'daily', sql: 'MAX(engagement_at__c) FROM Marketing_Engagements__dlm' },
  serviceNow: { label: 'ServiceNow cases', cadence: 'daily', sql: "MAX(ssot__CreatedDate__c) FROM ssot__Case__dlm WHERE ssot__DataSourceId__c = 'Service_Now'" },
  gong: { label: 'Gong call sentiment', cadence: 'weekly', sql: 'MAX(profile_week__c) FROM BT_Gong_Call_Sentiment__dlm' },
  graph: { label: 'Relationship graph', cadence: 'batch', sql: 'MAX(edge_discovered_date__c) FROM BT_Synth_Relationship_Graph__dlm' },
  offers: { label: 'Offer model', cadence: 'batch', sql: 'MAX(Start_Date__c) FROM Offer_Eligibility_Model__dlm' },
  bizOffers: { label: 'Business offer scores', cadence: 'monthly', sql: 'MAX(start_date__c) FROM BT_Offer_Eligibility__dlm' },
  csat: { label: 'CSAT scores', cadence: 'monthly', sql: 'MAX(score_date__c) FROM CSAT_Snowflake__dlm' },
  plaid: { label: 'Plaid held-away', cadence: 'monthly', sql: 'MAX(profile_month__c) FROM BT_Plaid_Held_Away__dlm' },
  corelogic: { label: 'CoreLogic property', cadence: 'quarterly', sql: 'MAX(profile_quarter__c) FROM BT_Corelogic_Property__dlm' },
  dnb: { label: 'D&B credit', cadence: 'monthly', sql: 'MAX(profile_month__c) FROM BT_DNB_Business_Credit__dlm' },
  moneyGuidePro: { label: 'MoneyGuidePro plans', cadence: 'monthly', sql: 'MAX(profile_month__c) FROM BT_MoneyGuidePro_Financial_Plans__dlm' },
  moodys: { label: "Moody's market context", cadence: 'daily', sql: 'MAX(profile_date__c) FROM BT_Moodys_Market_Context__dlm' },
  boardex: { label: 'BoardEx governance', cadence: 'monthly', sql: 'MAX(profile_month__c) FROM BT_Boardex__dlm' },
  msci: { label: 'MSCI ESG', cadence: 'monthly', sql: 'MAX(profile_month__c) FROM BT_MSCI_ESG_Scores__dlm' },
  trades: { label: 'Trades', cadence: 'daily', sql: "MAX(trade_date__c) FROM BT_Financial_Trades__dlm WHERE account_id__c LIKE '001am%'" },
  claritas: { label: 'Claritas demographics', cadence: 'monthly', sql: 'MAX(profile_month__c) FROM BT_Claritas_Demographics__dlm' },
  esri: { label: 'ESRI geo footprint', cadence: 'monthly', sql: 'MAX(profile_month__c) FROM BT_ESRI_GEO_Footprint__dlm' },
  zoominfo: { label: 'ZoomInfo firmographics', cadence: 'monthly', sql: 'MAX(profile_month__c) FROM BT_Zoominfo_Firmographics__dlm' },
} satisfies Record<string, { label: string; cadence: Cadence; sql: string }>;

export type FreshnessSource = keyof typeof SOURCES;

export interface SourceFreshness {
  label: string;
  cadence: Cadence;
  /** YYYY-MM-DD; empty for live sources. */
  asOf: string;
  ageDays: number;
  current: boolean;
}

export interface DataFreshness {
  sources: SourceFreshness[];
  /** Share of sources that are current, 0–100. */
  pct: number;
}

const DAY = 86_400_000;

/** S8 — latest date per source in one round trip, plus CRM as a live source. */
export async function fetchDataFreshness(keys: FreshnessSource[], now: Date = new Date()): Promise<DataFreshness> {
  const sql = keys
    .map(k => `SELECT '${k}' AS src, CAST(${SOURCES[k].sql.replace(/^(MAX\([^)]*\))/, '$1 AS VARCHAR)')}`)
    .join('\n  UNION ALL ');
  const res = await queryDataCloud<{ src: string; as_of: unknown }>(sql, keys.length);
  const asOf = new Map(res.rows.map(r => [String(r.src), String(r.as_of ?? '').slice(0, 10)]));
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const sources: SourceFreshness[] = [
    { label: 'Salesforce CRM', cadence: 'live', asOf: '', ageDays: 0, current: true },
    ...keys.flatMap(k => {
      const d = asOf.get(k);
      if (!d) return [];
      const ageDays = Math.max(0, Math.round((today - Date.parse(`${d}T00:00:00Z`)) / DAY));
      const { label, cadence } = SOURCES[k];
      return [{ label, cadence, asOf: d, ageDays, current: ageDays <= ALLOWANCE[cadence] }];
    }),
  ];
  return { sources, pct: Math.round((100 * sources.filter(s => s.current).length) / sources.length) };
}
