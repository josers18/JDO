/**
 * R3 — financial-stress watchlist from Claritas (`BT_Claritas_Demographics__dlm`,
 * monthly by `profile_month__c`, six months of history). The month-to-month flag
 * churns heavily (of this month's High, most were Moderate/Low last month), so a
 * single month is noise: the watchlist is clients flagged High now AND in ≥ 4 of
 * the last six months ("persistent"). Corroborated with overdraft fees on
 * `ssot__FinancialAccountTransaction__dlm` over the last 30 days (the fee data's
 * full span). Framed as hardship support — a check-in, not a collections call.
 *
 * Verified live 2026-10-22: Sarah Smith 1,751 High now → 84 persistent, 41 with
 * overdraft fees, 3 both; Justin Chen 1,763 → 76 / 36 / 2.
 */
import { bookAccountFilter, queryDataCloud, type BookScope } from './dataCloudClient';
import type { QueueSignalItem } from './priorityQueue';
import { whoToCallScoreCtes } from './whoToCall';

/** Months flagged High (of the last six) at which stress counts as persistent. */
export const PERSISTENT_MONTHS = 4;

const LATEST = '(SELECT MAX(profile_month__c) FROM BT_Claritas_Demographics__dlm)';

// st = one row per client: months High, High this month, current life stage / PRIZM;
// od = overdraft fees per client over the last 30 days.
const ctes = (accountFilter: string) => `
  WITH st AS (
    SELECT account_id__c AS acct,
           SUM(CASE WHEN financial_stress_indicator__c = 'High' THEN 1 ELSE 0 END) AS months_high,
           MAX(CASE WHEN profile_month__c = ${LATEST} AND financial_stress_indicator__c = 'High' THEN 1 ELSE 0 END) AS now_high,
           MAX(CASE WHEN profile_month__c = ${LATEST} THEN life_stage__c END) AS life_stage,
           MAX(CASE WHEN profile_month__c = ${LATEST} THEN prizm_segment_name__c END) AS prizm
    FROM BT_Claritas_Demographics__dlm
    WHERE account_id__c ${accountFilter}
    GROUP BY account_id__c
  ),
  od AS (
    SELECT SFAccountID__c AS acct, COUNT(*) AS fees, SUM(ssot__TransactionAmount__c) AS fee_total
    FROM ssot__FinancialAccountTransaction__dlm
    WHERE ssot__Description__c = 'Overdraft Fee'
      AND ssot__TransactionDate__c >= current_date - INTERVAL '30' DAY
      AND SFAccountID__c ${accountFilter}
    GROUP BY SFAccountID__c
  )`;

// Book-only: another banker's stressed clients are no one to call, so an empty book stays empty.
// Card order: persistent AND overdraft-corroborated first, then any overdraft client (so
// the rows fill with fee evidence before fee-less persistence), then months High, then fees.
const ORDER = `CASE WHEN od.acct IS NULL THEN 0
                WHEN st.months_high >= ${PERSISTENT_MONTHS} THEN 2 ELSE 1 END DESC,
           st.months_high DESC, COALESCE(od.fees, 0) DESC`;
const COLS = `st.acct AS account_id, st.months_high AS months_high, st.life_stage AS life_stage, st.prizm AS prizm,
         COALESCE(od.fees, 0) AS fees, COALESCE(od.fee_total, 0) AS fee_total`;

const rowsSql = (accountFilter: string) => `${ctes(accountFilter)}
  SELECT ${COLS}
  FROM st LEFT JOIN od ON od.acct = st.acct
  WHERE st.now_high = 1
  ORDER BY ${ORDER}
  LIMIT ${STRESS_ROWS}
`;

// Queue order: the R7 blended score first, so the clients Who-to-Call already holds
// lead and drop out in the dedupe (STRESS_SPARE extra rows backfill them), then card order.
const queueRowsSql = (accountFilter: string) => `${whoToCallScoreCtes(accountFilter)},
  ${ctes(accountFilter).replace(/^\s*WITH /, '')}
  SELECT ${COLS}
  FROM st LEFT JOIN od ON od.acct = st.acct LEFT JOIN b ON b.account_id = st.acct
  WHERE st.now_high = 1
  ORDER BY COALESCE(b.score, 0) DESC, ${ORDER}
  LIMIT ${STRESS_ROWS + STRESS_SPARE}
`;

/** Stressed clients the card and queue show, and the extra rows fetched to backfill Who-to-Call overlaps. */
export const STRESS_ROWS = 5;
const STRESS_SPARE = 8;

const summarySql = (accountFilter: string) => `${ctes(accountFilter)}
  SELECT COUNT(*) AS high_now,
         SUM(CASE WHEN st.months_high >= ${PERSISTENT_MONTHS} THEN 1 ELSE 0 END) AS persistent,
         SUM(CASE WHEN od.acct IS NOT NULL THEN 1 ELSE 0 END) AS with_fees,
         SUM(CASE WHEN od.acct IS NOT NULL AND st.months_high >= ${PERSISTENT_MONTHS} THEN 1 ELSE 0 END) AS both_
  FROM st LEFT JOIN od ON od.acct = st.acct
  WHERE st.now_high = 1
`;

const lifeStageSql = (accountFilter: string) => `
  SELECT life_stage__c AS life_stage, COUNT(*) AS n
  FROM BT_Claritas_Demographics__dlm
  WHERE profile_month__c = ${LATEST} AND financial_stress_indicator__c = 'High'
    AND account_id__c ${accountFilter}
  GROUP BY life_stage__c
  ORDER BY n DESC
`;

export interface StressedClientRow {
  accountId: string;
  /** Months flagged High of the last six. */
  monthsHigh: number;
  lifeStage: string;
  prizm: string;
  /** Overdraft fees in the last 30 days. */
  overdraftFees: number;
  overdraftUsd: number;
  clientName?: string;
}

export interface FinancialStressResult {
  /** High now, most persistent first — the card's watchlist. */
  rows: StressedClientRow[];
  /** High now, highest R7 score first (STRESS_ROWS + spares) — the queue's feed, deduped against Who-to-Call. */
  queueRows: StressedClientRow[];
  highNow: number;
  persistent: number;
  /** High now with an overdraft fee in the last 30 days. */
  withFees: number;
  /** Persistent AND fee-corroborated — the strongest hardship signal. */
  both: number;
  lifeStages: { stage: string; count: number }[];
  scope: BookScope;
}

const decode = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

const toRow = (r: Record<string, unknown>): StressedClientRow => ({
  accountId: String(r.account_id ?? ''),
  monthsHigh: Number(r.months_high) || 0,
  lifeStage: String(r.life_stage ?? ''),
  prizm: decode(String(r.prizm ?? '')),
  overdraftFees: Number(r.fees) || 0,
  overdraftUsd: Number(r.fee_total) || 0,
});

/** R3 — the book's clients under persistent financial stress (book-only, never org-wide). */
export async function fetchFinancialStress(ownerId: string | null | undefined): Promise<FinancialStressResult> {
  const { accountFilter, scope } = bookAccountFilter(ownerId);
  const [card, queue, total, stages] = await Promise.all([
    queryDataCloud<Record<string, unknown>>(rowsSql(accountFilter), STRESS_ROWS).then(r => r.rows),
    queryDataCloud<Record<string, unknown>>(queueRowsSql(accountFilter), STRESS_ROWS + STRESS_SPARE).then(r => r.rows),
    queryDataCloud<Record<string, unknown>>(summarySql(accountFilter), 1)
      .then(r => r.rows[0] ?? {})
      .catch((): Record<string, unknown> => ({})),
    queryDataCloud<Record<string, unknown>>(lifeStageSql(accountFilter), 12)
      .then(r => r.rows)
      .catch((): Record<string, unknown>[] => []),
  ]);
  return {
    scope,
    highNow: Number(total.high_now) || 0,
    persistent: Number(total.persistent) || 0,
    withFees: Number(total.with_fees) || 0,
    both: Number(total.both_) || 0,
    lifeStages: stages.map(r => ({ stage: String(r.life_stage ?? '') || 'Unknown', count: Number(r.n) || 0 })),
    rows: card.map(toRow),
    queueRows: queue.map(toRow),
  };
}

/** Months High at which an overdraft-corroborated client still earns a check-in. */
const CORROBORATED_MONTHS = 3;

/** The hardship check-in — queue action and the Task subject the card prefills. */
export const HARDSHIP_CHECK_IN = 'Hardship check-in — relief options, fee waiver';

/** Hardship check-ins are due in 5 days — the queue item and the card's Task prefill. */
export const hardshipCheckInDue = (now = new Date()) =>
  new Date(now.getFullYear(), now.getMonth(), now.getDate() + 5).toISOString().slice(0, 10);

/** Why the client needs a check-in — the queue reason and the card's Task comments. */
export const hardshipCheckInReason = (r: StressedClientRow) =>
  `High financial stress ${r.monthsHigh} of 6 months${r.overdraftFees ? ` · ${r.overdraftFees} overdraft fee${r.overdraftFees > 1 ? 's' : ''} in 30d` : ''}`;

/** Overdraft fees or 5+ months High → medium; the queue severity behind the Task priority. */
export const hardshipCheckInSeverity = (r: StressedClientRow): 'medium' | 'low' =>
  r.overdraftFees || r.monthsHigh >= 5 ? 'medium' : 'low';

/** Task priority for the card's prefill: medium → High, low → Normal. */
export const hardshipCheckInPriority = (r: StressedClientRow) =>
  hardshipCheckInSeverity(r) === 'medium' ? 'High' as const : 'Normal' as const;

/** Persistent stress, or 3+ months High corroborated by overdraft fees — earns a hardship check-in. */
export const needsHardshipCheckIn = (r: StressedClientRow) =>
  r.monthsHigh >= PERSISTENT_MONTHS || (r.overdraftFees > 0 && r.monthsHigh >= CORROBORATED_MONTHS);

/** R3 check-in-worthy clients → queue: a hardship check-in. */
export function financialStressQueueItems(
  res: FinancialStressResult,
  nameById: Record<string, string>,
  opts: { segment: string; now?: Date },
): QueueSignalItem[] {
  const due = hardshipCheckInDue(opts.now);
  const src = `Claritas stress${res.scope === 'org' ? ' · org-wide' : ''}`;
  // Uncapped: the caller drops Who-to-Call overlaps, then keeps STRESS_ROWS.
  return res.queueRows
    .filter(needsHardshipCheckIn)
    .map((r, i) => ({
      id: `fs${i}`,
      clientId: r.accountId,
      clientName: nameById[r.accountId] || r.accountId,
      segment: opts.segment,
      reason: hardshipCheckInReason(r),
      action: HARDSHIP_CHECK_IN,
      score: Math.min(0.85, 0.4 + r.monthsHigh * 0.06 + (r.overdraftFees ? 0.1 : 0)),
      severity: hardshipCheckInSeverity(r),
      source: src,
      relationshipValue: 0,
      dueDate: due,
    }));
}
