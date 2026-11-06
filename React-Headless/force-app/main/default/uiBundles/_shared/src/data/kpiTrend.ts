/**
 * Real KPI history for the cockpit sparklines and deltas.
 *
 * Two sources:
 *   · Monthly / quarterly snapshot DMOs (the BT_* feeds). Each tile's summary
 *     query pins the latest period with `col = (SELECT MAX(col) FROM T)`.
 *     `perPeriodSql` lifts that pin, groups by the period instead, and the
 *     tile's own metric becomes a series. Same SQL, same book filter, so the
 *     last point always equals the tile's value.
 *   · Snowflake FINANCIAL_TRANSACTIONS (zero-copy `Financial_Transactions_BT_Snow__dll`).
 *     `fetchNetFlow` sums credits − debits per week across the book. That is the
 *     week-over-week change of ACCOUNT_DAILY_BALANCE, which is a running sum of
 *     the same rows from $0 on 2026-07-24; that sum is net flow since then, not a
 *     held balance, so the tile shows weekly flow.
 *
 * A series needs ≥ 2 real points; otherwise the tile shows no sparkline and no
 * delta (never a seeded one). CRM tiles get theirs from Cockpit_KPI_Snapshot__c (crmKpis.ts).
 */
import { queryDataCloud, queryDataCloudForBook, type BookScope } from './dataCloudClient';

export const TREND_POINTS = 8;

export interface KpiTrend {
  trend?: number[];
  /** last vs. prior point; undefined when the prior is 0 or the series is short */
  deltaPct?: number;
}

/** Series → tile fields. Fewer than 2 points means no history to show. */
export function toKpiTrend(values: number[], points = TREND_POINTS): KpiTrend {
  const trend = values.filter(n => Number.isFinite(n)).slice(-points);
  if (trend.length < 2) return {};
  const last = trend[trend.length - 1];
  const prev = trend[trend.length - 2];
  return { trend, deltaPct: prev ? (last - prev) / Math.abs(prev) : undefined };
}

// `[alias.]profile_x__c = (SELECT MAX(profile_x__c) FROM T)` — the latest-period pin.
const LATEST_PIN = /([\w.]*\b(profile_\w+__c))\s*=\s*\(SELECT MAX\(\2\) FROM \w+\)/;

/**
 * Turn a single-row "latest period" summary query into one row per period:
 * drop the pin, select the period, group by it, keep the newest TREND_POINTS
 * periods (Moody's snapshots daily, MoneyGuidePro has 30 months). The summary must have one
 * top-level SELECT and no GROUP BY (true of every tile summary it's used on).
 */
export function perPeriodSql(summarySql: string): string | null {
  const m = summarySql.match(LATEST_PIN);
  if (!m) return null;
  const col = m[1];
  return `${summarySql.replace(LATEST_PIN, '1 = 1').replace(/SELECT\s/, `SELECT CAST(${col} AS VARCHAR) AS period, `).trimEnd()}
  GROUP BY ${col}
  ORDER BY ${col} DESC
  LIMIT ${TREND_POINTS}`;
}

/** The tile's metric for each period of its snapshot, oldest → newest. */
export async function fetchSummaryTrend(
  summarySql: string,
  metric: (row: Record<string, unknown>) => number,
): Promise<KpiTrend> {
  const sql = perPeriodSql(summarySql);
  if (!sql) return {};
  const res = await queryDataCloud<Record<string, unknown>>(sql, TREND_POINTS);
  const rows = [...res.rows].sort((a, b) => String(a.period).localeCompare(String(b.period)));
  return toKpiTrend(rows.map(metric));
}

/** Same, but never throws: a failed history query just drops the sparkline. */
export const summaryTrend = (summarySql: string, metric: (row: Record<string, unknown>) => number) =>
  fetchSummaryTrend(summarySql, metric).catch((): KpiTrend => ({}));

/* ── Net flow from Snowflake transactions ─────────────────────────────── */

export interface NetFlowWeek {
  /** week start (Monday), YYYY-MM-DD */
  week: string;
  /** credits − debits */
  net: number;
  credits: number;
  debits: number;
  transactions: number;
  accounts: number;
}

export interface NetFlowResult {
  trend?: number[];
  /** completed weeks, oldest → newest */
  weeks: NetFlowWeek[];
  /** the latest completed week (undefined when there is none) */
  last?: NetFlowWeek;
  scope: BookScope;
}

const netFlowSql = (accountType?: 'Personal' | 'Business') => (accountFilter: string) => `
  SELECT CAST(CAST(DATE_TRUNC('week', transactiondate__c) AS DATE) AS VARCHAR) AS week,
         SUM(CASE WHEN transaction_type__c = 'Credit' THEN amount__c ELSE 0 END) AS credits,
         SUM(CASE WHEN transaction_type__c = 'Debit' THEN amount__c ELSE 0 END) AS debits,
         COUNT(*) AS txns, COUNT(DISTINCT accountid__c) AS accts
  FROM Financial_Transactions_BT_Snow__dll
  WHERE transactiondate__c >= CURRENT_DATE - INTERVAL '70' DAY
    AND transactiondate__c < DATE_TRUNC('week', CURRENT_DATE)
    ${accountType ? `AND account_type__c = '${accountType}'` : ''}
    AND sfaccountid__c ${accountFilter}
  GROUP BY 1
  ORDER BY 1
`;

/**
 * Weekly net flow (credits − debits) across the banker's book, last 8
 * completed weeks. The first week in the 70-day window can be partial, so it
 * is dropped when there are more than 8.
 */
export async function fetchNetFlow(
  ownerId: string | null | undefined,
  accountType?: 'Personal' | 'Business',
): Promise<NetFlowResult> {
  const res = await queryDataCloudForBook<Record<string, unknown>>(netFlowSql(accountType), ownerId, 20);
  const weeks = res.rows.map(r => {
    const credits = Number(r.credits) || 0;
    const debits = Number(r.debits) || 0;
    return {
      week: String(r.week ?? '').slice(0, 10), net: credits - debits, credits, debits,
      transactions: Number(r.txns) || 0, accounts: Number(r.accts) || 0,
    };
  }).slice(-TREND_POINTS);
  // Net flow flips sign week to week, so a % change would be meaningless —
  // the tile shows the series and the latest value, no delta.
  const { trend } = toKpiTrend(weeks.map(w => w.net));
  return { weeks, last: weeks[weeks.length - 1], trend, scope: res.scope };
}
