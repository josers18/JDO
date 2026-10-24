/**
 * S4 — warm intros from the synthetic relationship graph
 * (`BT_Synth_Relationship_Graph__dlm`, one row per directed edge
 * `src_account_id__c → dst_account_id__c`, typed REFERRAL / BUSINESS_OWNER /
 * ADVISOR_BOOK / SELF).
 *
 * A warm intro is a REFERRAL edge from a client in my book to an account I don't
 * own yet. Edges whose dst isn't a local Account (hashed ids) are dropped. The
 * graph is a batch snapshot (latest REFERRAL edge 2026-09-18), so "recent" is the
 * 60 days before the newest edge rather than before today, and REFERRAL
 * confidence tops out at ~65% — rank by it, don't threshold at 70. Verified
 * live 2026-10-22: 6+ intros in every banker book, many cross-LOB (a business
 * client referring a household and vice versa).
 */
import { queryDataCloudForBook, type BookScope } from './dataCloudClient';

const warmIntroSql = (accountFilter: string) => `
  SELECT dst_id, dst_name, dst_owned, src_id, conf, discovered FROM (
    SELECT g.dst_account_id__c AS dst_id, d.ssot__Name__c AS dst_name,
           CASE WHEN d.ssot__OwnerId__c IS NULL THEN 0 ELSE 1 END AS dst_owned,
           g.src_account_id__c AS src_id, g.confidence_pct__c AS conf, g.edge_discovered_date__c AS discovered,
           ROW_NUMBER() OVER (PARTITION BY g.dst_account_id__c ORDER BY g.confidence_pct__c DESC) AS rn
    FROM BT_Synth_Relationship_Graph__dlm g
    JOIN ssot__Account__dlm d ON d.ssot__Id__c = g.dst_account_id__c
    WHERE g.edge_type__c = 'REFERRAL'
      AND g.edge_discovered_date__c >= (SELECT MAX(edge_discovered_date__c) FROM BT_Synth_Relationship_Graph__dlm
                                        WHERE edge_type__c = 'REFERRAL') - INTERVAL '60' DAY
      AND g.src_account_id__c ${accountFilter}
      ${accountFilter.startsWith('IN') ? `AND g.dst_account_id__c NOT ${accountFilter}` : ''}
  ) x
  WHERE rn = 1
  ORDER BY conf DESC, discovered DESC
  LIMIT 6
`;

export interface WarmIntro {
  /** The referred account (the prospect). */
  accountId: string;
  name: string;
  /** False when nobody owns the account yet — an open field, not a colleague's client. */
  owned: boolean;
  /** My client who made the referral. */
  referrerId: string;
  confidencePct: number;
  discovered: string;
}

export interface WarmIntroResult { rows: WarmIntro[]; scope: BookScope; }

/** S4 — up to six referrals from my clients into accounts outside my book. */
export async function fetchWarmIntros(ownerId: string | null | undefined): Promise<WarmIntroResult> {
  const res = await queryDataCloudForBook<Record<string, unknown>>(warmIntroSql, ownerId, 6);
  return {
    scope: res.scope,
    rows: res.rows.map(r => ({
      accountId: String(r.dst_id ?? ''),
      name: String(r.dst_name ?? ''),
      owned: Number(r.dst_owned) === 1,
      referrerId: String(r.src_id ?? ''),
      // DC returns decimals as strings.
      confidencePct: Number(r.conf) || 0,
      discovered: String(r.discovered ?? '').slice(0, 10),
    })),
  };
}

// "Daniel Q Hurst" / "Saunders Household" read as people; anything else
// ("Graves-Green Group", "Hartman Contractors") is treated as a company.
const PERSON_NAME = /^[A-Z][a-z'-]+(?: [A-Z]\.?)? [A-Z][A-Za-z'-]+$/;

/** S4 rows → Leads & Referrals rows (structurally each app's `LeadReferral`).
 *  `intro` carries the prefill for creating a Lead from the row. */
export function warmIntroLeads(res: WarmIntroResult, nameById: Record<string, string>) {
  return res.rows.map((w, i) => {
    const referrer = nameById[w.referrerId] || 'a client';
    const household = /^(.+) Household$/.exec(w.name);
    const person = household || PERSON_NAME.test(w.name);
    const parts = w.name.split(' ');
    return {
      id: `wi${i}`,
      name: w.name || w.accountId,
      source: `Warm intro via ${referrer}`,
      status: `Referral · ${Math.round(w.confidencePct)}%`,
      value: 0,
      email: '',
      intro: {
        accountId: w.accountId,
        referrer,
        owned: w.owned,
        confidencePct: w.confidencePct,
        discovered: w.discovered,
        scope: res.scope,
        // Lead.LastName + Company are create-required; a company prospect
        // leaves the contact name for the banker to fill in.
        firstName: household ? undefined : person ? parts.slice(0, -1).join(' ') : undefined,
        lastName: household ? household[1] : person ? parts[parts.length - 1] : undefined,
        company: w.name,
      },
    };
  });
}

export type WarmIntroLead = ReturnType<typeof warmIntroLeads>[number];

/** Alternate CRM leads and warm intros so neither crowds the other out of the
 *  card's first rows. */
export function interleave<T>(a: T[], b: T[]): T[] {
  const out: T[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (i < a.length) out.push(a[i]);
    if (i < b.length) out.push(b[i]);
  }
  return out;
}
