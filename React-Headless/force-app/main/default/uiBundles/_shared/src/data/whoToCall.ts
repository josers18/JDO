/**
 * R7 — the blended Who-to-Call score: one per-client score across the book from
 * four Data Cloud drivers, replacing the CSAT-only call list. Each driver is
 * normalized to 0–1 and weighted:
 *
 *   · CSAT (30%)   — latest survey per account below 70 (`CSAT_Snowflake__dlm`); 20 → 1.
 *   · Gong (30%)   — S1 negative + declining call sentiment this week, by deal risk.
 *   · Stress (25%) — R3 Claritas High now and 3+ of the last 6 months, by months High.
 *   · Offer (15%)  — S3 best retail offer's modeled conversion (50%+ → 1): a reason
 *                    to call that isn't a problem.
 *
 * (months_high is an integer count — divide by 6.0, or anything short of 6/6 truncates
 * to 0.) Stress at 25% lets persistent-stress clients share the top 8 with Gong save
 * calls; at 30% they crowd them out. Risk drivers dominate, so stacked signals rise to the top. Every row names its
 * drivers, and the action follows the strongest one. Verified live 2026-10-22: Sarah
 * Smith 10,012 clients score (6,916 low CSAT, 48 Gong, 393 stress, 8,916 offers;
 * 280 with 2+ risk drivers); after the 2026-10-23 rebalance her top 8 is 5 stress + 4
 * Gong clients, led by stress 4/6 + CSAT 54 + Negative calls + a 50% offer.
 */
import { queryDataCloud, queryDataCloudForBook, type BookScope } from './dataCloudClient';
import { offerLabel } from './offerModel';
import type { QueueSeverity, QueueSignalItem } from './priorityQueue';

/** Driver weights — they sum to 1, so the score is 0–1. */
export const WHO_TO_CALL_WEIGHTS = { csat: 0.3, gong: 0.3, stress: 0.25, offer: 0.15 } as const;
const W = WHO_TO_CALL_WEIGHTS;
/** Latest CSAT below this counts; the floor of the scale (20) scores 1. */
const CSAT_LOW = 70;
/** Months High (of six) at which stress counts. */
const STRESS_MONTHS = 3;
const RETAIL_OFFERS = "'MTG-30', 'AUTO-ACQ', 'CRC-ACQ', 'CHK-ACQ', 'FTH-ACQ', 'HYS-ACQ'";

// c = low latest CSAT; g = souring calls; s = persistent stress; o = best offer;
// ids = every client with any driver; b = the blended score.
const ctes = (accountFilter: string) => `
  WITH c AS (
    SELECT acct, csat, nps, reason FROM (
      SELECT accountid__c AS acct, csat_score__c AS csat, nps_score__c AS nps, csat_description__c AS reason,
             ROW_NUMBER() OVER (PARTITION BY accountid__c ORDER BY score_date__c DESC) AS rn
      FROM CSAT_Snowflake__dlm
      WHERE csat_score__c IS NOT NULL AND accountid__c ${accountFilter}
    ) t WHERE rn = 1 AND csat < ${CSAT_LOW}
  ),
  g AS (
    SELECT account_id__c AS acct, MAX(overall_sentiment__c) AS sentiment, MAX(deal_risk_score__c) AS risk
    FROM BT_Gong_Call_Sentiment__dlm
    WHERE profile_week__c = (SELECT MAX(profile_week__c) FROM BT_Gong_Call_Sentiment__dlm)
      AND overall_sentiment__c IN ('Negative', 'Very Negative') AND sentiment_trend__c = 'Declining'
      AND account_id__c ${accountFilter}
    GROUP BY account_id__c
  ),
  s AS (
    SELECT acct, months_high FROM (
      SELECT account_id__c AS acct,
             SUM(CASE WHEN financial_stress_indicator__c = 'High' THEN 1 ELSE 0 END) AS months_high,
             MAX(CASE WHEN profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Claritas_Demographics__dlm)
                       AND financial_stress_indicator__c = 'High' THEN 1 ELSE 0 END) AS now_high
      FROM BT_Claritas_Demographics__dlm
      WHERE account_id__c ${accountFilter}
      GROUP BY account_id__c
    ) t WHERE now_high = 1 AND months_high >= ${STRESS_MONTHS}
  ),
  o AS (
    SELECT acct, code, conv FROM (
      SELECT a.ssot__Id__c AS acct, o.Action_Code__c AS code, o.Conversion_Probability__c AS conv,
             ROW_NUMBER() OVER (PARTITION BY a.ssot__Id__c ORDER BY o.Recommended_Action_Rank__c) AS rn
      FROM Offer_Eligibility_Model__dlm o
      JOIN ssot__Account__dlm a ON a.External_ID_c__c = o.MDM_ID__c
      WHERE o.Action_Code__c IN (${RETAIL_OFFERS})
        AND o.Recommended_Action_Rank__c IS NOT NULL AND o.Expected_Value_Uplift__c > 0
        AND a.ssot__Id__c ${accountFilter}
    ) t WHERE rn = 1
  ),
  ids AS (
    SELECT DISTINCT acct FROM (
      SELECT acct FROM c UNION ALL SELECT acct FROM g UNION ALL SELECT acct FROM s UNION ALL SELECT acct FROM o
    ) u
  ),
  b AS (
    SELECT ids.acct AS account_id, c.csat AS csat, c.nps AS nps, c.reason AS csat_reason,
           g.sentiment AS sentiment, g.risk AS deal_risk, s.months_high AS months_high, o.code AS offer_code, o.conv AS conv,
           ${W.csat} * COALESCE((${CSAT_LOW} - c.csat) / ${CSAT_LOW - 20}, 0)
         + ${W.gong} * COALESCE(g.risk / 100, 0)
         + ${W.stress} * COALESCE(s.months_high / 6.0, 0)
         + ${W.offer} * COALESCE(CASE WHEN o.conv >= 50 THEN 1 ELSE o.conv / 50 END, 0) AS score
    FROM ids
    LEFT JOIN c ON c.acct = ids.acct
    LEFT JOIN g ON g.acct = ids.acct
    LEFT JOIN s ON s.acct = ids.acct
    LEFT JOIN o ON o.acct = ids.acct
  )`;

const rowsSql = (accountFilter: string) => `${ctes(accountFilter)}
  SELECT * FROM b ORDER BY score DESC LIMIT 8
`;

const summarySql = (accountFilter: string) => `${ctes(accountFilter)}
  SELECT COUNT(*) AS clients,
         SUM(CASE WHEN (CASE WHEN csat IS NOT NULL THEN 1 ELSE 0 END) + (CASE WHEN deal_risk IS NOT NULL THEN 1 ELSE 0 END)
                     + (CASE WHEN months_high IS NOT NULL THEN 1 ELSE 0 END) >= 2 THEN 1 ELSE 0 END) AS multi
  FROM b
`;

export type WhoToCallDriver = 'csat' | 'gong' | 'stress' | 'offer';

export interface WhoToCallRow {
  accountId: string;
  /** Blended 0–1. */
  score: number;
  csat: number | null;
  nps: number | null;
  sentiment: string | null;
  dealRisk: number | null;
  monthsHigh: number | null;
  offerCode: string | null;
  /** Modeled conversion %, 0–68. */
  conversionPct: number | null;
  /** Each present driver's weighted contribution, strongest first. */
  drivers: { driver: WhoToCallDriver; points: number }[];
}

export interface WhoToCallResult {
  /** Highest blended score first. */
  rows: WhoToCallRow[];
  /** Clients with any driver, and with two or more risk drivers. */
  clients: number;
  multiSignal: number;
  scope: BookScope;
}

const n = (v: unknown) => (v == null || v === '' ? null : Number(v));

/** R7 — the book's blended Who-to-Call list. */
export async function fetchWhoToCall(ownerId: string | null | undefined): Promise<WhoToCallResult> {
  const res = await queryDataCloudForBook<Record<string, unknown>>(rowsSql, ownerId, 8);
  const total = await queryDataCloud<Record<string, unknown>>(summarySql(res.accountFilter), 1)
    .then(r => r.rows[0] ?? {})
    .catch((): Record<string, unknown> => ({}));
  return {
    scope: res.scope,
    clients: Number(total.clients) || res.rows.length,
    multiSignal: Number(total.multi) || 0,
    rows: res.rows.map(r => {
      const csat = n(r.csat);
      const dealRisk = n(r.deal_risk);
      const monthsHigh = n(r.months_high);
      const conversionPct = n(r.conv);
      const drivers: WhoToCallRow['drivers'] = [];
      if (csat != null) drivers.push({ driver: 'csat', points: W.csat * (CSAT_LOW - csat) / (CSAT_LOW - 20) });
      if (dealRisk != null) drivers.push({ driver: 'gong', points: W.gong * dealRisk / 100 });
      if (monthsHigh != null) drivers.push({ driver: 'stress', points: W.stress * monthsHigh / 6 });
      if (conversionPct != null) drivers.push({ driver: 'offer', points: W.offer * Math.min(1, conversionPct / 50) });
      drivers.sort((a, b) => b.points - a.points);
      return {
        accountId: String(r.account_id ?? ''),
        score: Number(r.score) || 0,
        csat,
        nps: n(r.nps),
        sentiment: r.sentiment == null ? null : String(r.sentiment),
        dealRisk,
        monthsHigh,
        offerCode: r.offer_code == null ? null : String(r.offer_code),
        conversionPct,
        drivers,
      };
    }),
  };
}

/** Short tag labels for the card's driver tags. */
const DRIVER_TAG: Record<WhoToCallDriver, string> = { csat: 'CSAT', gong: 'Gong', stress: 'Stress', offer: 'Offer' };

const DRIVER_LABEL: Record<WhoToCallDriver, string> = {
  csat: 'CSAT', gong: 'Gong', stress: 'Claritas stress', offer: 'Offer model',
};

const DRIVER_ACTION: Record<WhoToCallDriver, (r: WhoToCallRow) => string> = {
  csat: () => 'Service-recovery outreach',
  gong: () => 'Relationship save call',
  stress: () => 'Hardship check-in — relief options, fee waiver',
  offer: r => `Next-best offer — ${offerLabel(r.offerCode ?? '')}`,
};

/** One phrase per driver, strongest first: "CSAT 52 · Very Negative calls (risk 79) · 63% likely: 30-year fixed mortgage". */
const whoToCallReason = (r: WhoToCallRow) =>
  r.drivers.map(({ driver }) => {
    if (driver === 'csat') return `CSAT ${Math.round(r.csat ?? 0)}${r.nps != null ? ` · NPS ${Math.round(r.nps)}` : ''}`;
    if (driver === 'gong') return `${r.sentiment} & declining calls (risk ${Math.round(r.dealRisk ?? 0)})`;
    if (driver === 'stress') return `High stress ${r.monthsHigh} of 6 months`;
    return `${Math.round(r.conversionPct ?? 0)}% likely: ${offerLabel(r.offerCode ?? '')}`;
  }).join(' · ');

const RISK: readonly WhoToCallDriver[] = ['csat', 'gong', 'stress'];

/** Two+ risk drivers, CSAT ≤ 30 or Very Negative calls → high; any risk → medium; offer only → low. */
function whoToCallSeverity(r: WhoToCallRow): QueueSeverity {
  const risks = r.drivers.filter(d => RISK.includes(d.driver)).length;
  if (risks >= 2 || (r.csat != null && r.csat <= 30) || r.sentiment === 'Very Negative') return 'high';
  return risks ? 'medium' : 'low';
}

/** R7 blended rows → the Who-to-Call list (and the Priority Queue's primary feed). */
export function whoToCallItems(
  res: WhoToCallResult,
  nameById: Record<string, string>,
  opts: { segment: string },
): QueueSignalItem[] {
  return res.rows.map((r, i) => {
    const severity = whoToCallSeverity(r);
    const top = r.drivers[0]?.driver ?? 'csat';
    return {
      id: `c${i}`,
      clientId: r.accountId,
      clientName: nameById[r.accountId] || r.accountId,
      segment: opts.segment,
      reason: whoToCallReason(r),
      action: DRIVER_ACTION[top](r),
      score: r.score,
      severity,
      source: `Blended · ${r.drivers.map(d => DRIVER_LABEL[d.driver]).join(' + ')}${res.scope === 'org' ? ' · org-wide' : ''}`,
      relationshipValue: 0,
      drivers: r.drivers.map(d => ({ label: DRIVER_TAG[d.driver], points: d.points, tone: d.driver === 'offer' ? 'opportunity' as const : 'risk' as const })),
      tier: severity === 'high' ? 'today' : severity === 'medium' ? 'week' : 'watch',
    };
  });
}
