/**
 * W5 — trading activity pulse from `Financial_Trades__dlm`: buys vs sells per
 * trade date over the eight weeks up to the latest CRM-account trade, plus the
 * book's biggest net sellers in that latest week (cash raised → reinvest call).
 * Confirmed USD trades only — the stream mixes currencies with no FX rate.
 *
 * ⚠ The trade stream lands in weekly batches and has been failing: the latest
 * trade is 2026-08-31, so the card is presented "as of" that date.
 * Verified live 2026-10-22, Sarah Smith's book: ~$680–700M each way per week;
 * top net seller $550K in the latest week.
 */
import { queryDataCloud, queryDataCloudForBook, type BookScope } from './dataCloudClient';
import type { QueueSignalItem } from './priorityQueue';

const LATEST = "(SELECT MAX(TradeDate__c) FROM Financial_Trades__dlm WHERE AccountID__c LIKE '001am%')";
const SLICE = "TradeStatus__c = 'Confirmed' AND Currency__c = 'USD'";

const weeklySql = (accountFilter: string) => `
  SELECT CAST(CAST(TradeDate__c AS DATE) AS VARCHAR) AS d,
         SUM(CASE WHEN TradeSide__c = 'Buy' THEN Total_Trade__c ELSE 0 END) AS buys,
         SUM(CASE WHEN TradeSide__c = 'Sell' THEN Total_Trade__c ELSE 0 END) AS sells,
         COUNT(*) AS n
  FROM Financial_Trades__dlm
  WHERE TradeDate__c >= ${LATEST} - INTERVAL '56' DAY
    AND ${SLICE}
    AND AccountID__c ${accountFilter}
  GROUP BY CAST(TradeDate__c AS DATE)
  ORDER BY 1
`;

const sellersSql = (accountFilter: string) => `
  SELECT AccountID__c AS account_id,
         SUM(CASE WHEN TradeSide__c = 'Sell' THEN Total_Trade__c ELSE -Total_Trade__c END) AS net_sold,
         COUNT(*) AS trades, MAX(InstrumentName__c) AS instrument
  FROM Financial_Trades__dlm
  WHERE TradeDate__c >= ${LATEST} - INTERVAL '6' DAY
    AND ${SLICE}
    AND AccountID__c ${accountFilter}
  GROUP BY AccountID__c
  HAVING SUM(CASE WHEN TradeSide__c = 'Sell' THEN Total_Trade__c ELSE -Total_Trade__c END) > 0
  ORDER BY 2 DESC
  LIMIT 4
`;

export interface TradeWeek {
  date: string;
  buys: number;
  sells: number;
  trades: number;
}

export interface NetSellerRow {
  accountId: string;
  netSold: number;
  trades: number;
  instrument: string;
  clientName?: string;
}

export interface TradingPulseResult {
  /** Oldest first. */
  weeks: TradeWeek[];
  /** Latest trade date (YYYY-MM-DD); the card's "as of". */
  asOf: string;
  buys: number;
  sells: number;
  /** Latest week, buys − sells. */
  net: number;
  sellers: NetSellerRow[];
  scope: BookScope;
}

/** W5 — eight weeks of buys vs sells plus the latest week's net sellers. */
export async function fetchTradingPulse(ownerId: string | null | undefined): Promise<TradingPulseResult> {
  const res = await queryDataCloudForBook<Record<string, unknown>>(weeklySql, ownerId, 20);
  const sellers = await queryDataCloud<Record<string, unknown>>(sellersSql(res.accountFilter), 4)
    .then(r => r.rows)
    .catch((): Record<string, unknown>[] => []);
  const weeks = res.rows.map(r => ({
    date: String(r.d ?? '').slice(0, 10),
    buys: Number(r.buys) || 0,
    sells: Number(r.sells) || 0,
    trades: Number(r.n) || 0,
  }));
  const last = weeks[weeks.length - 1];
  return {
    scope: res.scope,
    weeks,
    asOf: last?.date ?? '',
    buys: last?.buys ?? 0,
    sells: last?.sells ?? 0,
    net: (last?.buys ?? 0) - (last?.sells ?? 0),
    sellers: sellers.map(r => ({
      accountId: String(r.account_id ?? ''),
      netSold: Number(r.net_sold) || 0,
      trades: Number(r.trades) || 0,
      instrument: String(r.instrument ?? ''),
    })),
  };
}

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 });
const shortDate = (iso: string) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';

/** W5 net sellers → queue: cash raised in the latest trade week is a reinvest conversation. */
export function netSellerQueueItems(
  res: TradingPulseResult,
  nameById: Record<string, string>,
  opts: { segment: string; now?: Date },
): QueueSignalItem[] {
  const now = opts.now ?? new Date();
  const due = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3).toISOString().slice(0, 10);
  const src = `Trades · as of ${shortDate(res.asOf)}${res.scope === 'org' ? ' · org-wide' : ''}`;
  return res.sellers.map((r, i) => ({
    id: `ts${i}`,
    clientId: r.accountId,
    clientName: nameById[r.accountId] || r.accountId,
    segment: opts.segment,
    reason: `Net seller ${money(r.netSold)} across ${r.trades} trade${r.trades === 1 ? '' : 's'}${r.instrument ? ` · incl. ${r.instrument}` : ''}`,
    action: 'Reinvest the cash raised',
    score: Math.min(0.85, 0.5 + r.netSold / 2e6),
    severity: r.netSold >= 500_000 ? 'medium' : 'low',
    source: src,
    relationshipValue: r.netSold,
    dueDate: due,
  }));
}
