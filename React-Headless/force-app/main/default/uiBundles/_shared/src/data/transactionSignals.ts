/**
 * Transaction-derived home-page moments, read from
 * `ssot__FinancialAccountTransaction__dlm` (Snowflake `Financial_Transactions_BT_Snow`,
 * keyed to FinServ financial accounts — see docs/SNOWFLAKE_DATA_FIXES.md §7).
 *
 *   · S5 (Retail / Wealth) — large inbound credits in the last 7 days: bonuses and
 *     tax refunds landing in checking = an idle-cash conversation while it's fresh.
 *   · C9 (Commercial)      — business fee spikes: 3+ NSF / overdraft / late fees in
 *     30 days = cash-flow stress worth a treasury / line-of-credit conversation.
 *
 * Both are book-scoped through `SFAccountID__c` (the Account key) and fall back to
 * org-wide like every other DC card. Queries + columns verified live 2026-10-22.
 */
import { queryDataCloudForBook, type BookScope } from './dataCloudClient';
import type { QueueSignalItem, QueueSeverity } from './priorityQueue';

const DAY = 86_400_000;

const largeInflowSql = (accountFilter: string) => `
  SELECT account_id, amount, description, tx_date FROM (
    SELECT t.SFAccountID__c AS account_id, t.ssot__TransactionAmount__c AS amount,
           t.ssot__Description__c AS description, t.ssot__TransactionDate__c AS tx_date,
           ROW_NUMBER() OVER (PARTITION BY t.SFAccountID__c ORDER BY t.ssot__TransactionAmount__c DESC) AS rn
    FROM ssot__FinancialAccountTransaction__dlm t
    WHERE t.ssot__FinancialAccountTransactionType__c = 'Credit'
      AND t.ssot__TransactionAmount__c >= 2000
      AND t.ssot__TransactionDate__c >= current_date - INTERVAL '7' DAY
      AND (t.ssot__Description__c LIKE '%Bonus%' OR t.ssot__Description__c LIKE '%BONUS%'
           OR t.ssot__Description__c LIKE '%TAX REF%')
      AND t.SFAccountID__c ${accountFilter}
  ) x
  WHERE rn = 1
  ORDER BY amount DESC
  LIMIT 8
`;

// 'Overdraft Fee' alone also hits personal checking (1–3 per account), so a spike
// must include at least one NSF / late fee — those only post on business accounts.
const feeSpikeSql = (accountFilter: string) => `
  SELECT SFAccountID__c AS account_id, COUNT(*) AS fees,
         SUM(ssot__TransactionAmount__c) AS fee_total, MAX(ssot__TransactionDate__c) AS last_fee
  FROM ssot__FinancialAccountTransaction__dlm
  WHERE ssot__FinancialAccountTransactionType__c = 'Debit'
    AND ssot__Description__c IN ('NSF Returned Item Fee', 'Overdraft Fee', 'Late Payment Fee')
    AND ssot__TransactionDate__c >= current_date - INTERVAL '30' DAY
    AND SFAccountID__c ${accountFilter}
  GROUP BY SFAccountID__c
  HAVING COUNT(*) >= 3 AND MAX(CASE WHEN ssot__Description__c <> 'Overdraft Fee' THEN 1 ELSE 0 END) = 1
  ORDER BY fees DESC, fee_total DESC
  LIMIT 8
`;

export interface LargeInflow { accountId: string; amount: number; kind: 'Bonus' | 'Tax refund'; date: string; }
export interface FeeSpike { accountId: string; fees: number; feeTotal: number; lastFee: string; }
export interface TxSignalResult<T> { rows: T[]; scope: BookScope; }

const isoDate = (v: unknown) => String(v ?? '').slice(0, 10);

/** S5 — each client's largest bonus / tax-refund credit in the last 7 days. */
export async function fetchLargeInflows(ownerId: string | null | undefined): Promise<TxSignalResult<LargeInflow>> {
  const res = await queryDataCloudForBook<Record<string, unknown>>(largeInflowSql, ownerId, 8);
  return {
    scope: res.scope,
    rows: res.rows.map(r => ({
      accountId: String(r.account_id ?? ''),
      // DC returns decimals as strings.
      amount: Number(r.amount) || 0,
      kind: /TAX REF/i.test(String(r.description ?? '')) ? 'Tax refund' : 'Bonus',
      date: isoDate(r.tx_date),
    })),
  };
}

/** C9 — business accounts with 3+ NSF / overdraft / late fees in 30 days. */
export async function fetchFeeSpikes(ownerId: string | null | undefined): Promise<TxSignalResult<FeeSpike>> {
  const res = await queryDataCloudForBook<Record<string, unknown>>(feeSpikeSql, ownerId, 8);
  return {
    scope: res.scope,
    rows: res.rows.map(r => ({
      accountId: String(r.account_id ?? ''),
      fees: Number(r.fees) || 0,
      feeTotal: Number(r.fee_total) || 0,
      lastFee: isoDate(r.last_fee),
    })),
  };
}

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 });

/** Due date = signal date + SLA days, never earlier than today. */
function dueFrom(iso: string, slaDays: number, now: Date): string {
  const base = iso ? new Date(iso + 'T00:00:00').getTime() : now.getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return new Date(Math.max(base + slaDays * DAY, today)).toISOString().slice(0, 10);
}

const sourceLabel = (scope: BookScope) => `Transactions${scope === 'org' ? ' · org-wide' : ''}`;

/** S5 rows → priority-queue items. The cash is freshest right after it lands, so
 *  each is due two days after the credit posted. */
export function inflowQueueItems(
  res: TxSignalResult<LargeInflow>,
  nameById: Record<string, string>,
  opts: { segment: string; action: string; now?: Date },
): QueueSignalItem[] {
  const now = opts.now ?? new Date();
  return res.rows.map((r, i) => {
    const severity: QueueSeverity = r.amount >= 20_000 ? 'high' : r.amount >= 7_500 ? 'medium' : 'low';
    return {
      id: `tx${i}`,
      clientId: r.accountId,
      clientName: nameById[r.accountId] || r.accountId,
      segment: opts.segment,
      reason: `${r.kind} deposit ${money(r.amount)} on ${r.date}`,
      action: opts.action,
      score: Math.min(0.95, 0.5 + r.amount / 100_000),
      severity,
      source: sourceLabel(res.scope),
      relationshipValue: r.amount,
      dueDate: dueFrom(r.date, 2, now),
    };
  });
}

/** C9 rows → priority-queue items, due today (fees compound daily). */
export function feeSpikeQueueItems(
  res: TxSignalResult<FeeSpike>,
  nameById: Record<string, string>,
  opts: { segment: string; now?: Date },
): QueueSignalItem[] {
  const now = opts.now ?? new Date();
  return res.rows.map((r, i) => ({
    id: `tx${i}`,
    clientId: r.accountId,
    clientName: nameById[r.accountId] || r.accountId,
    segment: opts.segment,
    reason: `${r.fees} NSF / overdraft / late fees in 30d (${money(r.feeTotal)})`,
    action: 'Cash-flow check-in — line of credit / sweep',
    score: Math.min(0.95, 0.55 + r.fees * 0.05),
    severity: r.fees >= 6 ? 'high' : 'medium',
    source: sourceLabel(res.scope),
    relationshipValue: 0,
    dueDate: dueFrom('', 0, now),
  }));
}
