/**
 * S8 — data freshness. Instead of a hardcoded "AI confidence", the hero shows how
 * current the sources behind the page are. Each source gets its latest date and an
 * expected cadence, and counts as current while its age is within that cadence's
 * allowance. The meter is the share of current sources; CRM (GraphQL) is live
 * and always current. Other live sources (ServiceNow, read zero-copy from Heroku
 * Postgres) still carry a date and go stale after a day without a change.
 *
 * Latest dates verified live 2026-11-09: transactions + World-Check today; Gong
 * and the relationship graph 11-09; Plaid + D&B 11-01 (monthly); marketing 11-10
 * (UTC stamp); CSAT 10-01; offer model 11-01 (monthly run). ServiceNow (zero-copy, live) 11-11.
 *
 * Timestamp sources (transactions, marketing, ServiceNow) come back in UTC and
 * read on the banker's local day; date sources keep their date.
 *
 * ServiceNow also has to be in sync: its stream is zero-copy, so the DLO is the
 * Heroku table read live, and the DMO's per-status counts must match it (the
 * same comparison as the feed's sn_dmo_check). A gap marks the source stale
 * with the statuses that differ, whatever its date.
 */
import { queryDataCloud } from './dataCloudClient';
import { localDay } from './localDate';

export type Cadence = 'live' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'batch';

/** Days a source may lag before it reads as stale. */
const ALLOWANCE: Record<Cadence, number> = { live: 1, daily: 3, weekly: 10, monthly: 45, quarterly: 100, batch: 120 };

const SOURCES = {
  transactions: { label: 'Transactions', cadence: 'daily', sql: 'MAX(ssot__TransactionDate__c) FROM ssot__FinancialAccountTransaction__dlm' },
  worldCheck: { label: 'World-Check AML', cadence: 'daily', sql: 'MAX(profile_date__c) FROM BT_WorldCheck_AML__dlm' },
  marketing: { label: 'Marketing engagement', cadence: 'daily', sql: 'MAX(engagement_at__c) FROM Marketing_Engagements__dlm' },
  serviceNow: { label: 'ServiceNow cases', cadence: 'live', sql: "MAX(ssot__LastModifiedDate__c) FROM ssot__Case__dlm WHERE ssot__DataSourceObjectId__c = 'service_now_cases'" },
  gong: { label: 'Gong call sentiment', cadence: 'weekly', sql: 'MAX(profile_week__c) FROM BT_Gong_Call_Sentiment__dlm' },
  graph: { label: 'Relationship graph', cadence: 'batch', sql: 'MAX(edge_discovered_date__c) FROM BT_Synth_Relationship_Graph__dlm' },
  offers: { label: 'Offer model', cadence: 'monthly', sql: 'MAX(start_date__c) FROM BT_Offer_Eligibility__dlm' },
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
  /** Why the source isn't current despite its date, e.g. a DMO out of sync. */
  issue?: string;
}

export interface DataFreshness {
  sources: SourceFreshness[];
  /** Share of sources that are current, 0–100. */
  pct: number;
}

const DAY = 86_400_000;

const SN_SYNC_SQL = `SELECT 'dlo' AS side, status__c AS st, COUNT(*) AS n FROM service_now_cases__dll GROUP BY status__c
  UNION ALL SELECT 'dmo' AS side, ssot__CaseStatusId__c AS st, COUNT(*) AS n FROM ssot__Case__dlm
  WHERE ssot__DataSourceObjectId__c = 'service_now_cases' GROUP BY ssot__CaseStatusId__c`;

/** ServiceNow DMO vs. its zero-copy table, per status. Undefined when they match. */
async function serviceNowSyncIssue(): Promise<string | undefined> {
  const res = await queryDataCloud<{ side: string; st: unknown; n: unknown }>(SN_SYNC_SQL, 50);
  const dlo = new Map<string, number>();
  const dmo = new Map<string, number>();
  for (const r of res.rows) (String(r.side) === 'dlo' ? dlo : dmo).set(String(r.st), Number(r.n));
  const gaps = [...new Set([...dlo.keys(), ...dmo.keys()])]
    .sort()
    .filter(st => (dlo.get(st) ?? 0) !== (dmo.get(st) ?? 0))
    .map(st => `${st.replace('_', ' ')} ${dmo.get(st) ?? 0} vs ${dlo.get(st) ?? 0}`);
  return gaps.length ? `DMO out of sync with the table (DMO vs table): ${gaps.join(', ')}` : undefined;
}

/** S8 — latest date per source in one round trip, plus CRM as a live source. */
export async function fetchDataFreshness(keys: FreshnessSource[], now: Date = new Date()): Promise<DataFreshness> {
  const sql = keys
    .map(k => `SELECT '${k}' AS src, CAST(${SOURCES[k].sql.replace(/^(MAX\([^)]*\))/, '$1 AS VARCHAR) AS as_of')}`)
    .join('\n  UNION ALL ');
  const [res, snIssue] = await Promise.all([
    queryDataCloud<{ src: string; as_of: unknown }>(sql, keys.length),
    // A failed sync query leaves the date-based verdict alone rather than flagging the source.
    keys.includes('serviceNow') ? serviceNowSyncIssue().catch(() => undefined) : undefined,
  ]);
  const asOf = new Map(res.rows.map(r => [String(r.src), localDay(r.as_of)]));
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const sources: SourceFreshness[] = [
    { label: 'Salesforce CRM', cadence: 'live', asOf: '', ageDays: 0, current: true },
    ...keys.flatMap(k => {
      const d = asOf.get(k);
      if (!d) return [];
      const ageDays = Math.max(0, Math.round((today - Date.parse(`${d}T00:00:00Z`)) / DAY));
      const { label, cadence } = SOURCES[k];
      const issue = k === 'serviceNow' ? snIssue : undefined;
      return [{ label, cadence, asOf: d, ageDays, current: ageDays <= ALLOWANCE[cadence] && !issue, ...(issue ? { issue } : {}) }];
    }),
  ];
  return { sources, pct: Math.round((100 * sources.filter(s => s.current).length) / sources.length) };
}
