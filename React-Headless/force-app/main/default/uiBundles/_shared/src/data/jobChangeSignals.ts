/**
 * UserGems job changes, read from `BT_UserGems_Job_Changes__dlm` (`event_type__c = 'Departed'`).
 *
 *   · Champion departure (Commercial) — a champion / primary contact left the client
 *     employer in the last 30 days: re-establish the relationship. Ranked by
 *     `relationship_risk_score__c`.
 *   · Liquidity event (Wealth) — a person account left an employer with a liquidity
 *     event in the last 180 days: rollover / equity-proceeds conversation. Ranked by
 *     `opportunity_score__c`.
 *
 * Book-scoped through `account_id__c` (Commercial) / `person_account_id__c` (Wealth)
 * and falls back to org-wide like every other DC card.
 */
import { queryDataCloud, queryDataCloudForBook, type BookScope } from './dataCloudClient';
import type { QueueSignalItem } from './priorityQueue';
import { decodeEntities } from './decodeEntities';
import { dueFrom } from './transactionSignals';

/** Champion-departure rows the queue shows (after the Who-to-Call dedupe). */
export const CHAMPION_ROWS = 2;
/** Liquidity-event rows the queue shows (after the Who-to-Call dedupe). */
export const LIQUIDITY_ROWS = 3;
/** Rows fetched — spares so the dedupe + cap still fills the feed. */
const CHAMPION_FETCH = 6;
const LIQUIDITY_FETCH = 8;

const COLS = `account_id__c, person_account_id__c, new_account_id__c, new_employer_name__c,
         contact_name__c, old_title__c, contact_persona__c, was_champion__c,
         relationship_risk_score__c, opportunity_score__c, detected_date__c`;

const championWhere = (accountFilter: string) => `
  WHERE event_type__c = 'Departed'
    AND (was_champion__c = true OR was_primary_contact__c = true)
    AND detected_date__c >= current_date - INTERVAL '30' DAY
    AND account_id__c ${accountFilter}`;

const championRowsSql = (accountFilter: string) => `
  SELECT ${COLS}
  FROM BT_UserGems_Job_Changes__dlm${championWhere(accountFilter)}
  ORDER BY relationship_risk_score__c DESC NULLS LAST
  LIMIT ${CHAMPION_FETCH}
`;

const championSummarySql = (accountFilter: string) => `
  SELECT COUNT(DISTINCT account_id__c) AS total
  FROM BT_UserGems_Job_Changes__dlm${championWhere(accountFilter)}
`;

const liquidityWhere = (accountFilter: string) => `
  WHERE event_type__c = 'Departed'
    AND liquidity_event_flag__c = true
    AND person_account_id__c IS NOT NULL
    AND detected_date__c >= current_date - INTERVAL '180' DAY
    AND person_account_id__c ${accountFilter}`;

const liquidityRowsSql = (accountFilter: string) => `
  SELECT ${COLS}
  FROM BT_UserGems_Job_Changes__dlm${liquidityWhere(accountFilter)}
  ORDER BY opportunity_score__c DESC NULLS LAST, detected_date__c DESC
  LIMIT ${LIQUIDITY_FETCH}
`;

const liquiditySummarySql = (accountFilter: string) => `
  SELECT COUNT(DISTINCT person_account_id__c) AS total
  FROM BT_UserGems_Job_Changes__dlm${liquidityWhere(accountFilter)}
`;

export interface JobChangeRow {
  /** The employer account (Commercial) or the person account (Wealth). */
  accountId: string;
  /** `account_id__c` */
  employerId: string;
  /** `new_account_id__c` */
  newEmployerId: string | null;
  newEmployerName: string | null;
  contactName: string;
  title: string;
  persona: string;
  wasChampion: boolean;
  riskScore: number | null;
  opportunityScore: number | null;
  /** YYYY-MM-DD */
  detectedDate: string;
}

export interface JobChangeResult {
  rows: JobChangeRow[];
  /** Matching departures in the window (not just the fetched rows). */
  total: number;
  scope: BookScope;
}

// DC returns decimals as strings; keep a missing value null, not 0.
const numOrNull = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const strOrNull = (v: unknown): string | null => (v == null || v === '' ? null : decodeEntities(String(v)));

const toRow = (r: Record<string, unknown>, accountKey: 'account_id__c' | 'person_account_id__c'): JobChangeRow => ({
  accountId: String(r[accountKey] ?? ''),
  employerId: String(r.account_id__c ?? ''),
  newEmployerId: strOrNull(r.new_account_id__c),
  newEmployerName: strOrNull(r.new_employer_name__c),
  contactName: decodeEntities(String(r.contact_name__c ?? '')),
  title: decodeEntities(String(r.old_title__c ?? '')),
  persona: String(r.contact_persona__c ?? ''),
  wasChampion: r.was_champion__c === true || r.was_champion__c === 'true',
  riskScore: numOrNull(r.relationship_risk_score__c),
  opportunityScore: numOrNull(r.opportunity_score__c),
  detectedDate: String(r.detected_date__c ?? '').slice(0, 10),
});

async function fetchJobChanges(
  ownerId: string | null | undefined,
  rowsSql: (f: string) => string,
  summarySql: (f: string) => string,
  limit: number,
  accountKey: 'account_id__c' | 'person_account_id__c',
): Promise<JobChangeResult> {
  const res = await queryDataCloudForBook<Record<string, unknown>>(rowsSql, ownerId, limit);
  // The count is additive — if the summary query fails, the rows still render.
  const total = await queryDataCloud<Record<string, unknown>>(summarySql(res.accountFilter), 1)
    .then(r => r.rows[0] ?? {})
    .catch((): Record<string, unknown> => ({}));
  return {
    scope: res.scope,
    total: Number(total.total) || 0,
    rows: res.rows.map(r => toRow(r, accountKey)),
  };
}

/** UserGems — champions / primary contacts who left a client employer in the last 30 days. */
export const fetchChampionDepartures = (ownerId: string | null | undefined) =>
  fetchJobChanges(ownerId, championRowsSql, championSummarySql, CHAMPION_FETCH, 'account_id__c');

/** UserGems — person accounts that left an employer with a liquidity event in the last 180 days. */
export const fetchLiquidityEvents = (ownerId: string | null | undefined) =>
  fetchJobChanges(ownerId, liquidityRowsSql, liquiditySummarySql, LIQUIDITY_FETCH, 'person_account_id__c');

/** Champion departures → priority-queue items, due a week after detection.
 *  Flagged `reserveSlot` so the strongest new signal always holds a queue slot. */
export function championQueueItems(
  res: JobChangeResult,
  nameById: Record<string, string>,
  opts: { segment: string; now?: Date },
): QueueSignalItem[] {
  const now = opts.now ?? new Date();
  return res.rows.map((r, i) => {
    const newEmployer = (r.newEmployerId && nameById[r.newEmployerId]) || r.newEmployerName;
    return {
      id: `ug${i}`,
      clientId: r.accountId,
      clientName: nameById[r.accountId] || r.accountId,
      segment: opts.segment,
      reason: `${r.wasChampion ? 'Champion' : 'Primary contact'} ${r.contactName} (${r.title}) left`
        + (newEmployer ? ` · now at ${newEmployer}` : ''),
      action: 'Re-establish the relationship',
      score: Math.min(0.85, 0.5 + (r.riskScore ?? 0) / 300),
      severity: (r.riskScore ?? 0) >= 70 ? 'high' : 'medium',
      source: `UserGems job change${res.scope === 'org' ? ' · org-wide' : ''}`,
      relationshipValue: 0,
      dueDate: dueFrom(r.detectedDate, 7, now),
      reserveSlot: true,
    };
  });
}

/** Liquidity events → priority-queue items, due a week after detection. */
export function liquidityQueueItems(
  res: JobChangeResult,
  nameById: Record<string, string>,
  opts: { segment: string; now?: Date },
): QueueSignalItem[] {
  const now = opts.now ?? new Date();
  return res.rows.map((r, i) => {
    const newEmployer = (r.newEmployerId && nameById[r.newEmployerId]) || r.newEmployerName;
    return {
      id: `ul${i}`,
      clientId: r.accountId,
      clientName: nameById[r.accountId] || r.accountId,
      segment: opts.segment,
      reason: `${nameById[r.accountId] || r.contactName} left ${nameById[r.employerId] || 'their employer'}`
        + (newEmployer ? ` for ${newEmployer}` : '') + ' · liquidity event',
      action: 'Liquidity conversation — rollover / equity proceeds',
      score: Math.min(0.85, 0.5 + (r.opportunityScore ?? 0) / 300),
      severity: (r.opportunityScore ?? 0) >= 70 ? 'high' : 'medium',
      source: `UserGems liquidity${res.scope === 'org' ? ' · org-wide' : ''}`,
      relationshipValue: 0,
      dueDate: dueFrom(r.detectedDate, 7, now),
      reserveSlot: true,
    };
  });
}
