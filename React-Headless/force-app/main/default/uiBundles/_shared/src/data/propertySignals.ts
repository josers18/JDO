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

/* ── R2 — property-risk exposure ─────────────────────────────────────
   Owners on the latest quarter whose home sits in a FEMA high-risk flood zone
   (A / AE / V / VE: 4,535 org-wide) or scores 70+ on wildfire (3,390). Homes
   with both come first, then the largest home value. This is an insurance
   cross-sell and proactive-outreach list ("check in after the storm"), not a
   credit flag. Verified live 2026-10-22: Sarah Smith 2,019 homes (1,210 flood,
   887 wildfire, 78 both), $1.49B value carrying $537M of mortgage. */
const RISK_FLOOD = "flood_zone_code__c IN ('A', 'AE', 'V', 'VE')";
const RISK_FIRE = 'wildfire_risk_score__c >= 70';
const RISK_SLICE = `profile_quarter__c = (SELECT MAX(profile_quarter__c) FROM BT_Corelogic_Property__dlm)
    AND is_owner__c = true AND (${RISK_FLOOD} OR ${RISK_FIRE})`;

const riskRowsSql = (accountFilter: string) => `
  SELECT account_id__c AS account_id, flood_zone_code__c AS flood_zone, wildfire_risk_score__c AS wildfire,
         estimated_property_value__c AS value, outstanding_mortgage_balance__c AS mortgage,
         primary_property_type__c AS property_type
  FROM BT_Corelogic_Property__dlm
  WHERE ${RISK_SLICE}
    AND account_id__c ${accountFilter}
  ORDER BY CASE WHEN ${RISK_FLOOD} AND ${RISK_FIRE} THEN 1 ELSE 0 END DESC, estimated_property_value__c DESC
  LIMIT 6
`;

const riskSummarySql = (accountFilter: string) => `
  SELECT COUNT(*) AS homes,
         SUM(CASE WHEN ${RISK_FLOOD} THEN 1 ELSE 0 END) AS flood,
         SUM(CASE WHEN ${RISK_FIRE} THEN 1 ELSE 0 END) AS wildfire,
         SUM(CASE WHEN ${RISK_FLOOD} AND ${RISK_FIRE} THEN 1 ELSE 0 END) AS both_hazards,
         SUM(estimated_property_value__c) AS home_value,
         SUM(outstanding_mortgage_balance__c) AS mortgage
  FROM BT_Corelogic_Property__dlm
  WHERE ${RISK_SLICE}
    AND account_id__c ${accountFilter}
`;

export interface PropertyRiskHome {
  accountId: string;
  /** FEMA zone when it's a high-risk one, else ''. */
  floodZone: string;
  wildfire: number;
  value: number;
  mortgage: number;
  propertyType: string;
  /** Resolved by the caller from its account-name lookup. */
  clientName?: string;
}

export interface PropertyRiskResult {
  rows: PropertyRiskHome[];
  homes: number;
  flood: number;
  wildfire: number;
  both: number;
  homeValue: number;
  mortgage: number;
  scope: BookScope;
}

const HIGH_FLOOD = new Set(['A', 'AE', 'V', 'VE']);

/** R2 — the book's flood / wildfire exposure: totals + the six most exposed homes. */
export async function fetchPropertyRisk(ownerId: string | null | undefined): Promise<PropertyRiskResult> {
  const res = await queryDataCloudForBook<Record<string, unknown>>(riskRowsSql, ownerId, 6);
  const total = await queryDataCloud<Record<string, unknown>>(riskSummarySql(res.accountFilter), 1)
    .then(r => r.rows[0] ?? {})
    .catch((): Record<string, unknown> => ({}));
  return {
    scope: res.scope,
    homes: Number(total.homes) || 0,
    flood: Number(total.flood) || 0,
    wildfire: Number(total.wildfire) || 0,
    both: Number(total.both_hazards) || 0,
    homeValue: Number(total.home_value) || 0,
    mortgage: Number(total.mortgage) || 0,
    rows: res.rows.map(r => {
      const zone = String(r.flood_zone ?? '');
      return {
        accountId: String(r.account_id ?? ''),
        floodZone: HIGH_FLOOD.has(zone) ? zone : '',
        wildfire: Number(r.wildfire) || 0,
        value: Number(r.value) || 0,
        mortgage: Number(r.mortgage) || 0,
        propertyType: String(r.property_type ?? ''),
      };
    }),
  };
}

/** One-line hazard label, e.g. "Flood zone AE · wildfire 82". */
export function propertyHazards(h: PropertyRiskHome): string {
  return [h.floodZone && `Flood zone ${h.floodZone}`, h.wildfire >= 70 && `wildfire ${Math.round(h.wildfire)}`]
    .filter(Boolean)
    .join(' · ');
}
