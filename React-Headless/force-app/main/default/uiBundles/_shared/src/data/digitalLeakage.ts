/**
 * W4 — crypto & robo leakage from Plaid held-away (`BT_Plaid_Held_Away__dlm`,
 * latest `profile_month__c`, active accounts with a positive balance). Clients
 * keeping money on a crypto exchange or a robo-advisor are a conversation
 * starter for a digital-asset offering or a managed account. Top three clients
 * per kind by balance, plus book totals and the monthly money still flowing in.
 *
 * Verified live 2026-10-22, Sarah Smith's book: crypto 1,897 clients / $58.7M
 * (+$462K/mo), robo 1,856 clients / $780M (+$2.09M/mo).
 */
import { queryDataCloud, queryDataCloudForBook, type BookScope } from './dataCloudClient';

const SLICE = `profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Plaid_Held_Away__dlm)
    AND is_active__c = true AND balance_usd__c > 0
    AND institution_type__c IN ('Crypto Exchange', 'Robo-Advisor')`;

const rowsSql = (accountFilter: string) => `
  SELECT account_id, kind, balance, net_flow, institution, accounts FROM (
    SELECT account_id__c AS account_id, institution_type__c AS kind, SUM(balance_usd__c) AS balance,
           SUM(monthly_net_flow_usd__c) AS net_flow, MAX(institution_name__c) AS institution, COUNT(*) AS accounts,
           ROW_NUMBER() OVER (PARTITION BY institution_type__c ORDER BY SUM(balance_usd__c) DESC) AS pn
    FROM BT_Plaid_Held_Away__dlm
    WHERE ${SLICE}
      AND account_id__c ${accountFilter}
    GROUP BY account_id__c, institution_type__c
  ) x
  WHERE pn <= 3
  ORDER BY pn, kind
`;

const summarySql = (accountFilter: string) => `
  SELECT institution_type__c AS kind, COUNT(DISTINCT account_id__c) AS clients, SUM(balance_usd__c) AS balance,
         SUM(CASE WHEN monthly_net_flow_usd__c > 0 THEN monthly_net_flow_usd__c ELSE 0 END) AS inflow
  FROM BT_Plaid_Held_Away__dlm
  WHERE ${SLICE}
    AND account_id__c ${accountFilter}
  GROUP BY institution_type__c
`;

export type LeakageKind = 'crypto' | 'robo';

export interface LeakageRow {
  accountId: string;
  kind: LeakageKind;
  balance: number;
  netFlow: number;
  institution: string;
  accounts: number;
  /** Resolved by the caller from its account-name lookup. */
  clientName?: string;
}

export interface LeakageTotals { clients: number; balance: number; inflow: number }

export interface DigitalLeakageResult {
  rows: LeakageRow[];
  crypto: LeakageTotals;
  robo: LeakageTotals;
  scope: BookScope;
}

const kindOf = (v: unknown): LeakageKind => (v === 'Crypto Exchange' ? 'crypto' : 'robo');
const EMPTY: LeakageTotals = { clients: 0, balance: 0, inflow: 0 };

/** W4 — the book's crypto-exchange + robo-advisor balances (top 3 each + totals). */
export async function fetchDigitalLeakage(ownerId: string | null | undefined): Promise<DigitalLeakageResult> {
  const res = await queryDataCloudForBook<Record<string, unknown>>(rowsSql, ownerId, 6);
  const totals = await queryDataCloud<Record<string, unknown>>(summarySql(res.accountFilter), 2)
    .then(r => r.rows)
    .catch((): Record<string, unknown>[] => []);
  const pick = (k: LeakageKind): LeakageTotals => {
    const t = totals.find(r => kindOf(r.kind) === k);
    return t ? { clients: Number(t.clients) || 0, balance: Number(t.balance) || 0, inflow: Number(t.inflow) || 0 } : EMPTY;
  };
  return {
    scope: res.scope,
    crypto: pick('crypto'),
    robo: pick('robo'),
    rows: res.rows.map(r => ({
      accountId: String(r.account_id ?? ''),
      kind: kindOf(r.kind),
      balance: Number(r.balance) || 0,
      netFlow: Number(r.net_flow) || 0,
      institution: String(r.institution ?? ''),
      accounts: Number(r.accounts) || 0,
    })),
  };
}
