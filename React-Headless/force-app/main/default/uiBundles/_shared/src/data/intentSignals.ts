/**
 * Demandbase B2B intent, read from `BT_Demandbase_Intent_Signals__dlm` (weekly,
 * one row per account × topic per `profile_week__c` — pin to the latest week).
 *
 *   · Intent surge        — `surge_flag__c` true: the account is out researching
 *     one of our topics right now = get ahead of the evaluation.
 *   · Competitor research — `researching_competitor__c` set at Consideration or
 *     later: someone else is in the deal = defend the relationship.
 *
 * Collapsed to one row per account (its strongest topic by `intent_score__c`);
 * competitor research wins over a plain surge on the same account, so no account
 * appears under both kinds. Each kind is ranked separately (stage, then score,
 * then researchers) so each fills its own queue cap. Book-scoped through
 * `account_id__c` and falls back to org-wide like every other DC card.
 * Verified live 2026-11-09 (week 2026-11-09, local accounts): 853 surging,
 * 1,018 researching a competitor; the top 6 of each kind are all Purchase stage.
 * NB: ConnectApi rejects the simple `CASE x WHEN` form and boolean ORDER BY
 * keys, so both are spelled out as searched CASEs.
 */
import { queryDataCloud, queryDataCloudForBook, type BookScope } from './dataCloudClient';
import type { QueueSignalItem, QueueSeverity } from './priorityQueue';
import { dueFrom } from './transactionSignals';
import { decodeEntities } from './decodeEntities';

/** Intent-surge rows the queue shows (after the Who-to-Call dedupe). */
export const INTENT_SURGE_ROWS = 2;
/** Competitor-research rows the queue shows (after the Who-to-Call dedupe). */
export const COMPETITOR_ROWS = 2;
/** Rows fetched per kind — spares so the dedupe + cap still fills each kind. */
const PER_KIND = 6;

const COMPETITOR_HIT = 'competitor IS NOT NULL AND stage_rank >= 1';

// `w` = the latest week's topic rows for the slice; `a` = surge / competitor rows
// tagged with the account's kind and ranked so `rn = 1` is its strongest topic.
const intentCtes = (accountFilter: string) => `
  WITH w AS (
  SELECT account_id__c AS acct, intent_topic__c AS topic, journey_stage__c AS stage,
         intent_score__c AS score, unique_researchers__c AS researchers,
         researching_competitor__c AS competitor, last_signal_date__c AS signal_date,
         surge_flag__c AS surge,
         CASE WHEN journey_stage__c = 'Purchase' THEN 3 WHEN journey_stage__c = 'Decision' THEN 2
              WHEN journey_stage__c = 'Consideration' THEN 1 ELSE 0 END AS stage_rank
  FROM BT_Demandbase_Intent_Signals__dlm
  WHERE profile_week__c = (SELECT MAX(profile_week__c) FROM BT_Demandbase_Intent_Signals__dlm)
    AND account_id__c ${accountFilter}
  ),
  a AS (
  SELECT *, CASE WHEN MAX(CASE WHEN ${COMPETITOR_HIT} THEN 1 ELSE 0 END) OVER (PARTITION BY acct) = 1
                 THEN 'competitor' ELSE 'surge' END AS kind,
         ROW_NUMBER() OVER (PARTITION BY acct ORDER BY CASE WHEN ${COMPETITOR_HIT} THEN 1 ELSE 0 END DESC, score DESC) AS rn
  FROM w WHERE (${COMPETITOR_HIT}) OR surge
  )`;

const intentRowsSql = (accountFilter: string) => `${intentCtes(accountFilter)}
  SELECT account_id, kind, topic, stage, score, researchers, competitor, signal_date FROM (
    SELECT acct AS account_id, kind, topic, stage, score, researchers, competitor, signal_date,
           ROW_NUMBER() OVER (PARTITION BY kind ORDER BY stage_rank DESC, score DESC, researchers DESC) AS kn
    FROM a WHERE rn = 1
  ) x
  WHERE kn <= ${PER_KIND}
  ORDER BY kind, kn
`;

const intentSummarySql = (accountFilter: string) => `${intentCtes(accountFilter)}
  SELECT COUNT(DISTINCT CASE WHEN kind = 'surge' THEN acct END) AS surging,
         COUNT(DISTINCT CASE WHEN kind = 'competitor' THEN acct END) AS competitor
  FROM a WHERE rn = 1
`;

export interface IntentSignalRow {
  accountId: string;
  kind: 'surge' | 'competitor';
  topic: string;
  /** Demandbase journey stage — Consideration, Decision or Purchase. */
  stage: string;
  intentScore: number;
  researchers: number;
  /** The competitor being researched; null on surge rows. */
  competitor: string | null;
  /** YYYY-MM-DD */
  signalDate: string;
}

export interface IntentSignalResult {
  rows: IntentSignalRow[];
  /** Accounts surging on intent this week (competitor accounts excluded). */
  surging: number;
  /** Accounts researching a competitor at Consideration or later this week. */
  competitor: number;
  scope: BookScope;
}

/** Demandbase — the book's top surging and competitor-research accounts this week, plus counts. */
export async function fetchIntentSignals(ownerId: string | null | undefined): Promise<IntentSignalResult> {
  const res = await queryDataCloudForBook<Record<string, unknown>>(intentRowsSql, ownerId, PER_KIND * 2);
  // The counts are additive — if the summary query fails, the rows still render.
  const total = await queryDataCloud<Record<string, unknown>>(intentSummarySql(res.accountFilter), 1)
    .then(r => r.rows[0] ?? {})
    .catch((): Record<string, unknown> => ({}));
  return {
    scope: res.scope,
    surging: Number(total.surging) || 0,
    competitor: Number(total.competitor) || 0,
    rows: res.rows.map(r => ({
      accountId: String(r.account_id ?? ''),
      kind: r.kind === 'competitor' ? 'competitor' as const : 'surge' as const,
      topic: decodeEntities(String(r.topic ?? '')),
      stage: String(r.stage ?? ''),
      // DC returns decimals as strings.
      intentScore: Number(r.score) || 0,
      researchers: Number(r.researchers) || 0,
      competitor: r.competitor == null || r.competitor === '' ? null : decodeEntities(String(r.competitor)),
      signalDate: String(r.signal_date ?? '').slice(0, 10),
    })),
  };
}

/** Demandbase rows → priority-queue items, due a week after the latest signal.
 *  Flagged `reserveSlot` so the strongest new signal always holds a queue slot. */
export function intentQueueItems(
  res: IntentSignalResult,
  nameById: Record<string, string>,
  opts: { segment: string; now?: Date },
): QueueSignalItem[] {
  const now = opts.now ?? new Date();
  return res.rows.map((r, i) => {
    const competitor = r.kind === 'competitor';
    const severity: QueueSeverity = competitor
      ? (r.stage === 'Decision' || r.stage === 'Purchase' ? 'high' : 'medium')
      : (r.stage === 'Purchase' ? 'high' : 'medium');
    return {
      id: `di${i}`,
      clientId: r.accountId,
      clientName: nameById[r.accountId] || r.accountId,
      segment: opts.segment,
      reason: competitor
        ? `Researching ${r.competitor} · ${r.stage} · ${r.topic}`
        : `Surging on ${r.topic} · ${r.stage} stage · ${r.researchers} ${r.researchers === 1 ? 'researcher' : 'researchers'}`,
      action: competitor ? 'Defend the relationship' : 'Get ahead of the evaluation',
      score: competitor ? Math.min(0.85, 0.55 + r.intentScore / 400) : Math.min(0.8, 0.5 + r.intentScore / 400),
      severity,
      source: `Demandbase intent${res.scope === 'org' ? ' · org-wide' : ''}`,
      relationshipValue: 0,
      dueDate: dueFrom(r.signalDate, 7, now),
      reserveSlot: true,
    };
  });
}
