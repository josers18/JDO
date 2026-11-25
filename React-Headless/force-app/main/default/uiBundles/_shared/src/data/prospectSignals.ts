/**
 * Prospect signals for the Leads & Referrals card (Identify & Acquire).
 *
 * A Lead carries no signals itself — the Demandbase, UserGems and Harmonic DMOs
 * are keyed on Account. Leads linked to a prospect Account through
 * `FinServ__RelatedAccount__c` borrow that account's signals:
 *
 *   · Champion  — a former champion / primary contact of a client joined the
 *     prospect in the last 30 days (`BT_UserGems_Job_Changes__dlm`,
 *     `new_account_id__c`): warm door in.
 *   · Intent    — surging on a topic this week (`BT_Demandbase_Intent_Signals__dlm`,
 *     latest `profile_week__c`, strongest topic).
 *   · Funding   — recently funded this month (`BT_Harmonic_Company_Signals__dlm`,
 *     latest `profile_month__c`).
 *
 * Every query is filtered to the given account ids, so it stays small; each one
 * is best-effort and an empty map just leaves the card in its CRM order.
 */
import { queryDataCloud } from './dataCloudClient';
import { decodeEntities } from './decodeEntities';

export interface ProspectSignals {
  champion?: { contactName: string; fromAccountId: string; opportunityScore: number; newTitle?: string; detectedDate?: string };
  intent?: { topic: string; score: number; stage: string; researchers: number; signalDate?: string };
  funding?: { stage: string; roundUsd: number };
}

export type ProspectSignalMap = Record<string, ProspectSignals>;

// Account ids go straight into SQL — keep only Salesforce id characters.
const idList = (ids: string[]) => ids.map(id => `'${id.replace(/[^A-Za-z0-9]/g, '')}'`).join(', ');

const championSql = (ids: string) => `
  SELECT new_account_id__c AS acct, contact_name__c, account_id__c, opportunity_score__c, new_title__c, detected_date__c
  FROM BT_UserGems_Job_Changes__dlm
  WHERE event_type__c = 'Departed'
    AND (was_champion__c = true OR was_primary_contact__c = true)
    AND detected_date__c >= current_date - INTERVAL '30' DAY
    AND new_account_id__c IN (${ids})
  ORDER BY opportunity_score__c DESC NULLS LAST`;

const intentSql = (ids: string) => `
  SELECT account_id__c AS acct, intent_topic__c, intent_score__c, journey_stage__c, unique_researchers__c, last_signal_date__c
  FROM BT_Demandbase_Intent_Signals__dlm
  WHERE profile_week__c = (SELECT MAX(profile_week__c) FROM BT_Demandbase_Intent_Signals__dlm)
    AND surge_flag__c = true
    AND account_id__c IN (${ids})
  ORDER BY intent_score__c DESC`;

const fundingSql = (ids: string) => `
  SELECT account_id__c AS acct, last_funding_stage__c, last_round_usd__c
  FROM BT_Harmonic_Company_Signals__dlm
  WHERE profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Harmonic_Company_Signals__dlm)
    AND recently_funded_flag__c = true
    AND account_id__c IN (${ids})`;

const rowsOf = (sql: string) =>
  queryDataCloud<Record<string, unknown>>(sql, 200).then(r => r.rows).catch((): Record<string, unknown>[] => []);

/** Signals for each prospect account id. Rows arrive strongest-first, so the
 *  first row per account wins. */
export async function fetchProspectSignals(accountIds: string[]): Promise<ProspectSignalMap> {
  const unique = [...new Set(accountIds.filter(Boolean))];
  if (!unique.length) return {};
  const ids = idList(unique);
  const [champions, intents, fundings] = await Promise.all([rowsOf(championSql(ids)), rowsOf(intentSql(ids)), rowsOf(fundingSql(ids))]);
  const out: ProspectSignalMap = {};
  const at = (r: Record<string, unknown>) => (out[String(r.acct ?? '')] ??= {});
  for (const r of champions) {
    const s = at(r);
    s.champion ??= { contactName: decodeEntities(String(r.contact_name__c ?? '')), fromAccountId: String(r.account_id__c ?? ''), opportunityScore: Number(r.opportunity_score__c) || 0, newTitle: r.new_title__c ? String(r.new_title__c) : undefined, detectedDate: r.detected_date__c ? String(r.detected_date__c).slice(0, 10) : undefined };
  }
  for (const r of intents) {
    const s = at(r);
    s.intent ??= { topic: decodeEntities(String(r.intent_topic__c ?? '')), score: Number(r.intent_score__c) || 0, stage: String(r.journey_stage__c ?? ''), researchers: Number(r.unique_researchers__c) || 0, signalDate: r.last_signal_date__c ? String(r.last_signal_date__c).slice(0, 10) : undefined };
  }
  for (const r of fundings) {
    const s = at(r);
    s.funding ??= { stage: String(r.last_funding_stage__c ?? ''), roundUsd: Number(r.last_round_usd__c) || 0 };
  }
  delete out[''];
  return out;
}

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 });

/** Short chips for a prospect row, strongest signal first. `nameById` resolves
 *  the champion's former employer. */
export function prospectBadges(s: ProspectSignals | undefined, nameById: Record<string, string> = {}): string[] {
  if (!s) return [];
  const out: string[] = [];
  if (s.champion) {
    const from = nameById[s.champion.fromAccountId];
    out.push(`Champion joined${from ? ` from ${from}` : ''}`);
  }
  if (s.intent) out.push(`Intent ${s.intent.score} · ${s.intent.topic}`);
  if (s.funding) out.push(`Raised ${money(s.funding.roundUsd)} ${s.funding.stage}`.trim());
  return out;
}

/** One number to rank prospects by: a champion is the warmest door (opportunity
 *  score), intent adds its score, funding adds a flat 25. 0 = no signal. */
export function prospectScore(s: ProspectSignals | undefined): number {
  if (!s) return 0;
  return (s.champion?.opportunityScore ?? 0) + (s.intent?.score ?? 0) + (s.funding ? 25 : 0);
}

/** Attach badges + score to leads linked to an account, and move leads with
 *  signals to the top (highest score first). Leads without signals keep their
 *  original order below them. */
export function rankProspectLeads<T extends { accountId?: string }>(
  leads: T[],
  signals: ProspectSignalMap,
  nameById: Record<string, string> = {},
): (T & { signals: string[]; signalScore: number })[] {
  return leads
    .map((l, i) => {
      const s = l.accountId ? signals[l.accountId] : undefined;
      return { lead: { ...l, signals: prospectBadges(s, nameById), signalScore: prospectScore(s) }, i };
    })
    .sort((a, b) => b.lead.signalScore - a.lead.signalScore || a.i - b.i)
    .map(x => x.lead);
}
