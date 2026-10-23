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
import { queryDataCloud, queryDataCloudForBook, type BookScope } from './dataCloudClient';
import type { QueueSignalItem } from './priorityQueue';

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

// Unfiltered by persistence so a book with any High client never falls back org-wide.
// Persistent AND overdraft-corroborated first, then any overdraft client (so the
// five rows fill with fee evidence before fee-less persistence), then months High, then fee count.
const rowsSql = (accountFilter: string) => `${ctes(accountFilter)}
  SELECT st.acct AS account_id, st.months_high AS months_high, st.life_stage AS life_stage, st.prizm AS prizm,
         COALESCE(od.fees, 0) AS fees, COALESCE(od.fee_total, 0) AS fee_total
  FROM st LEFT JOIN od ON od.acct = st.acct
  WHERE st.now_high = 1
  ORDER BY CASE WHEN od.acct IS NULL THEN 0
                WHEN st.months_high >= ${PERSISTENT_MONTHS} THEN 2 ELSE 1 END DESC,
           st.months_high DESC, COALESCE(od.fees, 0) DESC
  LIMIT 5
`;

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
  /** High now, most persistent first. */
  rows: StressedClientRow[];
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

/** R3 — the book's clients under persistent financial stress. */
export async function fetchFinancialStress(ownerId: string | null | undefined): Promise<FinancialStressResult> {
  const res = await queryDataCloudForBook<Record<string, unknown>>(rowsSql, ownerId, 5);
  const [total, stages] = await Promise.all([
    queryDataCloud<Record<string, unknown>>(summarySql(res.accountFilter), 1)
      .then(r => r.rows[0] ?? {})
      .catch((): Record<string, unknown> => ({})),
    queryDataCloud<Record<string, unknown>>(lifeStageSql(res.accountFilter), 12)
      .then(r => r.rows)
      .catch((): Record<string, unknown>[] => []),
  ]);
  return {
    scope: res.scope,
    highNow: Number(total.high_now) || 0,
    persistent: Number(total.persistent) || 0,
    withFees: Number(total.with_fees) || 0,
    both: Number(total.both_) || 0,
    lifeStages: stages.map(r => ({ stage: String(r.life_stage ?? '') || 'Unknown', count: Number(r.n) || 0 })),
    rows: res.rows.map(r => ({
      accountId: String(r.account_id ?? ''),
      monthsHigh: Number(r.months_high) || 0,
      lifeStage: String(r.life_stage ?? ''),
      prizm: decode(String(r.prizm ?? '')),
      overdraftFees: Number(r.fees) || 0,
      overdraftUsd: Number(r.fee_total) || 0,
    })),
  };
}

/** Months High at which an overdraft-corroborated client still earns a check-in. */
const CORROBORATED_MONTHS = 3;

/** Persistent stress, or 3+ months High corroborated by overdraft fees — earns a hardship check-in. */
export const needsHardshipCheckIn = (r: StressedClientRow) =>
  r.monthsHigh >= PERSISTENT_MONTHS || (r.overdraftFees > 0 && r.monthsHigh >= CORROBORATED_MONTHS);

/** R3 check-in-worthy clients → queue: a hardship check-in. */
export function financialStressQueueItems(
  res: FinancialStressResult,
  nameById: Record<string, string>,
  opts: { segment: string; now?: Date },
): QueueSignalItem[] {
  const now = opts.now ?? new Date();
  const due = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 5).toISOString().slice(0, 10);
  const src = `Claritas stress${res.scope === 'org' ? ' · org-wide' : ''}`;
  return res.rows
    .filter(needsHardshipCheckIn)
    .slice(0, 5)
    .map((r, i) => ({
      id: `fs${i}`,
      clientId: r.accountId,
      clientName: nameById[r.accountId] || r.accountId,
      segment: opts.segment,
      reason: `High financial stress ${r.monthsHigh} of 6 months${r.overdraftFees ? ` · ${r.overdraftFees} overdraft fee${r.overdraftFees > 1 ? 's' : ''} in 30d` : ''}`,
      action: 'Hardship check-in — relief options, fee waiver',
      score: Math.min(0.85, 0.4 + r.monthsHigh * 0.06 + (r.overdraftFees ? 0.1 : 0)),
      severity: r.overdraftFees || r.monthsHigh >= 5 ? 'medium' : 'low',
      source: src,
      relationshipValue: 0,
      dueDate: due,
    }));
}
