/**
 * W9 — Wealth's blended Who-to-Call score, the R7 pattern for a private-wealth
 * book: one per-client score from five Data Cloud drivers, replacing the
 * held-away-only call list. Each driver is normalized to 0–1 and weighted:
 *
 *   · Held away (20%) — W1 Plaid brokerage / robo balance this month; $2M+ → 1.
 *   · Outflow (15%)   — money still moving to those accounts this month; $5K+/mo → 1.
 *   · Plan (25%)      — W2 MoneyGuidePro success below 70%; 40% → 1.
 *   · Gong (25%)      — S1 negative + declining call sentiment this week, by deal risk.
 *   · Concentration (15%) — W8 largest single stock at 20%+ of holdings; 35% → 1.
 *
 * Held-away balance is the opportunity (consolidation); the rest are risks. Every
 * row names its drivers, and the action follows the strongest one.
 *
 * Concentrated clients are usually single-driver and rank ~800th, so the book's
 * most concentrated client takes the eighth slot when the score leaves them out.
 */
import { queryDataCloud, queryDataCloudForBook, type BookScope } from './dataCloudClient';
import type { QueueSeverity, QueueSignalItem } from './priorityQueue';

/** Driver weights — they sum to 1, so the score is 0–1. */
export const WEALTH_WHO_TO_CALL_WEIGHTS = { held: 0.2, outflow: 0.15, plan: 0.25, gong: 0.25, conc: 0.15 } as const;
const W = WEALTH_WHO_TO_CALL_WEIGHTS;
/** Held-away balance that scores 1, and monthly outflow that scores 1. */
const HELD_FULL = 2_000_000;
const FLOW_FULL = 5000;
/** Plan success below this counts; this many points below it scores 1. */
const PLAN_AT_RISK = 70;
const PLAN_SPAN = 30;
/** Single-stock weight at which concentration counts, and the weight that scores 1. */
const CONC_MIN = 0.2;
const CONC_FULL = 0.35;
const FUNDS = "('SPY', 'QQQ', 'VTI', 'VXUS', 'AGG', 'BND', 'HYG', 'LQD', 'TIP', 'MUB', 'VNQ', 'GLD', 'SPAXX', 'VMFXX')";

// h = held-away brokerage / robo; p = plan at risk; g = souring calls; k = largest
// single stock (pos/tot/big as W8); ids = every client with any driver; b = the score.
const ctes = (accountFilter: string) => `
  WITH ha AS (
    SELECT account_id__c AS acct, institution_name__c AS inst, balance_usd__c AS bal, monthly_net_flow_usd__c AS flow,
           ROW_NUMBER() OVER (PARTITION BY account_id__c ORDER BY balance_usd__c DESC) AS rn
    FROM BT_Plaid_Held_Away__dlm
    WHERE profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Plaid_Held_Away__dlm)
      AND is_active__c = true AND balance_usd__c > 0 AND institution_type__c IN ('Brokerage', 'Robo-Advisor')
      AND account_id__c ${accountFilter}
  ),
  h AS (
    SELECT acct, SUM(bal) AS bal, SUM(flow) AS flow, COUNT(*) AS accts, MAX(CASE WHEN rn = 1 THEN inst END) AS inst
    FROM ha GROUP BY acct
  ),
  p AS (
    SELECT account_id__c AS acct, MIN(monte_carlo_success_pct__c) AS success, MAX(total_goal_amount_usd__c) AS goal
    FROM BT_MoneyGuidePro_Financial_Plans__dlm
    WHERE profile_month__c = (SELECT MAX(profile_month__c) FROM BT_MoneyGuidePro_Financial_Plans__dlm)
      AND plan_status__c IN ('Active', 'Stale') AND monte_carlo_success_pct__c < ${PLAN_AT_RISK}
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
  pos AS (
    SELECT ssot__AccountId__c AS acct, ssot__FinancialSecurityId__c AS t, SUM(ssot__MarketValueAmount__c) AS mv
    FROM ssot__FinancialHolding__dlm
    WHERE ssot__DataSourceObjectId__c = 'FinServ__FinancialHolding__c' AND ssot__AccountId__c ${accountFilter}
    GROUP BY ssot__AccountId__c, ssot__FinancialSecurityId__c
  ),
  tot AS (SELECT acct, SUM(mv) AS tot FROM pos GROUP BY acct),
  big AS (
    SELECT acct, t, mv, ROW_NUMBER() OVER (PARTITION BY acct ORDER BY mv DESC) AS rn
    FROM pos WHERE t NOT IN ${FUNDS}
  ),
  k AS (
    SELECT big.acct AS acct, big.t AS ticker, big.mv / tot.tot AS w
    FROM big JOIN tot ON tot.acct = big.acct
    WHERE big.rn = 1 AND tot.tot > 0 AND big.mv / tot.tot >= ${CONC_MIN}
  ),
  ids AS (
    SELECT DISTINCT acct FROM (
      SELECT acct FROM h UNION ALL SELECT acct FROM p UNION ALL SELECT acct FROM g UNION ALL SELECT acct FROM k
    ) u
  ),
  b AS (
    SELECT ids.acct AS account_id, h.bal AS held, h.flow AS flow, h.accts AS held_accts, h.inst AS inst,
           p.success AS success, p.goal AS goal, g.sentiment AS sentiment, g.risk AS deal_risk,
           k.ticker AS ticker, k.w AS conc,
           ${W.held} * COALESCE(CASE WHEN h.bal >= ${HELD_FULL} THEN 1 ELSE h.bal / ${HELD_FULL}.0 END, 0)
         + ${W.outflow} * COALESCE(CASE WHEN h.flow >= ${FLOW_FULL} THEN 1 WHEN h.flow > 0 THEN h.flow / ${FLOW_FULL}.0 ELSE 0 END, 0)
         + ${W.plan} * COALESCE(CASE WHEN p.success <= ${PLAN_AT_RISK - PLAN_SPAN} THEN 1 ELSE (${PLAN_AT_RISK} - p.success) / ${PLAN_SPAN}.0 END, 0)
         + ${W.gong} * COALESCE(g.risk / 100.0, 0)
         + ${W.conc} * COALESCE(CASE WHEN k.w >= ${CONC_FULL} THEN 1 ELSE k.w / ${CONC_FULL} END, 0) AS score
    FROM ids
    LEFT JOIN h ON h.acct = ids.acct
    LEFT JOIN p ON p.acct = ids.acct
    LEFT JOIN g ON g.acct = ids.acct
    LEFT JOIN k ON k.acct = ids.acct
  )`;

// rk = rank by score; crk = rank by concentration among concentrated clients. The
// top 8 plus the book's most concentrated client (a ninth row when it ranks lower).
/** The blended-score CTEs (ending in `b`: account_id, score), so a single-driver
 *  feed can rank by the same score and its top rows match this list for the dedupe. */
export const wealthWhoToCallScoreCtes = ctes;

const rowsSql = (accountFilter: string) => `${ctes(accountFilter)},
  r AS (
    SELECT b.*, ROW_NUMBER() OVER (ORDER BY score DESC) AS rk,
           ROW_NUMBER() OVER (PARTITION BY CASE WHEN conc IS NULL THEN 0 ELSE 1 END ORDER BY conc DESC) AS crk
    FROM b
  )
  SELECT * FROM r WHERE rk <= 8 OR (conc IS NOT NULL AND crk = 1) ORDER BY rk LIMIT 9
`;

const summarySql = (accountFilter: string) => `${ctes(accountFilter)}
  SELECT COUNT(*) AS clients,
         SUM(CASE WHEN (CASE WHEN flow > 0 THEN 1 ELSE 0 END) + (CASE WHEN success IS NOT NULL THEN 1 ELSE 0 END)
                     + (CASE WHEN deal_risk IS NOT NULL THEN 1 ELSE 0 END) + (CASE WHEN conc IS NOT NULL THEN 1 ELSE 0 END) >= 2
                  THEN 1 ELSE 0 END) AS multi
  FROM b
`;

export type WealthWhoToCallDriver = 'held' | 'outflow' | 'plan' | 'gong' | 'conc';

export interface WealthWhoToCallRow {
  accountId: string;
  /** Blended 0–1. */
  score: number;
  /** Held-away brokerage / robo balance, monthly net flow to it, accounts, and the largest institution. */
  heldAway: number | null;
  monthlyFlow: number | null;
  heldAccounts: number;
  institution: string;
  /** Lowest active plan's Monte Carlo success %, and its goal. */
  planSuccess: number | null;
  goalUsd: number | null;
  sentiment: string | null;
  dealRisk: number | null;
  /** Largest single stock and its share of holdings (0–1). */
  ticker: string | null;
  concentration: number | null;
  /** Each present driver's weighted contribution, strongest first. */
  drivers: { driver: WealthWhoToCallDriver; points: number }[];
}

export interface WealthWhoToCallResult {
  /** Highest blended score first. */
  rows: WealthWhoToCallRow[];
  /** Clients with any driver, and with two or more risk drivers (outflow, plan, Gong, concentration). */
  clients: number;
  multiSignal: number;
  scope: BookScope;
}

const n = (v: unknown) => (v == null || v === '' ? null : Number(v));
const decode = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** W9 — the book's blended Who-to-Call list. */
export async function fetchWealthWhoToCall(ownerId: string | null | undefined): Promise<WealthWhoToCallResult> {
  const res = await queryDataCloudForBook<Record<string, unknown>>(rowsSql, ownerId, 9);
  // Reserve the last slot for the most concentrated client when the score alone leaves them out.
  const raw = res.rows.length > 8 ? [...res.rows.slice(0, 7), res.rows[8]] : res.rows;
  const total = await queryDataCloud<Record<string, unknown>>(summarySql(res.accountFilter), 1)
    .then(r => r.rows[0] ?? {})
    .catch((): Record<string, unknown> => ({}));
  return {
    scope: res.scope,
    clients: Number(total.clients) || res.rows.length,
    multiSignal: Number(total.multi) || 0,
    rows: raw.map(r => {
      const heldAway = n(r.held);
      const monthlyFlow = n(r.flow);
      const planSuccess = n(r.success);
      const dealRisk = n(r.deal_risk);
      const concentration = n(r.conc);
      const drivers: WealthWhoToCallRow['drivers'] = [];
      if (heldAway != null) drivers.push({ driver: 'held', points: W.held * Math.min(1, heldAway / HELD_FULL) });
      if (monthlyFlow != null && monthlyFlow > 0) drivers.push({ driver: 'outflow', points: W.outflow * Math.min(1, monthlyFlow / FLOW_FULL) });
      if (planSuccess != null) drivers.push({ driver: 'plan', points: W.plan * Math.min(1, (PLAN_AT_RISK - planSuccess) / PLAN_SPAN) });
      if (dealRisk != null) drivers.push({ driver: 'gong', points: W.gong * dealRisk / 100 });
      if (concentration != null) drivers.push({ driver: 'conc', points: W.conc * Math.min(1, concentration / CONC_FULL) });
      drivers.sort((a, b) => b.points - a.points);
      return {
        accountId: String(r.account_id ?? ''),
        score: Number(r.score) || 0,
        heldAway,
        monthlyFlow,
        heldAccounts: Number(r.held_accts) || 0,
        institution: decode(String(r.inst ?? '')),
        planSuccess,
        goalUsd: n(r.goal),
        sentiment: r.sentiment == null ? null : String(r.sentiment),
        dealRisk,
        ticker: r.ticker == null ? null : String(r.ticker),
        concentration,
        drivers,
      };
    }),
  };
}

const money = (v: number) =>
  v.toLocaleString('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 });

/** Short tag labels for the card's driver tags. */
const DRIVER_TAG: Record<WealthWhoToCallDriver, string> = {
  held: 'Held away', outflow: 'Outflow', plan: 'Plan', gong: 'Gong', conc: 'Concentration',
};

const DRIVER_LABEL: Record<WealthWhoToCallDriver, string> = {
  held: 'Plaid held-away', outflow: 'Plaid flows', plan: 'MoneyGuidePro', gong: 'Gong', conc: 'Holdings',
};

const DRIVER_ACTION: Record<WealthWhoToCallDriver, (r: WealthWhoToCallRow) => string> = {
  held: () => 'Held-away consolidation review',
  outflow: () => 'Held-away consolidation review',
  plan: () => 'Plan review — goals, savings rate, allocation',
  gong: () => 'Relationship save call',
  conc: r => `Diversification review${r.ticker ? ` — ${r.ticker}` : ''}`,
};

/** One phrase per driver, strongest first: "$1.2M held away at Vanguard · $3.1K/mo still flowing out · plan 48% likely". */
const wealthWhoToCallReason = (r: WealthWhoToCallRow) =>
  r.drivers.map(({ driver }) => {
    if (driver === 'held') return `${money(r.heldAway ?? 0)} held away${r.institution ? ` at ${r.institution}` : ''}${r.heldAccounts > 1 ? ` (+${r.heldAccounts - 1} more)` : ''}`;
    if (driver === 'outflow') return `${money(r.monthlyFlow ?? 0)}/mo still flowing out`;
    if (driver === 'plan') return `plan ${Math.round(r.planSuccess ?? 0)}% likely to succeed`;
    if (driver === 'gong') return `${r.sentiment} & declining calls (risk ${Math.round(r.dealRisk ?? 0)})`;
    return `${r.ticker} is ${Math.round((r.concentration ?? 0) * 100)}% of holdings`;
  }).join(' · ');

const RISK: readonly WealthWhoToCallDriver[] = ['outflow', 'plan', 'gong', 'conc'];

/** Two+ risk drivers, a plan under 50%, or Very Negative calls → high; any risk → medium; held away only → low. */
function wealthWhoToCallSeverity(r: WealthWhoToCallRow): QueueSeverity {
  const risks = r.drivers.filter(d => RISK.includes(d.driver)).length;
  if (risks >= 2 || (r.planSuccess != null && r.planSuccess < 50) || r.sentiment === 'Very Negative') return 'high';
  return risks ? 'medium' : 'low';
}

/** W9 blended rows → the Who-to-Call list (and the Priority Queue's primary feed). */
export function wealthWhoToCallItems(
  res: WealthWhoToCallResult,
  nameById: Record<string, string>,
  opts: { segment: string },
): QueueSignalItem[] {
  return res.rows.map((r, i) => {
    const severity = wealthWhoToCallSeverity(r);
    const top = r.drivers[0]?.driver ?? 'held';
    return {
      id: `c${i}`,
      clientId: r.accountId,
      clientName: nameById[r.accountId] || r.accountId,
      segment: opts.segment,
      reason: wealthWhoToCallReason(r),
      action: DRIVER_ACTION[top](r),
      score: r.score,
      severity,
      source: `Blended · ${r.drivers.map(d => DRIVER_LABEL[d.driver]).join(' + ')}${res.scope === 'org' ? ' · org-wide' : ''}`,
      relationshipValue: r.heldAway ?? 0,
      drivers: r.drivers.map(d => ({ label: DRIVER_TAG[d.driver], points: d.points, tone: d.driver === 'held' ? 'opportunity' as const : 'risk' as const })),
      tier: severity === 'high' ? 'today' : severity === 'medium' ? 'week' : 'watch',
    };
  });
}
