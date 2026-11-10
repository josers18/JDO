/**
 * Harmonic company funding, read from `BT_Harmonic_Company_Signals__dlm`
 * (monthly, one row per account per `profile_month__c` — pin to the latest month).
 *
 *   · Recently funded — `recently_funded_flag__c` true: fresh capital on the
 *     balance sheet = excess-cash / treasury conversation.
 *
 * Ranked by round size, biggest first. Book-scoped through `account_id__c` and
 * falls back to org-wide like every other DC card.
 * Verified live 2026-11-09 (month 2026-11-01): 16 funded accounts in the whole
 * table, 14 of them local (`001am…`); the local top round is a $83.5M Series C.
 * Some `last_funding_date__c` values sit in the future (up to 2026-11-19) — those
 * count as today so the due date never lands past today + 14.
 */
import { queryDataCloud, queryDataCloudForBook, type BookScope } from './dataCloudClient';
import type { QueueSignalItem } from './priorityQueue';
import { dueFrom } from './transactionSignals';
import { decodeEntities } from './decodeEntities';

/** Funding rows the queue shows (after the Who-to-Call dedupe). */
export const FUNDING_ROWS = 2;
/** Rows fetched — spares so the dedupe + cap still fills the feed. */
const FETCH_ROWS = 6;

const SERIES_A_PLUS = ['Series A', 'Series B', 'Series C', 'Growth'];

const fundingWhere = (accountFilter: string) => `
  WHERE profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Harmonic_Company_Signals__dlm)
    AND recently_funded_flag__c = true
    AND account_id__c ${accountFilter}`;

const fundingRowsSql = (accountFilter: string) => `
  SELECT account_id__c, last_funding_stage__c, funding_status__c, last_round_usd__c,
         est_runway_months__c, lead_investor__c, last_funding_date__c
  FROM BT_Harmonic_Company_Signals__dlm${fundingWhere(accountFilter)}
  ORDER BY last_round_usd__c DESC NULLS LAST
  LIMIT ${FETCH_ROWS}
`;

const fundingSummarySql = (accountFilter: string) => `
  SELECT COUNT(DISTINCT account_id__c) AS funded
  FROM BT_Harmonic_Company_Signals__dlm${fundingWhere(accountFilter)}
`;

export interface FundingSignalRow {
  accountId: string;
  /** Harmonic last funding stage — Angel, Seed, Series A–C, Growth. */
  stage: string;
  status: string;
  roundUsd: number | null;
  runwayMonths: number | null;
  leadInvestor: string | null;
  /** YYYY-MM-DD */
  fundingDate: string;
}

export interface FundingSignalResult {
  rows: FundingSignalRow[];
  /** Accounts flagged recently funded this month. */
  funded: number;
  scope: BookScope;
}

// DC returns decimals as strings; keep a missing value null, not 0.
const numOrNull = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Harmonic — the book's biggest recent funding rounds this month, plus a count. */
export async function fetchFundingSignals(ownerId: string | null | undefined): Promise<FundingSignalResult> {
  const res = await queryDataCloudForBook<Record<string, unknown>>(fundingRowsSql, ownerId, FETCH_ROWS);
  // The count is additive — if the summary query fails, the rows still render.
  const total = await queryDataCloud<Record<string, unknown>>(fundingSummarySql(res.accountFilter), 1)
    .then(r => r.rows[0] ?? {})
    .catch((): Record<string, unknown> => ({}));
  return {
    scope: res.scope,
    funded: Number(total.funded) || 0,
    rows: res.rows.map(r => ({
      accountId: String(r.account_id__c ?? ''),
      stage: String(r.last_funding_stage__c ?? ''),
      status: String(r.funding_status__c ?? ''),
      roundUsd: numOrNull(r.last_round_usd__c),
      runwayMonths: numOrNull(r.est_runway_months__c),
      leadInvestor: r.lead_investor__c == null || r.lead_investor__c === '' ? null : decodeEntities(String(r.lead_investor__c)),
      fundingDate: String(r.last_funding_date__c ?? '').slice(0, 10),
    })),
  };
}

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 });

/** Local YYYY-MM-DD for `now`. */
const localIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Harmonic rows → priority-queue items, due two weeks after the round closed.
 *  Flagged `reserveSlot` so the strongest new signal always holds a queue slot. */
export function fundingQueueItems(
  res: FundingSignalResult,
  nameById: Record<string, string>,
  opts: { segment: string; now?: Date },
): QueueSignalItem[] {
  const now = opts.now ?? new Date();
  const todayIso = localIso(now);
  return res.rows.map((r, i) => {
    const seriesAPlus = SERIES_A_PLUS.includes(r.stage);
    return {
      id: `hf${i}`,
      clientId: r.accountId,
      clientName: nameById[r.accountId] || r.accountId,
      segment: opts.segment,
      reason: `Raised ${money(r.roundUsd ?? 0)} ${r.stage}`
        + (r.runwayMonths != null ? ` · ${Math.round(r.runwayMonths)} mo runway` : '')
        + (r.leadInvestor ? ` · led by ${r.leadInvestor}` : ''),
      action: 'Excess-cash / treasury conversation',
      score: seriesAPlus ? 0.8 : 0.6,
      severity: seriesAPlus ? 'high' : 'medium',
      source: `Harmonic funding${res.scope === 'org' ? ' · org-wide' : ''}`,
      relationshipValue: r.roundUsd ?? 0,
      // A future funding date counts as today, so the due date caps at today + 14.
      dueDate: dueFrom(r.fundingDate > todayIso ? todayIso : r.fundingDate, 14, now),
      reserveSlot: true,
    };
  });
}
