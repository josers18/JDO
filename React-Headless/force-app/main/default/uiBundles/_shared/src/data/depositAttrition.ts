/**
 * R5 — money leaving to other banks, from Plaid held-away (`BT_Plaid_Held_Away__dlm`,
 * latest `profile_month__c`, active accounts). Deposits only: Bank / Credit Union
 * *Checking* and *Savings* — the same institutions also carry credit cards,
 * mortgages and auto loans stored as negative balances, which is why the raw
 * Bank total sums negative. A positive `monthly_net_flow_usd__c` is money the
 * client is moving into the other bank this month: deposit attrition, the Retail
 * flavor of held-away (deposit capture, not AUM).
 *
 * Verified live 2026-10-22 (October snapshot): Sarah Smith 4,885 clients / $165M
 * held away, 3,204 sending money out ($8.9M/mo), 216 at $5K+/mo; Justin Chen
 * 5,065 / $172M, 3,276 ($9.2M/mo); Vince West 817 / $75M, 551 ($1.7M/mo).
 */
import { queryDataCloud, queryDataCloudForBook, type BookScope } from './dataCloudClient';
import type { QueueSignalItem } from './priorityQueue';

/** Monthly outflow at or above which a client earns a retention call. */
export const RETENTION_FLOW_USD = 5000;

// a = each held-away deposit account, ranked per client by this month's net flow;
// d = one row per client: totals plus the institution taking the most money.
const ctes = (accountFilter: string) => `
  WITH a AS (
    SELECT account_id__c AS acct, institution_name__c AS inst, institution_type__c AS itype,
           balance_usd__c AS bal, monthly_net_flow_usd__c AS flow,
           ROW_NUMBER() OVER (PARTITION BY account_id__c ORDER BY monthly_net_flow_usd__c DESC) AS rn
    FROM BT_Plaid_Held_Away__dlm
    WHERE profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Plaid_Held_Away__dlm)
      AND is_active__c = true
      AND institution_type__c IN ('Bank', 'Credit Union') AND account_type__c IN ('Checking', 'Savings')
      AND account_id__c ${accountFilter}
  ),
  d AS (
    SELECT acct, SUM(bal) AS bal, SUM(flow) AS flow, COUNT(*) AS accts,
           MAX(CASE WHEN rn = 1 THEN inst END) AS inst, MAX(CASE WHEN rn = 1 THEN itype END) AS itype
    FROM a GROUP BY acct
  )`;

// Unfiltered by flow so a book with held-away deposits never falls back org-wide.
const rowsSql = (accountFilter: string) => `${ctes(accountFilter)}
  SELECT acct AS account_id, bal, flow, accts, inst, itype FROM d
  ORDER BY flow DESC
  LIMIT 5
`;

const summarySql = (accountFilter: string) => `${ctes(accountFilter)}
  SELECT COUNT(*) AS clients, SUM(bal) AS bal,
         SUM(CASE WHEN flow > 0 THEN 1 ELSE 0 END) AS leaving,
         SUM(CASE WHEN flow > 0 THEN flow ELSE 0 END) AS outflow,
         SUM(CASE WHEN flow >= ${RETENTION_FLOW_USD} THEN 1 ELSE 0 END) AS retention
  FROM d
`;

export interface DepositAttritionRow {
  accountId: string;
  /** Held-away checking + savings balance. */
  balance: number;
  /** Net money moved into the other bank this month. */
  monthlyFlow: number;
  accounts: number;
  /** The institution taking the most money, and whether it's a bank or credit union. */
  institution: string;
  institutionType: string;
  clientName?: string;
}

export interface DepositAttritionResult {
  /** Clients sending money out, largest monthly outflow first. */
  rows: DepositAttritionRow[];
  /** Clients with held-away deposits. */
  clients: number;
  balance: number;
  /** Clients with a positive net flow this month, and the total. */
  leaving: number;
  outflow: number;
  /** Clients at or above the retention threshold. */
  retention: number;
  scope: BookScope;
}

const decode = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** R5 — the book's checking + savings held at other banks, and who's moving money there. */
export async function fetchDepositAttrition(ownerId: string | null | undefined): Promise<DepositAttritionResult> {
  const res = await queryDataCloudForBook<Record<string, unknown>>(rowsSql, ownerId, 5);
  const total = await queryDataCloud<Record<string, unknown>>(summarySql(res.accountFilter), 1)
    .then(r => r.rows[0] ?? {})
    .catch((): Record<string, unknown> => ({}));
  return {
    scope: res.scope,
    clients: Number(total.clients) || 0,
    balance: Number(total.bal) || 0,
    leaving: Number(total.leaving) || 0,
    outflow: Number(total.outflow) || 0,
    retention: Number(total.retention) || 0,
    rows: res.rows
      .map(r => ({
        accountId: String(r.account_id ?? ''),
        balance: Number(r.bal) || 0,
        monthlyFlow: Number(r.flow) || 0,
        accounts: Number(r.accts) || 0,
        institution: decode(String(r.inst ?? '')) || 'another bank',
        institutionType: String(r.itype ?? ''),
      }))
      .filter(r => r.monthlyFlow > 0),
  };
}

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 });

/** The retention call — queue action and the Task subject the card prefills. */
export const DEPOSIT_RETENTION = 'Deposit retention — rate match, consolidate to Cumulus';

/** Moving at least the threshold this month — earns a retention call. */
export const needsRetentionCall = (r: DepositAttritionRow) => r.monthlyFlow >= RETENTION_FLOW_USD;

/** Retention calls are due in 5 days — the queue item and the card's Task prefill. */
export const retentionCallDue = (now = new Date()) =>
  new Date(now.getFullYear(), now.getMonth(), now.getDate() + 5).toISOString().slice(0, 10);

/** Why the client needs a call — the queue reason and the card's Task comments. */
export const retentionCallReason = (r: DepositAttritionRow) =>
  `${money(r.monthlyFlow)}/mo moving to ${r.institution} · ${money(r.balance)} in checking + savings held away`;

/** $10K+/mo → medium; the queue severity behind the Task priority. */
export const retentionCallSeverity = (r: DepositAttritionRow): 'medium' | 'low' =>
  r.monthlyFlow >= 10000 ? 'medium' : 'low';

/** Task priority for the card's prefill: medium → High, low → Normal. */
export const retentionCallPriority = (r: DepositAttritionRow) =>
  retentionCallSeverity(r) === 'medium' ? 'High' as const : 'Normal' as const;

/** R5 largest outflows → queue: a deposit retention call. */
export function depositAttritionQueueItems(
  res: DepositAttritionResult,
  nameById: Record<string, string>,
  opts: { segment: string; now?: Date },
): QueueSignalItem[] {
  const due = retentionCallDue(opts.now);
  const src = `Plaid held-away${res.scope === 'org' ? ' · org-wide' : ''}`;
  return res.rows
    .filter(needsRetentionCall)
    .slice(0, 3)
    .map((r, i) => ({
      id: `da${i}`,
      clientId: r.accountId,
      clientName: nameById[r.accountId] || r.accountId,
      segment: opts.segment,
      reason: retentionCallReason(r),
      action: DEPOSIT_RETENTION,
      score: Math.min(0.8, 0.4 + r.monthlyFlow / 40000),
      severity: retentionCallSeverity(r),
      source: src,
      relationshipValue: r.balance,
      dueDate: due,
    }));
}
