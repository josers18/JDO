/**
 * C2 / C3 — market + governance context on business clients.
 *
 *   · C2 rating outlook (`BT_Moodys_Market_Context__dlm`, daily snapshots by
 *     `profile_date__c`): clients currently on a Negative or Watch outlook,
 *     most recent change first, then Watch (review-for-downgrade), agency flag
 *     count, revenue. Outlooks move over time (2026-10-24 generator fix), so
 *     the top rows are fresh moves; the counts are everyone currently on
 *     Negative / Watch.
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
  ORDER BY outlook_last_changed_date__c DESC NULLS LAST,
           CASE WHEN rating_outlook__c = 'Watch' THEN 1 ELSE 0 END DESC,
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

/* ── C4 — ESG movers (`BT_MSCI_ESG_Scores__dlm`, monthly by `profile_month__c`) ──
   A mover is a client whose MSCI letter rating changed since last month AND whose
   overall ESG score moved at least ESG_MIN_MOVE points the same way. The
   `last_rating_change_direction__c` flag isn't used: on the synthetic data it agrees
   with the actual change on only 668 of 1,679 flagged rows, and 8,089 of 11,484
   ratings moved Sep → Oct (up to six notches), so a bare rating diff is noise too —
   the score has to corroborate it, within ESG_MAX_NOTCHES. Upgrades suit a sustainability-linked / green-loan
   pitch (biggest score gain first); downgrades are a credit-committee heads-up
   (most controversy flags first, then biggest score drop). */
const ESG_MIN_MOVE = 1;
/** Real MSCI ratings move a notch or two at a time; bigger synthetic jumps are noise. */
const ESG_MAX_NOTCHES = 2;
const ESG_PREV = '(SELECT MAX(profile_month__c) FROM BT_MSCI_ESG_Scores__dlm WHERE profile_month__c < (SELECT MAX(profile_month__c) FROM BT_MSCI_ESG_Scores__dlm))';
const ESG_LEVEL = `CASE WHEN msci_esg_rating__c = 'AAA' THEN 7 WHEN msci_esg_rating__c = 'AA' THEN 6 WHEN msci_esg_rating__c = 'A' THEN 5
    WHEN msci_esg_rating__c = 'BBB' THEN 4 WHEN msci_esg_rating__c = 'BB' THEN 3 WHEN msci_esg_rating__c = 'B' THEN 2
    WHEN msci_esg_rating__c = 'CCC' THEN 1 END`;

// cur / prev = latest and prior month; mv = corroborated movers with their direction.
const esgCtes = (accountFilter: string) => `
  WITH cur AS (
    SELECT account_id__c AS acct, msci_esg_rating__c AS rating, ${ESG_LEVEL} AS lvl, esg_score_overall__c AS score,
           controversy_flag_count__c AS controversies, top_controversy_category__c AS category
    FROM BT_MSCI_ESG_Scores__dlm
    WHERE profile_month__c = (SELECT MAX(profile_month__c) FROM BT_MSCI_ESG_Scores__dlm) AND account_id__c ${accountFilter}
  ),
  prev AS (
    SELECT account_id__c AS acct, msci_esg_rating__c AS rating, ${ESG_LEVEL} AS lvl, esg_score_overall__c AS score
    FROM BT_MSCI_ESG_Scores__dlm
    WHERE profile_month__c = ${ESG_PREV} AND account_id__c ${accountFilter}
  ),
  mv AS (
    SELECT cur.acct AS acct, cur.rating AS rating, prev.rating AS from_rating, cur.score AS score,
           cur.score - prev.score AS move, cur.controversies AS controversies, cur.category AS category,
           CASE WHEN cur.lvl > prev.lvl THEN 'Upgrade' ELSE 'Downgrade' END AS direction
    FROM cur JOIN prev ON prev.acct = cur.acct
    WHERE ABS(cur.lvl - prev.lvl) <= ${ESG_MAX_NOTCHES}
      AND ((cur.lvl > prev.lvl AND cur.score - prev.score >= ${ESG_MIN_MOVE})
        OR (cur.lvl < prev.lvl AND prev.score - cur.score >= ${ESG_MIN_MOVE}))
  )`;

const esgRowsSql = (accountFilter: string) => `${esgCtes(accountFilter)}
  SELECT account_id, direction, rating, from_rating, score, move, controversies, category FROM (
    SELECT acct AS account_id, direction, rating, from_rating, score, move, controversies, category,
           ROW_NUMBER() OVER (PARTITION BY direction ORDER BY
             CASE WHEN direction = 'Upgrade' THEN move ELSE controversies END DESC, ABS(move) DESC) AS pn
    FROM mv
  ) x
  WHERE pn <= 3
  ORDER BY pn, direction
`;

const esgSummarySql = (accountFilter: string) => `${esgCtes(accountFilter)}
  SELECT (SELECT COUNT(*) FROM mv WHERE direction = 'Upgrade') AS up,
         (SELECT COUNT(*) FROM mv WHERE direction = 'Downgrade') AS down,
         (SELECT COUNT(*) FROM cur WHERE controversies > 0) AS controversies
`;

export interface EsgMoverRow {
  accountId: string;
  direction: 'Upgrade' | 'Downgrade';
  /** This month's MSCI rating, last month's, the overall score and its move since. */
  rating: string;
  fromRating: string;
  score: number;
  scoreMove: number;
  controversies: number;
  category: string;
}

export interface EsgMoversResult {
  rows: EsgMoverRow[];
  up: number;
  down: number;
  /** Accounts with 1+ controversy flags on the latest month. */
  controversies: number;
  scope: BookScope;
}

/** C4 — the book's corroborated MSCI ESG up/downgrades (top three each) plus counts. */
export async function fetchEsgMovers(ownerId: string | null | undefined): Promise<EsgMoversResult> {
  const res = await queryDataCloudForBook<Record<string, unknown>>(esgRowsSql, ownerId, 6);
  const total = await queryDataCloud<Record<string, unknown>>(esgSummarySql(res.accountFilter), 1)
    .then(r => r.rows[0] ?? {})
    .catch((): Record<string, unknown> => ({}));
  return {
    scope: res.scope,
    up: Number(total.up) || 0,
    down: Number(total.down) || 0,
    controversies: Number(total.controversies) || 0,
    rows: res.rows.map(r => ({
      accountId: String(r.account_id ?? ''),
      direction: r.direction === 'Upgrade' ? 'Upgrade' as const : 'Downgrade' as const,
      rating: String(r.rating ?? ''),
      fromRating: String(r.from_rating ?? ''),
      score: Number(r.score) || 0,
      scoreMove: Number(r.move) || 0,
      controversies: Number(r.controversies) || 0,
      category: String(r.category ?? ''),
    })),
  };
}
