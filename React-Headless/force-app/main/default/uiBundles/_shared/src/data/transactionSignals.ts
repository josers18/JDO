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
 *
 * Also hosts S1 (all three apps), the Gong call-sentiment feed, because it plugs
 * into the queue and alerts the same way (see the bottom of this file).
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

/* ── S1: Gong call sentiment (BT_Gong_Call_Sentiment__dlm) ───────────────────
   Weekly snapshot, one row per account per `profile_week__c` — pin to the latest
   week. Negative / Very Negative AND Declining = the relationship is souring on
   recorded calls, a "who to call" signal independent of CSAT. Verified live
   2026-10-22 (week 2026-10-19: 282 org-wide; 14–80 per banker book). */
const callSentimentSql = (accountFilter: string) => `
  SELECT g.account_id__c AS account_id, g.overall_sentiment__c AS sentiment,
         g.deal_risk_score__c AS deal_risk, g.next_scheduled_call_date__c AS next_call,
         g.rm_last_logged_note_date__c AS last_note, g.key_topics_flags__c AS topics
  FROM BT_Gong_Call_Sentiment__dlm g
  WHERE g.profile_week__c = (SELECT MAX(profile_week__c) FROM BT_Gong_Call_Sentiment__dlm)
    AND g.overall_sentiment__c IN ('Negative', 'Very Negative')
    AND g.sentiment_trend__c = 'Declining'
    AND g.account_id__c ${accountFilter}
  ORDER BY g.deal_risk_score__c DESC
  LIMIT 8
`;

export interface CallSentiment {
  accountId: string;
  sentiment: 'Negative' | 'Very Negative';
  dealRisk: number;
  /** YYYY-MM-DD or '' when no call is booked. */
  nextCall: string;
  /** YYYY-MM-DD or '' when the RM has never logged a note. */
  lastNote: string;
  topics: string[];
}

/** S1 — book clients whose call sentiment is negative and declining this week. */
export async function fetchCallSentiment(ownerId: string | null | undefined): Promise<TxSignalResult<CallSentiment>> {
  const res = await queryDataCloudForBook<Record<string, unknown>>(callSentimentSql, ownerId, 8);
  return {
    scope: res.scope,
    rows: res.rows.map(r => ({
      accountId: String(r.account_id ?? ''),
      sentiment: r.sentiment === 'Very Negative' ? 'Very Negative' : 'Negative',
      dealRisk: Number(r.deal_risk) || 0,
      nextCall: isoDate(r.next_call),
      lastNote: isoDate(r.last_note),
      topics: String(r.topics ?? '').split('|').map(t => t.trim()).filter(Boolean),
    })),
  };
}

const daysBetween = (fromIso: string, to: Date) =>
  Math.round((new Date(fromIso + 'T00:00:00').getTime() - new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime()) / DAY);

/** S1 rows → priority-queue items. Very Negative or deal risk ≥ 75 is due today;
 *  the rest within two days. A call booked in the next 14 days with notes older
 *  than 21 days (or none) gets the "call coming up, notes stale" prep flag. */
export function callSentimentQueueItems(
  res: TxSignalResult<CallSentiment>,
  nameById: Record<string, string>,
  opts: { segment: string; now?: Date },
): QueueSignalItem[] {
  const now = opts.now ?? new Date();
  return res.rows.map((r, i) => {
    const severity: QueueSeverity = r.sentiment === 'Very Negative' || r.dealRisk >= 75 ? 'high' : 'medium';
    const callIn = r.nextCall ? daysBetween(r.nextCall, now) : NaN;
    const notesStale = !r.lastNote || daysBetween(r.lastNote, now) < -21;
    const prep = callIn >= 0 && callIn <= 14 && notesStale;
    const parts = [`${r.sentiment} & declining on calls`, `deal risk ${Math.round(r.dealRisk)}`];
    if (r.topics.length) parts.push(r.topics.join(', '));
    if (prep) parts.push(`call in ${callIn}d, notes stale`);
    return {
      id: `gs${i}`,
      clientId: r.accountId,
      clientName: nameById[r.accountId] || r.accountId,
      segment: opts.segment,
      reason: parts.join(' · '),
      action: prep ? 'Prep for upcoming call — log notes' : 'Relationship save call',
      score: Math.min(0.97, 0.5 + r.dealRisk / 200 + (prep ? 0.05 : 0)),
      severity,
      source: `Gong call sentiment${res.scope === 'org' ? ' · org-wide' : ''}`,
      relationshipValue: 0,
      dueDate: prep ? dueFrom(r.nextCall, -1, now) : dueFrom('', severity === 'high' ? 0 : 2, now),
    };
  });
}
