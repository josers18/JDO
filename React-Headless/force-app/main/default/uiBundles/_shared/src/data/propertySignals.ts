/**
 * R1 — home-equity opportunities from CoreLogic (`BT_Corelogic_Property__dlm`,
 * one row per account × quarter: `heloc_opportunity_score__c` 0–100,
 * `equity_usd__c`, `mortgage_rate_pct__c`, `loan_to_value_pct__c`,
 * `outstanding_mortgage_balance__c`). Pinned to the latest `profile_quarter__c`
 * (25,424 accounts), owners only, HELOC score ≥ 70.
 *
 * Two angles: a mortgaged owner paying ≥ 6.5% is a refi review, everyone else
 * (mostly free-and-clear) is a HELOC conversation. The queue takes the top four
 * of each, interleaved. Verified live 2026-10-22: Sarah Smith 3,689 owners /
 * $2.20B equity / 218 refi candidates; business books have ~3 (Retail only).
 */
import { queryDataCloud, queryDataCloudForBook, type BookScope } from './dataCloudClient';
import type { QueueSignalItem } from './priorityQueue';

const LATEST = `profile_quarter__c = (SELECT MAX(profile_quarter__c) FROM BT_Corelogic_Property__dlm)
    AND heloc_opportunity_score__c >= 70 AND is_owner__c = true`;
const REFI = 'mortgage_rate_pct__c >= 6.5 AND outstanding_mortgage_balance__c > 0';
const ANGLE = `CASE WHEN ${REFI} THEN 'refi' ELSE 'heloc' END`;

const equityRowsSql = (accountFilter: string) => `
  SELECT account_id, score, equity, ltv, rate, angle, property_type FROM (
    SELECT account_id__c AS account_id, heloc_opportunity_score__c AS score, equity_usd__c AS equity,
           loan_to_value_pct__c AS ltv, mortgage_rate_pct__c AS rate, primary_property_type__c AS property_type,
           ${ANGLE} AS angle,
           ROW_NUMBER() OVER (PARTITION BY ${ANGLE} ORDER BY heloc_opportunity_score__c DESC, equity_usd__c DESC) AS pn
    FROM BT_Corelogic_Property__dlm
    WHERE ${LATEST}
      AND account_id__c ${accountFilter}
  ) x
  WHERE pn <= 4
  ORDER BY pn, angle
`;

const equitySummarySql = (accountFilter: string) => `
  SELECT COUNT(*) AS owners, SUM(equity_usd__c) AS equity,
         SUM(CASE WHEN ${REFI} THEN 1 ELSE 0 END) AS refi,
         CAST(MAX(profile_quarter__c) AS VARCHAR) AS quarter
  FROM BT_Corelogic_Property__dlm
  WHERE ${LATEST}
    AND account_id__c ${accountFilter}
`;

export interface HomeEquityLead {
  accountId: string;
  score: number;
  equity: number;
  ltvPct: number | null;
  ratePct: number | null;
  angle: 'heloc' | 'refi';
  propertyType: string;
}

export interface HomeEquityResult {
  rows: HomeEquityLead[];
  /** Book totals for the Growth KPI (owners scoring 70+). */
  owners: number;
  equity: number;
  refi: number;
  quarter: string;
  scope: BookScope;
}

const num = (v: unknown) => (v == null || v === '' ? null : Number(v));

/** R1 — the book's HELOC / refi leads plus the equity total behind them. */
export async function fetchHomeEquity(ownerId: string | null | undefined): Promise<HomeEquityResult> {
  const res = await queryDataCloudForBook<Record<string, unknown>>(equityRowsSql, ownerId, 8);
  // Totals use the same filter the rows resolved to (book, or the org fallback).
  const total = await queryDataCloud<Record<string, unknown>>(equitySummarySql(res.accountFilter), 1)
    .then(r => r.rows[0] ?? {})
    .catch((): Record<string, unknown> => ({}));
  return {
    scope: res.scope,
    // DC returns decimals as strings.
    owners: Number(total.owners) || 0,
    equity: Number(total.equity) || 0,
    refi: Number(total.refi) || 0,
    quarter: String(total.quarter ?? '').slice(0, 10),
    rows: res.rows.map(r => ({
      accountId: String(r.account_id ?? ''),
      score: Number(r.score) || 0,
      equity: Number(r.equity) || 0,
      ltvPct: num(r.ltv),
      ratePct: num(r.rate),
      angle: r.angle === 'refi' ? 'refi' as const : 'heloc' as const,
      propertyType: String(r.property_type ?? ''),
    })),
  };
}

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 });

/** R1 rows → priority-queue items. Property data is quarterly, so these are
 *  plan-this-week items (due in five days), not same-day calls. */
export function homeEquityQueueItems(
  res: HomeEquityResult,
  nameById: Record<string, string>,
  opts: { segment: string; now?: Date },
): QueueSignalItem[] {
  const now = opts.now ?? new Date();
  const due = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 5).toISOString().slice(0, 10);
  return res.rows.map((r, i) => ({
    id: `he${i}`,
    clientId: r.accountId,
    clientName: nameById[r.accountId] || r.accountId,
    segment: opts.segment,
    reason: r.angle === 'refi'
      ? `Mortgage at ${r.ratePct?.toFixed(2)}%${r.ltvPct != null ? `, LTV ${Math.round(r.ltvPct)}%` : ''} · ${money(r.equity)} equity`
      : `HELOC score ${Math.round(r.score)} · ${money(r.equity)} equity${r.ltvPct == null ? ' (owned outright)' : ''}${r.propertyType ? ` · ${r.propertyType}` : ''}`,
    action: r.angle === 'refi' ? 'Refi review — rate above 6.5%' : 'HELOC conversation — tap home equity',
    score: Math.min(0.9, 0.5 + r.score / 250),
    severity: r.score >= 90 ? 'medium' : 'low',
    source: `CoreLogic property${res.scope === 'org' ? ' · org-wide' : ''}`,
    relationshipValue: r.equity,
    dueDate: due,
  }));
}
