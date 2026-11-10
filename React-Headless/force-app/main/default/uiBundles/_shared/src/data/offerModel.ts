/**
 * S3 — next-best-offer pipeline from the Snowflake offer-eligibility model
 * (`OFFER_ELIGIBILITY` → zero-copy `BT_Offer_Eligibility__dlm`), keyed directly
 * to the Salesforce Account Id. One row per client × action code for the codes
 * the client does NOT already hold (the generator reads FSC holdings and
 * excludes owned products); `recommended_action_rank__c` 1–N or null = not
 * rule-eligible. Monthly run covering every book: retail and wealth person
 * accounts plus business accounts (verified 2026-11-09: 36,637 of 36,768
 * accounts with at least one eligible offer).
 *
 * Each app sees its own product family; within it we take each client's
 * best-ranked eligible offer, then the strongest client per product, so the
 * recommendations rail shows distinct offers rather than three copies of the
 * same mortgage.
 *
 * Replaces the Databricks `Offer_Eligibility_Model__dlm` (single 2026-08-12
 * run, holdings-blind, MDM-keyed, retail-heavy), which is no longer read.
 */
import { queryDataCloudForBook, type BookScope } from './dataCloudClient';

export type OfferFamily = 'retail' | 'wealth' | 'commercial';

const FAMILY_FILTER: Record<OfferFamily, string> = {
  retail: "b.product_family__c = 'Retail'",
  wealth: "b.product_family__c = 'Wealth'",
  commercial: "b.action_code__c LIKE 'BIZ-%'",
};

const OFFER_LABEL: Record<string, string> = {
  'MTG-30': '30-year fixed mortgage',
  'AUTO-ACQ': 'auto loan',
  'CRC-ACQ': 'credit card',
  'CHK-ACQ': 'checking account',
  'FTH-ACQ': 'first-time homebuyer program',
  'HYS-ACQ': 'high-yield savings',
  'HEL-ACQ': 'home equity line of credit',
  'PL-ACQ': 'personal loan',
  'INV-ACQ': 'investing account',
  'PCHK-ACQ': 'Premier checking',
  'WM-CASH': 'high-yield cash account',
  'IRA-RTH': 'Roth IRA',
  'IRA-ROL': '401(k) rollover IRA',
  'WM-MAS': 'managed account',
  'MTG-JMB': 'jumbo mortgage',
  'BIZ-CHK': 'business checking',
  'BIZ-CARD': 'commercial card',
  'BIZ-TM-ACH': 'ACH origination',
  'BIZ-TM-RDC': 'remote deposit capture',
  'BIZ-TM-PP': 'positive pay',
  'BIZ-TM-SWP': 'liquidity sweep',
  'BIZ-LOC': 'working-capital line of credit',
  'BIZ-TL': 'term loan',
  'BIZ-EQF': 'equipment financing',
  'BIZ-CRE': 'commercial real estate loan',
  'BIZ-SBA': 'SBA 7(a) loan',
};

/** Human product name for an action code ("MTG-30" → "30-year fixed mortgage"). */
export const offerLabel = (code: string) => OFFER_LABEL[code] ?? code;

/** Eligible offers for the book, one row per client × code. */
const eligibleOffersSql = (family: OfferFamily, accountFilter: string) => `
      SELECT b.account_id__c AS account_id, b.action_code__c AS code, b.recommended_action_rank__c AS action_rank,
             b.conversion_probability__c AS conv, b.noaction_conversion__c AS noaction,
             b.expected_value_uplift__c AS ev, b.recommended_channels__c AS channels,
             b.em_probability__c AS em_p, b.cc_probability__c AS cc_p
      FROM BT_Offer_Eligibility__dlm b
      WHERE ${FAMILY_FILTER[family]}
        AND b.recommended_action_rank__c IS NOT NULL
        AND b.expected_value_uplift__c > 0
        AND b.account_id__c ${accountFilter}`;

const bestOfferSql = (family: OfferFamily) => (accountFilter: string) => `
  SELECT account_id, code, action_rank, conv, noaction, ev, channels, em_p, cc_p FROM (
    SELECT y.*, ROW_NUMBER() OVER (PARTITION BY code ORDER BY ev DESC, conv DESC) AS pn FROM (
      SELECT e.*, ROW_NUMBER() OVER (PARTITION BY account_id ORDER BY action_rank, ev DESC) AS rn
      FROM (${eligibleOffersSql(family, accountFilter)}
      ) e
    ) y
    WHERE rn = 1
  ) x
  WHERE pn = 1
  ORDER BY ev DESC
  LIMIT 3
`;

export interface NextBestOffer {
  accountId: string;
  code: string;
  /** Human product name, e.g. "Roth IRA"; falls back to the action code. */
  offer: string;
  rank: number;
  /** Modeled conversion % with outreach vs. the no-action baseline. */
  conversionPct: number;
  baselinePct: number;
  expectedUplift: number;
  /** Best outreach channel by modeled probability. */
  channel: 'email' | 'call' | 'task';
}

export interface NextBestOfferResult { rows: NextBestOffer[]; scope: BookScope; }

/** Email vs. contact-center call, whichever the model scores higher; other channels become a task. */
function bestChannel(channels: string, emP: number, ccP: number): NextBestOffer['channel'] {
  const list = channels.split(',').map(c => c.trim());
  const em = list.includes('EM') ? emP : 0;
  const cc = list.includes('CC') ? ccP : 0;
  if (!em && !cc) return 'task';
  return em >= cc ? 'email' : 'call';
}

/** S3 — up to three distinct next-best offers from the banker's book. */
export async function fetchNextBestOffers(
  ownerId: string | null | undefined,
  family: OfferFamily,
): Promise<NextBestOfferResult> {
  const res = await queryDataCloudForBook<Record<string, unknown>>(bestOfferSql(family), ownerId, 3);
  return {
    scope: res.scope,
    rows: res.rows.map(r => {
      const code = String(r.code ?? '');
      return {
        accountId: String(r.account_id ?? ''),
        code,
        offer: OFFER_LABEL[code] ?? code,
        // DC returns decimals as strings.
        rank: Number(r.action_rank) || 0,
        conversionPct: Number(r.conv) || 0,
        baselinePct: Number(r.noaction) || 0,
        expectedUplift: Number(r.ev) || 0,
        channel: bestChannel(String(r.channels ?? ''), Number(r.em_p) || 0, Number(r.cc_p) || 0),
      };
    }),
  };
}

// Growth KPI — the same per-client pick as the cards (best-ranked eligible
// offer per client), summed over the whole book and split by product.
const upliftSql = (family: OfferFamily) => (accountFilter: string) => `
  SELECT code, COUNT(*) AS clients, SUM(ev) AS uplift FROM (
    SELECT code, ev, ROW_NUMBER() OVER (PARTITION BY account_id ORDER BY action_rank, ev DESC) AS rn
    FROM (${eligibleOffersSql(family, accountFilter)}
    ) e
  ) y
  WHERE rn = 1
  GROUP BY code
  ORDER BY uplift DESC
`;

export interface ModeledUplift {
  /** Sum of each client's best-offer expected uplift. */
  total: number;
  clients: number;
  /** Largest product first. */
  byOffer: { code: string; offer: string; clients: number; uplift: number }[];
  scope: BookScope;
}

/** S3 Growth KPI — "Modeled uplift in book" for this app's product family. */
export async function fetchModeledUplift(ownerId: string | null | undefined, family: OfferFamily): Promise<ModeledUplift> {
  const res = await queryDataCloudForBook<Record<string, unknown>>(upliftSql(family), ownerId, 20);
  const byOffer = res.rows.map(r => {
    const code = String(r.code ?? '');
    return { code, offer: OFFER_LABEL[code] ?? code, clients: Number(r.clients) || 0, uplift: Number(r.uplift) || 0 };
  });
  return {
    total: byOffer.reduce((sum, o) => sum + o.uplift, 0),
    clients: byOffer.reduce((sum, o) => sum + o.clients, 0),
    byOffer,
    scope: res.scope,
  };
}

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 });

const CHANNEL_LABEL: Record<NextBestOffer['channel'], string> = { email: 'email', call: 'a call', task: 'a follow-up task' };

/** S3 rows → recommendation cards (structurally each app's `Recommendation`). */
export function offerRecommendations(res: NextBestOfferResult, nameById: Record<string, string>) {
  return res.rows.map((o, i) => {
    const clientName = nameById[o.accountId] || o.accountId;
    return {
      id: `rec-offer${i}`,
      kind: o.channel,
      objectLabel: 'Account',
      clientName,
      clientId: o.accountId,
      title: `Offer ${clientName} ${/^[aeiou]/i.test(o.offer) ? 'an' : 'a'} ${o.offer}`,
      body: `Next-best action #${Math.round(o.rank)} for this client: ${Math.round(o.conversionPct)}% modeled conversion with outreach vs ${Math.round(o.baselinePct)}% without. Lead with ${CHANNEL_LABEL[o.channel]}.`,
      evidence: `Offer eligibility model · ${o.code} · ${money(o.expectedUplift)} expected uplift${res.scope === 'org' ? ' · org-wide' : ''}`,
    };
  });
}
