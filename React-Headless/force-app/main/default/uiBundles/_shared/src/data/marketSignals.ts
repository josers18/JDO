/**
 * C2 / C3 — market + governance context on business clients.
 *
 *   · C2 rating outlook (`BT_Moodys_Market_Context__dlm`, daily snapshots by
 *     `profile_date__c`): clients currently on a Negative or Watch outlook,
 *     Watch first (review-for-downgrade), then agency flag count, then revenue.
 *     ⚠ The outlook doesn't move between snapshots and every
 *     `outlook_last_changed_date__c` is in 2025, so this is "currently on
 *     Negative / Watch, since <date>", not "changed this quarter".
 *   · C3 leadership change (`BT_Boardex__dlm`, monthly by `profile_month__c`):
 *     `exec_turnover_flag__c` accounts. Two angles: turnover with a governance
 *     event in the last 90 days is a treasury-management opportunity (new team,
 *     new banking review); turnover on Weak governance is a credit risk.
 *
 * Verified live 2026-10-22, Jose Sifontes' book: 425 Negative + 161 Watch;
 * 1,015 turnover flags, 40 on Weak governance, ~330 governance events in 90d.
 */
import { queryDataCloud, queryDataCloudForBook, type BookScope } from './dataCloudClient';

const OUTLOOK_SLICE = `profile_date__c = (SELECT MAX(profile_date__c) FROM BT_Moodys_Market_Context__dlm)
    AND rating_outlook__c IN ('Negative', 'Watch')`;

const outlookRowsSql = (accountFilter: string) => `
  SELECT account_id__c AS account_id, rating_outlook__c AS outlook, credit_rating__c AS rating,
         CAST(outlook_last_changed_date__c AS VARCHAR) AS since, rating_agency_flag_count__c AS flags,
         thirty_day_price_change_pct__c AS px30
  FROM BT_Moodys_Market_Context__dlm
  WHERE ${OUTLOOK_SLICE}
    AND account_id__c ${accountFilter}
  ORDER BY CASE WHEN rating_outlook__c = 'Watch' THEN 1 ELSE 0 END DESC,
           rating_agency_flag_count__c DESC, annual_revenue_usd__c DESC
  LIMIT 4
`;

const outlookSummarySql = (accountFilter: string) => `
  SELECT SUM(CASE WHEN rating_outlook__c = 'Negative' THEN 1 ELSE 0 END) AS negative,
         SUM(CASE WHEN rating_outlook__c = 'Watch' THEN 1 ELSE 0 END) AS watch
  FROM BT_Moodys_Market_Context__dlm
  WHERE ${OUTLOOK_SLICE}
    AND account_id__c ${accountFilter}
`;

export interface OutlookRow {
  accountId: string;
  outlook: 'Negative' | 'Watch';
  rating: string;
  since: string;
  flags: number;
  /** 30-day price change, percent. */
  px30: number | null;
}

export interface OutlookResult {
  rows: OutlookRow[];
  negative: number;
  watch: number;
  scope: BookScope;
}

/** C2 — the book's Negative / Watch outlooks (top four + counts). */
export async function fetchOutlookWatch(ownerId: string | null | undefined): Promise<OutlookResult> {
  const res = await queryDataCloudForBook<Record<string, unknown>>(outlookRowsSql, ownerId, 4);
  const total = await queryDataCloud<Record<string, unknown>>(outlookSummarySql(res.accountFilter), 1)
    .then(r => r.rows[0] ?? {})
    .catch((): Record<string, unknown> => ({}));
  return {
    scope: res.scope,
    negative: Number(total.negative) || 0,
    watch: Number(total.watch) || 0,
    rows: res.rows.map(r => ({
      accountId: String(r.account_id ?? ''),
      outlook: r.outlook === 'Watch' ? 'Watch' as const : 'Negative' as const,
      rating: String(r.rating ?? ''),
      since: String(r.since ?? '').slice(0, 10),
      flags: Number(r.flags) || 0,
      px30: r.px30 == null || r.px30 === '' ? null : Number(r.px30),
    })),
  };
}

const ANGLE = "CASE WHEN governance_rating__c = 'Weak' THEN 'risk' ELSE 'opportunity' END";
const RECENT_EVENT = "recent_governance_event_date__c >= CURRENT_DATE - INTERVAL '90' DAY";
const TURNOVER_SLICE = `profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Boardex__dlm)
    AND exec_turnover_flag__c = true`;

const leadershipRowsSql = (accountFilter: string) => `
  SELECT account_id, governance, event_date, ceo_tenure, director, angle FROM (
    SELECT account_id__c AS account_id, governance_rating__c AS governance,
           CAST(recent_governance_event_date__c AS VARCHAR) AS event_date, ceo_tenure_years__c AS ceo_tenure,
           key_director_name__c AS director, ${ANGLE} AS angle,
           ROW_NUMBER() OVER (PARTITION BY ${ANGLE} ORDER BY recent_governance_event_date__c DESC NULLS LAST) AS pn
    FROM BT_Boardex__dlm
    WHERE ${TURNOVER_SLICE}
      AND (governance_rating__c = 'Weak' OR ${RECENT_EVENT})
      AND account_id__c ${accountFilter}
  ) x
  WHERE pn <= 3
  ORDER BY pn, angle
`;

const leadershipSummarySql = (accountFilter: string) => `
  SELECT COUNT(*) AS turnover,
         SUM(CASE WHEN ${RECENT_EVENT} THEN 1 ELSE 0 END) AS recent,
         SUM(CASE WHEN governance_rating__c = 'Weak' THEN 1 ELSE 0 END) AS weak
  FROM BT_Boardex__dlm
  WHERE ${TURNOVER_SLICE}
    AND account_id__c ${accountFilter}
`;

export interface LeadershipRow {
  accountId: string;
  governance: string;
  eventDate: string;
  ceoTenureYears: number | null;
  director: string;
  angle: 'opportunity' | 'risk';
}

export interface LeadershipResult {
  rows: LeadershipRow[];
  /** Accounts flagged for exec turnover on the latest month. */
  turnover: number;
  /** …of which had a governance event in the last 90 days. */
  recent: number;
  /** …of which sit on Weak governance. */
  weak: number;
  scope: BookScope;
}

// BoardEx names arrive HTML-escaped (e.g. "O&#39;Connor").
const decode = (s: string) =>
  s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** C3 — exec-turnover accounts: three opportunity + three risk rows, plus counts. */
export async function fetchLeadershipChanges(ownerId: string | null | undefined): Promise<LeadershipResult> {
  const res = await queryDataCloudForBook<Record<string, unknown>>(leadershipRowsSql, ownerId, 6);
  const total = await queryDataCloud<Record<string, unknown>>(leadershipSummarySql(res.accountFilter), 1)
    .then(r => r.rows[0] ?? {})
    .catch((): Record<string, unknown> => ({}));
  return {
    scope: res.scope,
    turnover: Number(total.turnover) || 0,
    recent: Number(total.recent) || 0,
    weak: Number(total.weak) || 0,
    rows: res.rows.map(r => ({
      accountId: String(r.account_id ?? ''),
      governance: String(r.governance ?? ''),
      eventDate: String(r.event_date ?? '').slice(0, 10),
      ceoTenureYears: r.ceo_tenure == null || r.ceo_tenure === '' ? null : Number(r.ceo_tenure),
      director: decode(String(r.director ?? '')),
      angle: r.angle === 'risk' ? 'risk' as const : 'opportunity' as const,
    })),
  };
}
