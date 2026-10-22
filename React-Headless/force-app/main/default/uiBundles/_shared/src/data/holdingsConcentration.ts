/**
 * W8 — holdings concentration risk from `ssot__FinancialHolding__dlm` (the CRM
 * FinServ holdings; the `SecuritiesHolding` source mirrors them, so it's
 * excluded to avoid double-counting). A client is concentrated when their
 * largest single-stock position is ≥ 20% of their total holdings. Broad funds,
 * bond ETFs and money-market sweeps are not single-issuer risk — the holding
 * class can't tell them apart (SPY / VTI are tagged "U.S. Equity" like AAPL),
 * so they're excluded by ticker.
 *
 * Stood in for the MSCI-downgrade W8 (no holding→issuer join exists).
 * Verified live 2026-10-22: Kim Johnson 5 of 10 clients at ≥ 20% ($8.7M), Adam Watson 4 of 5,
 * Jose Sifontes 1 of 13; org-wide 21 of 60 ($87M). Sarah Smith / Justin Chen hold none → org-wide.
 */
import { queryDataCloud, queryDataCloudForBook, type BookScope } from './dataCloudClient';
import type { QueueSignalItem } from './priorityQueue';

/** Single-position weight at or above which a client counts as concentrated. */
export const CONCENTRATION_THRESHOLD = 0.2;

const FUNDS = "('SPY', 'QQQ', 'VTI', 'VXUS', 'AGG', 'BND', 'HYG', 'LQD', 'TIP', 'MUB', 'VNQ', 'GLD', 'SPAXX', 'VMFXX')";
const SRC = "ssot__DataSourceObjectId__c = 'FinServ__FinancialHolding__c'";

// pos = one row per client × ticker; tot = per-client total; big = largest single stock.
const ctes = (accountFilter: string) => `
  WITH pos AS (
    SELECT ssot__AccountId__c AS acct, ssot__FinancialSecurityId__c AS t, SUM(ssot__MarketValueAmount__c) AS mv
    FROM ssot__FinancialHolding__dlm
    WHERE ${SRC} AND ssot__AccountId__c ${accountFilter}
    GROUP BY ssot__AccountId__c, ssot__FinancialSecurityId__c
  ),
  tot AS (SELECT acct, SUM(mv) AS tot, COUNT(*) AS npos FROM pos GROUP BY acct),
  big AS (
    SELECT acct, t, mv, ROW_NUMBER() OVER (PARTITION BY acct ORDER BY mv DESC) AS rn
    FROM pos WHERE t NOT IN ${FUNDS}
  ),
  nm AS (
    SELECT ssot__FinancialSecurityId__c AS t, MAX(ssot__Name__c) AS name
    FROM ssot__FinancialHolding__dlm
    WHERE ${SRC} AND ssot__Name__c NOT LIKE 'a7m%'
    GROUP BY ssot__FinancialSecurityId__c
  )`;

// Unfiltered by the threshold so a book with holdings never falls back org-wide.
const rowsSql = (accountFilter: string) => `${ctes(accountFilter)}
  SELECT big.acct AS account_id, big.t AS ticker, nm.name AS name, big.mv AS mv, tot.tot AS tot,
         big.mv / tot.tot AS w, tot.npos AS npos
  FROM big JOIN tot ON tot.acct = big.acct LEFT JOIN nm ON nm.t = big.t
  WHERE big.rn = 1
  ORDER BY w DESC
  LIMIT 5
`;

const summarySql = (accountFilter: string) => `${ctes(accountFilter)}
  SELECT COUNT(*) AS clients, SUM(tot.tot) AS aum,
         SUM(CASE WHEN big.mv >= ${CONCENTRATION_THRESHOLD} * tot.tot THEN 1 ELSE 0 END) AS concentrated,
         (SELECT SUM(mv) FROM pos WHERE t NOT IN ${FUNDS}) AS single
  FROM tot LEFT JOIN big ON big.acct = tot.acct AND big.rn = 1
`;

const exposureSql = (accountFilter: string) => `${ctes(accountFilter)}
  SELECT pos.t AS ticker, MAX(nm.name) AS name, SUM(pos.mv) AS mv, COUNT(*) AS holders
  FROM pos LEFT JOIN nm ON nm.t = pos.t
  WHERE pos.t NOT IN ${FUNDS}
  GROUP BY pos.t
  ORDER BY mv DESC
  LIMIT 4
`;

export interface ConcentratedClientRow {
  accountId: string;
  ticker: string;
  issuer: string;
  positionUsd: number;
  totalUsd: number;
  /** Largest single-stock position ÷ total holdings. */
  weight: number;
  positions: number;
  clientName?: string;
}

export interface StockExposure {
  ticker: string;
  issuer: string;
  marketValue: number;
  holders: number;
  /** Share of the book's total holdings. */
  share: number;
}

export interface HoldingsConcentrationResult {
  /** Clients at or above the threshold, most concentrated first. */
  rows: ConcentratedClientRow[];
  exposures: StockExposure[];
  clients: number;
  concentrated: number;
  aum: number;
  /** Single stocks' share of total holdings. */
  singleStockShare: number;
  scope: BookScope;
}

// "MSFT - Microsoft Corporation" → "Microsoft Corporation"; HTML entities arrive escaped.
const issuerOf = (name: unknown, ticker: string) =>
  String(name ?? '').replace(/&amp;/g, '&').replace(/^[A-Z.]+ - /, '') || ticker;

/** W8 — the book's single-stock concentration: concentrated clients + top exposures. */
export async function fetchHoldingsConcentration(ownerId: string | null | undefined): Promise<HoldingsConcentrationResult> {
  const res = await queryDataCloudForBook<Record<string, unknown>>(rowsSql, ownerId, 5);
  const [total, exposures] = await Promise.all([
    queryDataCloud<Record<string, unknown>>(summarySql(res.accountFilter), 1)
      .then(r => r.rows[0] ?? {})
      .catch((): Record<string, unknown> => ({})),
    queryDataCloud<Record<string, unknown>>(exposureSql(res.accountFilter), 4)
      .then(r => r.rows)
      .catch((): Record<string, unknown>[] => []),
  ]);
  const aum = Number(total.aum) || 0;
  return {
    scope: res.scope,
    clients: Number(total.clients) || 0,
    concentrated: Number(total.concentrated) || 0,
    aum,
    singleStockShare: aum ? (Number(total.single) || 0) / aum : 0,
    rows: res.rows
      .map(r => {
        const ticker = String(r.ticker ?? '');
        return {
          accountId: String(r.account_id ?? ''),
          ticker,
          issuer: issuerOf(r.name, ticker),
          positionUsd: Number(r.mv) || 0,
          totalUsd: Number(r.tot) || 0,
          weight: Number(r.w) || 0,
          positions: Number(r.npos) || 0,
        };
      })
      .filter(r => r.weight >= CONCENTRATION_THRESHOLD),
    exposures: exposures.map(r => {
      const ticker = String(r.ticker ?? '');
      const marketValue = Number(r.mv) || 0;
      return {
        ticker,
        issuer: issuerOf(r.name, ticker),
        marketValue,
        holders: Number(r.holders) || 0,
        share: aum ? marketValue / aum : 0,
      };
    }),
  };
}

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 });

/** W8 concentrated clients → queue: a diversification review. */
export function concentrationQueueItems(
  res: HoldingsConcentrationResult,
  nameById: Record<string, string>,
  opts: { segment: string; now?: Date },
): QueueSignalItem[] {
  const now = opts.now ?? new Date();
  const due = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7).toISOString().slice(0, 10);
  const src = `CRM holdings${res.scope === 'org' ? ' · org-wide' : ''}`;
  return res.rows.slice(0, 3).map((r, i) => ({
    id: `hc${i}`,
    clientId: r.accountId,
    clientName: nameById[r.accountId] || r.accountId,
    segment: opts.segment,
    reason: `${r.ticker} is ${Math.round(r.weight * 100)}% of holdings (${money(r.positionUsd)} of ${money(r.totalUsd)})`,
    action: 'Diversification review — trim or hedge',
    score: Math.min(0.85, 0.4 + r.weight),
    severity: r.weight >= 0.35 ? 'medium' : 'low',
    source: src,
    relationshipValue: r.totalUsd,
    dueDate: due,
  }));
}
