/**
 * W2 / W3 — financial-plan health from MoneyGuidePro
 * (`BT_MoneyGuidePro_Financial_Plans__dlm`, one row per account × month:
 * `monte_carlo_success_pct__c`, `total_goal_amount_usd__c`, `goal_count__c`,
 * `next_review_date__c`, `plan_last_updated_date__c`, `plan_status__c`
 * Active / Stale / Draft). Pinned to the latest `profile_month__c`; Draft plans
 * are excluded (not yet presented to the client).
 *
 *   · W2 plans at risk — Monte Carlo success < 70%; below 50% is the today tier.
 *     Ranked by the W9 blended score, then critical-first, then by goal dollars.
 *   · W3 reviews due — `next_review_date__c` in the next 30 days, soonest first;
 *     "stale" = status Stale or not updated in 12 months.
 *
 * Verified live 2026-10-22: Sarah Smith 9,212 plans, 5,274 below 70% (154 below
 * 50%) carrying $9.0B of goals; 362 reviews due in 30d; 1,344 stale.
 */
import { queryDataCloud, queryDataCloudForBook, type BookScope } from './dataCloudClient';
import type { QueueSignalItem } from './priorityQueue';
import { wealthWhoToCallScoreCtes } from './wealthWhoToCall';

const LATEST = `profile_month__c = (SELECT MAX(profile_month__c) FROM BT_MoneyGuidePro_Financial_Plans__dlm)
    AND plan_status__c IN ('Active', 'Stale')`;
const AT_RISK = 'monte_carlo_success_pct__c < 70';
const CRITICAL = 'monte_carlo_success_pct__c < 50';
const DUE_30 = "next_review_date__c BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30' DAY";
const STALE = "(plan_status__c = 'Stale' OR plan_last_updated_date__c < CURRENT_DATE - INTERVAL '12' MONTH)";

const COLS = `account_id__c AS account_id, monte_carlo_success_pct__c AS success, total_goal_amount_usd__c AS goal_usd,
         goal_count__c AS goals, CAST(next_review_date__c AS VARCHAR) AS next_review,
         CAST(plan_last_updated_date__c AS VARCHAR) AS updated, CASE WHEN ${STALE} THEN 1 ELSE 0 END AS stale`;

// W9 blended score first, so the clients Who-to-Call already holds lead and drop out
// in the dedupe (PLAN_RISK_SPARE extra rows backfill them); then critical, then goal $.
const atRiskRowsSql = (accountFilter: string) => `${wealthWhoToCallScoreCtes(accountFilter)}
  SELECT ${COLS}
  FROM BT_MoneyGuidePro_Financial_Plans__dlm LEFT JOIN b ON b.account_id = account_id__c
  WHERE ${LATEST} AND ${AT_RISK}
    AND account_id__c ${accountFilter}
  ORDER BY COALESCE(b.score, 0) DESC, CASE WHEN ${CRITICAL} THEN 1 ELSE 0 END DESC, total_goal_amount_usd__c DESC
  LIMIT ${PLAN_RISK_ROWS + PLAN_RISK_SPARE}
`;

/** At-risk plans the queue shows, and the extra rows fetched to backfill Who-to-Call overlaps. */
export const PLAN_RISK_ROWS = 6;
const PLAN_RISK_SPARE = 8;

const reviewRowsSql = (accountFilter: string) => `
  SELECT ${COLS}
  FROM BT_MoneyGuidePro_Financial_Plans__dlm
  WHERE ${LATEST} AND ${DUE_30}
    AND account_id__c ${accountFilter}
  ORDER BY next_review_date__c ASC, total_goal_amount_usd__c DESC
  LIMIT 6
`;

const summarySql = (accountFilter: string) => `
  SELECT COUNT(*) AS plans,
         SUM(CASE WHEN ${AT_RISK} THEN 1 ELSE 0 END) AS at_risk,
         SUM(CASE WHEN ${CRITICAL} THEN 1 ELSE 0 END) AS critical,
         SUM(CASE WHEN ${AT_RISK} THEN total_goal_amount_usd__c ELSE 0 END) AS at_risk_goal_usd,
         SUM(CASE WHEN ${DUE_30} THEN 1 ELSE 0 END) AS due30,
         SUM(CASE WHEN ${STALE} THEN 1 ELSE 0 END) AS stale
  FROM BT_MoneyGuidePro_Financial_Plans__dlm
  WHERE ${LATEST}
    AND account_id__c ${accountFilter}
`;

export interface PlanRow {
  accountId: string;
  successPct: number;
  goalUsd: number;
  goals: number;
  nextReview: string;
  updated: string;
  stale: boolean;
}

export interface PlanHealthResult {
  /** W2 — at-risk plans, highest W9 score first, then critical, then goal $ (up to PLAN_RISK_ROWS + spares). */
  atRiskRows: PlanRow[];
  /** W3 — reviews due in the next 30 days, soonest first. */
  reviewRows: PlanRow[];
  plans: number;
  atRisk: number;
  critical: number;
  atRiskGoalUsd: number;
  due30: number;
  stale: number;
  scope: BookScope;
}

const toRow = (r: Record<string, unknown>): PlanRow => ({
  accountId: String(r.account_id ?? ''),
  successPct: Number(r.success) || 0,
  goalUsd: Number(r.goal_usd) || 0,
  goals: Number(r.goals) || 0,
  nextReview: String(r.next_review ?? '').slice(0, 10),
  updated: String(r.updated ?? '').slice(0, 10),
  stale: Number(r.stale) === 1,
});

/** W2 + W3 — the book's plan health: at-risk plans, upcoming reviews, totals. */
export async function fetchPlanHealth(ownerId: string | null | undefined): Promise<PlanHealthResult> {
  const atRisk = await queryDataCloudForBook<Record<string, unknown>>(atRiskRowsSql, ownerId, PLAN_RISK_ROWS + PLAN_RISK_SPARE);
  // Reviews + totals reuse the filter the at-risk rows resolved to (book, or org fallback).
  const [reviews, total] = await Promise.all([
    queryDataCloud<Record<string, unknown>>(reviewRowsSql(atRisk.accountFilter), 6)
      .then(r => r.rows)
      .catch((): Record<string, unknown>[] => []),
    queryDataCloud<Record<string, unknown>>(summarySql(atRisk.accountFilter), 1)
      .then(r => r.rows[0] ?? {})
      .catch((): Record<string, unknown> => ({})),
  ]);
  return {
    scope: atRisk.scope,
    atRiskRows: atRisk.rows.map(toRow),
    reviewRows: reviews.map(toRow),
    plans: Number(total.plans) || 0,
    atRisk: Number(total.at_risk) || 0,
    critical: Number(total.critical) || 0,
    atRiskGoalUsd: Number(total.at_risk_goal_usd) || 0,
    due30: Number(total.due30) || 0,
    stale: Number(total.stale) || 0,
  };
}

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 });
const shortDate = (iso: string) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';

/** W2 at-risk plans → queue. Below 50% is due today; below 70% this week. */
export function planRiskQueueItems(
  res: PlanHealthResult,
  nameById: Record<string, string>,
  opts: { segment: string; now?: Date },
): QueueSignalItem[] {
  const now = opts.now ?? new Date();
  const day = (n: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + n).toISOString().slice(0, 10);
  const src = `MoneyGuidePro plan${res.scope === 'org' ? ' · org-wide' : ''}`;
  return res.atRiskRows.map((r, i) => {
    const critical = r.successPct < 50;
    return {
      id: `pr${i}`,
      clientId: r.accountId,
      clientName: nameById[r.accountId] || r.accountId,
      segment: opts.segment,
      reason: `Plan success ${Math.round(r.successPct)}% · ${money(r.goalUsd)} across ${r.goals} goal${r.goals === 1 ? '' : 's'}${r.stale ? ' · plan stale' : ''}`,
      action: critical ? 'Rework the plan — success below 50%' : 'Plan check-in — success below 70%',
      score: Math.min(0.95, 0.55 + (70 - r.successPct) / 60),
      severity: critical ? 'high' : 'medium',
      source: src,
      relationshipValue: r.goalUsd,
      dueDate: critical ? day(0) : day(5),
    };
  });
}

/** W3 reviews due → queue, dated on the review itself. */
export function planReviewQueueItems(
  res: PlanHealthResult,
  nameById: Record<string, string>,
  opts: { segment: string },
): QueueSignalItem[] {
  const src = `MoneyGuidePro review${res.scope === 'org' ? ' · org-wide' : ''}`;
  return res.reviewRows.map((r, i) => ({
    id: `rv${i}`,
    clientId: r.accountId,
    clientName: nameById[r.accountId] || r.accountId,
    segment: opts.segment,
    reason: `Plan review due ${shortDate(r.nextReview)} · success ${Math.round(r.successPct)}% · ${money(r.goalUsd)} in goals${r.stale ? ` · plan last updated ${shortDate(r.updated)}` : ''}`,
    action: 'Prep the plan review',
    score: r.successPct < 70 ? 0.7 : 0.55,
    severity: r.successPct < 70 ? 'medium' : 'low',
    source: src,
    relationshipValue: r.goalUsd,
    dueDate: r.nextReview,
  }));
}
