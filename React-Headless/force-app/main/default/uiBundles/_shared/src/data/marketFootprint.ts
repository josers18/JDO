/**
 * C7 — branch / market footprint from ESRI (`BT_ESRI_GEO_Footprint__dlm`, one
 * row per branch ZIP × month: `wealth_index__c` (100 = national average),
 * `foot_traffic_index__c`, `branch_recommendation__c` Optimize / Consolidate,
 * `distance_to_nearest_branch_mi__c`, Tapestry segment). ESRI carries no account
 * id, so the book is placed on it by the client's `BillingPostalCode` — only
 * clients in a profiled ZIP count. Consolidate ZIPs are a retention heads-up
 * (the branch may close); affluent Optimize ZIPs are where to grow.
 *
 * Verified live 2026-10-22: Allen Carter 1,788 clients matched across 1,051
 * ZIPs (227 in Consolidate ZIPs); Jose Sifontes 998 across 343 (114).
 */
import { queryDataCloud, queryDataCloudForBook, type BookScope } from './dataCloudClient';

const JOIN = `FROM ssot__Account__dlm a
    JOIN BT_ESRI_GEO_Footprint__dlm e ON e.branch_zip__c = a.BillingPostalCode__c
      AND e.profile_month__c = (SELECT MAX(profile_month__c) FROM BT_ESRI_GEO_Footprint__dlm)`;

// Top three ZIPs per recommendation by client count (wealthier first on ties).
const rowsSql = (accountFilter: string) => `
  SELECT zip, state, rec, wealth, traffic, dist, tapestry, clients FROM (
    SELECT e.branch_zip__c AS zip, MAX(e.state_code__c) AS state, MAX(e.branch_recommendation__c) AS rec,
           MAX(e.wealth_index__c) AS wealth, MAX(e.foot_traffic_index__c) AS traffic,
           MAX(e.distance_to_nearest_branch_mi__c) AS dist, MAX(e.tapestry_segment_name__c) AS tapestry,
           COUNT(*) AS clients,
           ROW_NUMBER() OVER (PARTITION BY MAX(e.branch_recommendation__c)
                              ORDER BY COUNT(*) DESC, MAX(e.wealth_index__c) DESC) AS pn
    ${JOIN}
    WHERE a.ssot__Id__c ${accountFilter}
    GROUP BY e.branch_zip__c
  ) x
  WHERE pn <= 3
  ORDER BY pn, rec
`;

const summarySql = (accountFilter: string) => `
  SELECT COUNT(*) AS clients, COUNT(DISTINCT e.branch_zip__c) AS zips,
         SUM(CASE WHEN e.branch_recommendation__c = 'Consolidate' THEN 1 ELSE 0 END) AS consolidate,
         SUM(CASE WHEN e.wealth_index__c >= 120 THEN 1 ELSE 0 END) AS affluent,
         AVG(e.wealth_index__c) AS wealth, AVG(e.foot_traffic_index__c) AS traffic,
         AVG(e.distance_to_nearest_branch_mi__c) AS dist
  ${JOIN}
  WHERE a.ssot__Id__c ${accountFilter}
`;

export interface FootprintZip {
  zip: string;
  state: string;
  recommendation: 'Optimize' | 'Consolidate';
  wealthIndex: number;
  footTraffic: number;
  distanceMi: number;
  tapestry: string;
  clients: number;
}

export interface MarketFootprintResult {
  rows: FootprintZip[];
  /** Clients whose billing ZIP has an ESRI profile. */
  clients: number;
  zips: number;
  /** …of which sit in a Consolidate ZIP. */
  consolidate: number;
  /** …of which sit in a ZIP with wealth index ≥ 120. */
  affluent: number;
  avgWealthIndex: number;
  avgFootTraffic: number;
  avgDistanceMi: number;
  scope: BookScope;
}

/** C7 — where the book sits on the branch network: Consolidate vs Optimize ZIPs. */
export async function fetchMarketFootprint(ownerId: string | null | undefined): Promise<MarketFootprintResult> {
  const res = await queryDataCloudForBook<Record<string, unknown>>(rowsSql, ownerId, 6);
  const total = await queryDataCloud<Record<string, unknown>>(summarySql(res.accountFilter), 1)
    .then(r => r.rows[0] ?? {})
    .catch((): Record<string, unknown> => ({}));
  return {
    scope: res.scope,
    clients: Number(total.clients) || 0,
    zips: Number(total.zips) || 0,
    consolidate: Number(total.consolidate) || 0,
    affluent: Number(total.affluent) || 0,
    avgWealthIndex: Number(total.wealth) || 0,
    avgFootTraffic: Number(total.traffic) || 0,
    avgDistanceMi: Number(total.dist) || 0,
    rows: res.rows.map(r => ({
      zip: String(r.zip ?? ''),
      state: String(r.state ?? ''),
      recommendation: r.rec === 'Consolidate' ? 'Consolidate' as const : 'Optimize' as const,
      wealthIndex: Number(r.wealth) || 0,
      footTraffic: Number(r.traffic) || 0,
      distanceMi: Number(r.dist) || 0,
      tapestry: String(r.tapestry ?? '').replace(/&amp;/g, '&'),
      clients: Number(r.clients) || 0,
    })),
  };
}
