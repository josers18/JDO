/**
 * C10 — Commercial's blended Who-to-Call score, the R7 / W9 pattern for a
 * relationship-manager book: one per-client score from five Data Cloud drivers,
 * replacing the D&B-only call list. Each driver is normalized to 0–1 and weighted:
 *
 *   · Credit (30%)  — C1 D&B risk index (failure 50% / PAYDEX 30% / delinquency
 *                     20%, all inverted) on Severe / High-tier or PAYDEX < 60
 *                     borrowers; index 20 → 0, 60 → 1.
 *   · Gong (25%)    — S1 negative + declining call sentiment this week, by deal risk.
 *   · Outlook (10%) — C2 Moody's outlook today: Watch → 1, Negative → 0.6.
 *   · Fees (20%)    — C9 3+ NSF / overdraft / late fees in 30 days; 6+ → 1.
 *   · Offer (15%)   — S3 best business offer's modeled conversion (50%+ → 1): a
 *                     reason to call that isn't a problem.
 *
 * Every row names its drivers, and the action follows the strongest one. The
 * outlook hasn't moved since 2025 (C2) while fees are 30-day live, so fees outweigh
 * it; at 15/15 a fee spike peaked at rank 11 in Allen Carter's book, at 10/20 his
 * top 8 holds 3 fee clients beside credit + Watch / Gong rows.
 */
import { queryDataCloud, queryDataCloudForBook, type BookScope } from './dataCloudClient';
import { offerLabel } from './offerModel';
import type { QueueSeverity, QueueSignalItem } from './priorityQueue';

/** Driver weights — they sum to 1, so the score is 0–1. */
export const COMMERCIAL_WHO_TO_CALL_WEIGHTS = { credit: 0.3, gong: 0.25, outlook: 0.1, fees: 0.2, offer: 0.15 } as const;
const W = COMMERCIAL_WHO_TO_CALL_WEIGHTS;
/** D&B risk index that scores 0, and the span above it that scores 1. */
const CREDIT_FLOOR = 20;
const CREDIT_SPAN = 40;
/** Fees in 30 days at which a spike counts, and the count that scores 1. */
const FEE_MIN = 3;
const FEE_FULL = 6;
const RISK_IDX = `0.5 * (100 - failure_risk_score__c) + 0.3 * (100 - paydex_score__c) + 0.2 * (100 - delinquency_predictor_score__c)`;

// d = weak D&B credit; g = souring calls; m = Moody's Negative / Watch; f = fee
// spikes; o = best business offer; ids = every client with any driver; b = the score.
const ctes = (accountFilter: string) => `
  WITH d AS (
    SELECT account_id__c AS acct, MAX(${RISK_IDX}) AS idx, MAX(supplier_risk_level__c) AS tier,
           MIN(paydex_score__c) AS paydex, MAX(average_days_beyond_terms__c) AS dbt
    FROM BT_DNB_Business_Credit__dlm
    WHERE profile_month__c = (SELECT MAX(profile_month__c) FROM BT_DNB_Business_Credit__dlm)
      AND (supplier_risk_level__c IN ('Severe', 'High') OR paydex_score__c < 60)
      AND failure_risk_score__c IS NOT NULL AND paydex_score__c IS NOT NULL
      AND account_id__c ${accountFilter}
    GROUP BY account_id__c
  ),
  g AS (
    SELECT account_id__c AS acct, MAX(overall_sentiment__c) AS sentiment, MAX(deal_risk_score__c) AS risk
    FROM BT_Gong_Call_Sentiment__dlm
    WHERE profile_week__c = (SELECT MAX(profile_week__c) FROM BT_Gong_Call_Sentiment__dlm)
      AND overall_sentiment__c IN ('Negative', 'Very Negative') AND sentiment_trend__c = 'Declining'
      AND account_id__c ${accountFilter}
    GROUP BY account_id__c
  ),
  m AS (
    SELECT account_id__c AS acct, MAX(rating_outlook__c) AS outlook, MAX(credit_rating__c) AS rating
    FROM BT_Moodys_Market_Context__dlm
    WHERE profile_date__c = (SELECT MAX(profile_date__c) FROM BT_Moodys_Market_Context__dlm)
      AND rating_outlook__c IN ('Negative', 'Watch')
      AND account_id__c ${accountFilter}
    GROUP BY account_id__c
  ),
  f AS (
    SELECT SFAccountID__c AS acct, COUNT(*) AS fees
    FROM ssot__FinancialAccountTransaction__dlm
    WHERE ssot__FinancialAccountTransactionType__c = 'Debit'
      AND ssot__Description__c IN ('NSF Returned Item Fee', 'Overdraft Fee', 'Late Payment Fee')
      AND ssot__TransactionDate__c >= current_date - INTERVAL '30' DAY
      AND SFAccountID__c ${accountFilter}
    GROUP BY SFAccountID__c
    HAVING COUNT(*) >= ${FEE_MIN} AND MAX(CASE WHEN ssot__Description__c <> 'Overdraft Fee' THEN 1 ELSE 0 END) = 1
  ),
  o AS (
    SELECT acct, code, conv FROM (
      SELECT acct, code, conv, ROW_NUMBER() OVER (PARTITION BY acct ORDER BY action_rank, ev DESC) AS rn FROM (
        SELECT a.ssot__Id__c AS acct, o.Action_Code__c AS code, o.Conversion_Probability__c AS conv,
               o.Recommended_Action_Rank__c AS action_rank, o.Expected_Value_Uplift__c AS ev
        FROM Offer_Eligibility_Model__dlm o
        JOIN ssot__Account__dlm a ON a.External_ID_c__c = o.MDM_ID__c
        WHERE o.Action_Code__c LIKE 'BIZ-%'
          AND o.Recommended_Action_Rank__c IS NOT NULL AND o.Expected_Value_Uplift__c > 0
          AND a.ssot__Id__c ${accountFilter}
        UNION ALL
        -- Business accounts: treasury + lending scores from Snowflake (keyed to the Account Id).
        SELECT b.account_id__c, b.action_code__c, b.conversion_probability__c,
               b.recommended_action_rank__c, b.expected_value_uplift__c
        FROM BT_Offer_Eligibility__dlm b
        WHERE b.recommended_action_rank__c IS NOT NULL AND b.expected_value_uplift__c > 0
          AND b.account_id__c ${accountFilter}
      ) u
    ) t WHERE rn = 1
  ),
  ids AS (
    SELECT DISTINCT acct FROM (
      SELECT acct FROM d UNION ALL SELECT acct FROM g UNION ALL SELECT acct FROM m
      UNION ALL SELECT acct FROM f UNION ALL SELECT acct FROM o
    ) u
  ),
  b AS (
    SELECT ids.acct AS account_id, d.idx AS credit_idx, d.tier AS tier, d.paydex AS paydex, d.dbt AS days_beyond,
           g.sentiment AS sentiment, g.risk AS deal_risk, m.outlook AS outlook, m.rating AS rating,
           f.fees AS fees, o.code AS offer_code, o.conv AS conv,
           ${W.credit} * COALESCE(CASE WHEN d.idx >= ${CREDIT_FLOOR + CREDIT_SPAN} THEN 1 WHEN d.idx <= ${CREDIT_FLOOR} THEN 0
                                       ELSE (d.idx - ${CREDIT_FLOOR}) / ${CREDIT_SPAN}.0 END, 0)
         + ${W.gong} * COALESCE(g.risk / 100.0, 0)
         + ${W.outlook} * COALESCE(CASE WHEN m.outlook = 'Watch' THEN 1 WHEN m.outlook = 'Negative' THEN 0.6 END, 0)
         + ${W.fees} * COALESCE(CASE WHEN f.fees >= ${FEE_FULL} THEN 1 ELSE f.fees / ${FEE_FULL}.0 END, 0)
         + ${W.offer} * COALESCE(CASE WHEN o.conv >= 50 THEN 1 ELSE o.conv / 50.0 END, 0) AS score
    FROM ids
    LEFT JOIN d ON d.acct = ids.acct
    LEFT JOIN g ON g.acct = ids.acct
    LEFT JOIN m ON m.acct = ids.acct
    LEFT JOIN f ON f.acct = ids.acct
    LEFT JOIN o ON o.acct = ids.acct
  )`;

/** The blended-score CTEs (ending in `b`: account_id, score), so a single-driver
 *  feed can rank by the same score and its top rows match this list for the dedupe. */
export const commercialWhoToCallScoreCtes = ctes;

const rowsSql = (accountFilter: string) => `${ctes(accountFilter)}
  SELECT * FROM b ORDER BY score DESC LIMIT 8
`;

const summarySql = (accountFilter: string) => `${ctes(accountFilter)}
  SELECT COUNT(*) AS clients,
         SUM(CASE WHEN (CASE WHEN credit_idx IS NOT NULL THEN 1 ELSE 0 END) + (CASE WHEN deal_risk IS NOT NULL THEN 1 ELSE 0 END)
                     + (CASE WHEN outlook IS NOT NULL THEN 1 ELSE 0 END) + (CASE WHEN fees IS NOT NULL THEN 1 ELSE 0 END) >= 2
                  THEN 1 ELSE 0 END) AS multi
  FROM b
`;

export type CommercialWhoToCallDriver = 'credit' | 'gong' | 'outlook' | 'fees' | 'offer';

export interface CommercialWhoToCallRow {
  accountId: string;
  /** Blended 0–1. */
  score: number;
  /** D&B risk index (higher = riskier), failure tier, PAYDEX and days beyond terms. */
  creditIdx: number | null;
  tier: string | null;
  paydex: number | null;
  daysBeyond: number | null;
  sentiment: string | null;
  dealRisk: number | null;
  /** Moody's outlook (Negative / Watch) and rating. */
  outlook: string | null;
  rating: string | null;
  /** NSF / overdraft / late fees in 30 days. */
  fees: number | null;
  offerCode: string | null;
  conversionPct: number | null;
  /** Each present driver's weighted contribution, strongest first. */
  drivers: { driver: CommercialWhoToCallDriver; points: number }[];
}

export interface CommercialWhoToCallResult {
  /** Highest blended score first. */
  rows: CommercialWhoToCallRow[];
  /** Clients with any driver, and with two or more risk drivers. */
  clients: number;
  multiSignal: number;
  scope: BookScope;
}

const n = (v: unknown) => (v == null || v === '' ? null : Number(v));
const str = (v: unknown) => (v == null || v === '' ? null : String(v));

/** C10 — the book's blended Who-to-Call list. */
export async function fetchCommercialWhoToCall(ownerId: string | null | undefined): Promise<CommercialWhoToCallResult> {
  const res = await queryDataCloudForBook<Record<string, unknown>>(rowsSql, ownerId, 8);
  const total = await queryDataCloud<Record<string, unknown>>(summarySql(res.accountFilter), 1)
    .then(r => r.rows[0] ?? {})
    .catch((): Record<string, unknown> => ({}));
  return {
    scope: res.scope,
    clients: Number(total.clients) || res.rows.length,
    multiSignal: Number(total.multi) || 0,
    rows: res.rows.map(r => {
      const creditIdx = n(r.credit_idx);
      const dealRisk = n(r.deal_risk);
      const outlook = str(r.outlook);
      const fees = n(r.fees);
      const conversionPct = n(r.conv);
      const drivers: CommercialWhoToCallRow['drivers'] = [];
      if (creditIdx != null) drivers.push({ driver: 'credit', points: W.credit * Math.min(1, Math.max(0, (creditIdx - CREDIT_FLOOR) / CREDIT_SPAN)) });
      if (dealRisk != null) drivers.push({ driver: 'gong', points: W.gong * dealRisk / 100 });
      if (outlook != null) drivers.push({ driver: 'outlook', points: W.outlook * (outlook === 'Watch' ? 1 : 0.6) });
      if (fees != null) drivers.push({ driver: 'fees', points: W.fees * Math.min(1, fees / FEE_FULL) });
      if (conversionPct != null) drivers.push({ driver: 'offer', points: W.offer * Math.min(1, conversionPct / 50) });
      drivers.sort((a, b) => b.points - a.points);
      return {
        accountId: String(r.account_id ?? ''),
        score: Number(r.score) || 0,
        creditIdx,
        tier: str(r.tier),
        paydex: n(r.paydex),
        daysBeyond: n(r.days_beyond),
        sentiment: str(r.sentiment),
        dealRisk,
        outlook,
        rating: str(r.rating),
        fees,
        offerCode: str(r.offer_code),
        conversionPct,
        drivers,
      };
    }),
  };
}

/** Short tag labels for the card's driver tags. */
const DRIVER_TAG: Record<CommercialWhoToCallDriver, string> = {
  credit: 'Credit', gong: 'Gong', outlook: 'Outlook', fees: 'Fees', offer: 'Offer',
};

const DRIVER_LABEL: Record<CommercialWhoToCallDriver, string> = {
  credit: 'D&B credit', gong: 'Gong', outlook: "Moody's", fees: 'Fee spikes', offer: 'Offer model',
};

const DRIVER_ACTION: Record<CommercialWhoToCallDriver, (r: CommercialWhoToCallRow) => string> = {
  credit: () => 'Credit / covenant review',
  gong: () => 'Relationship save call',
  outlook: () => 'Rating-outlook review — exposure, covenants',
  fees: () => 'Cash-flow check-in — line of credit, overdraft protection',
  offer: r => `Next-best offer — ${offerLabel(r.offerCode ?? '')}`,
};

/** One phrase per driver, strongest first: "PAYDEX 52 (Severe), 18 days beyond terms · Moody's Watch (Ba2) · 4 fees in 30 days". */
const commercialWhoToCallReason = (r: CommercialWhoToCallRow) =>
  r.drivers.map(({ driver }) => {
    if (driver === 'credit') return `PAYDEX ${Math.round(r.paydex ?? 0)}${r.tier ? ` (${r.tier} failure risk)` : ''}${r.daysBeyond ? `, ${Math.round(r.daysBeyond)} days beyond terms` : ''}`;
    if (driver === 'gong') return `${r.sentiment} & declining calls (risk ${Math.round(r.dealRisk ?? 0)})`;
    if (driver === 'outlook') return `Moody's ${r.outlook}${r.rating ? ` (${r.rating})` : ''}`;
    if (driver === 'fees') return `${r.fees} NSF / late fees in 30 days`;
    return `${Math.round(r.conversionPct ?? 0)}% likely: ${offerLabel(r.offerCode ?? '')}`;
  }).join(' · ');

const RISK: readonly CommercialWhoToCallDriver[] = ['credit', 'gong', 'outlook', 'fees'];

/** Two+ risk drivers, Severe tier / PAYDEX < 60, or Very Negative calls → high; any risk → medium; offer only → low. */
function commercialWhoToCallSeverity(r: CommercialWhoToCallRow): QueueSeverity {
  const risks = r.drivers.filter(d => RISK.includes(d.driver)).length;
  if (risks >= 2 || r.tier === 'Severe' || (r.paydex != null && r.paydex < 60) || r.sentiment === 'Very Negative') return 'high';
  return risks ? 'medium' : 'low';
}

/** C10 blended rows → the Who-to-Call list (and the Priority Queue's primary feed). */
export function commercialWhoToCallItems(
  res: CommercialWhoToCallResult,
  nameById: Record<string, string>,
): QueueSignalItem[] {
  return res.rows.map((r, i) => {
    const severity = commercialWhoToCallSeverity(r);
    const top = r.drivers[0]?.driver ?? 'credit';
    return {
      id: `c${i}`,
      clientId: r.accountId,
      clientName: nameById[r.accountId] || r.accountId,
      segment: r.rating ? `Moody's ${r.rating}` : 'Commercial',
      reason: commercialWhoToCallReason(r),
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
