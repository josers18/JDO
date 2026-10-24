/**
 * W6 / C6 — the cross-LOB pair on the relationship graph's BUSINESS_OWNER edges
 * (`BT_Synth_Relationship_Graph__dlm`, src = the owner's person account,
 * dst = the business; every edge's metadata is `ownership_pct: majority`).
 *
 *   · W6 business-owner clients (Wealth): owners in my book → the business they
 *     own, with its ZoomInfo revenue / employee band. Angle: $50M+ revenue is a
 *     liquidity-event conversation, 51+ employees a 401(k) plan, otherwise
 *     succession planning.
 *   · C6 owner-wealth handoff (Commercial): businesses in my book → their owner,
 *     ranked by the owner's Claritas net-worth band and wealth propensity → a
 *     Leads row referring the owner to Wealth.
 *
 * Verified live 2026-10-22: owners sit in Vince West / Kim Johnson / Adam
 * Watson's books (207–234 owners, ~1K businesses each). Since 2026-10-24 Sarah
 * Smith and Justin Chen's books carry ~100 owners each too. Businesses sit with
 * Jose Sifontes (~1.3K) and Allen Carter (~1.5K).
 */
import { queryDataCloud, queryDataCloudForBook, type BookScope } from './dataCloudClient';

const OWNER_EDGE = "g.edge_type__c = 'BUSINESS_OWNER'";
const ZI_LATEST = '(SELECT MAX(profile_month__c) FROM BT_Zoominfo_Firmographics__dlm)';
const CLARITAS_LATEST = '(SELECT MAX(profile_month__c) FROM BT_Claritas_Demographics__dlm)';
const UPMARKET = "z.revenue_band__c IN ('$50M-$200M', '$200M-$1B', '$1B+')";
const NET_WORTH_RANK = "CASE WHEN c.estimated_net_worth_band__c = '$5M+' THEN 3 WHEN c.estimated_net_worth_band__c = '$1M-$5M' THEN 2 WHEN c.estimated_net_worth_band__c = '$250K-$1M' THEN 1 ELSE 0 END";

/* ── W6 — business-owner clients ── */

// One row per owner: their largest business (upmarket first), then edge confidence.
const ownerRowsSql = (accountFilter: string) => `
  SELECT owner_id, biz_id, biz_name, conf, revenue_band, employee_band FROM (
    SELECT g.src_account_id__c AS owner_id, g.dst_account_id__c AS biz_id, d.ssot__Name__c AS biz_name,
           g.confidence_pct__c AS conf, z.revenue_band__c AS revenue_band, z.employee_band__c AS employee_band,
           CASE WHEN ${UPMARKET} THEN 1 ELSE 0 END AS up,
           ROW_NUMBER() OVER (PARTITION BY g.src_account_id__c
                              ORDER BY CASE WHEN ${UPMARKET} THEN 1 ELSE 0 END DESC, g.confidence_pct__c DESC) AS rn
    FROM BT_Synth_Relationship_Graph__dlm g
    JOIN ssot__Account__dlm d ON d.ssot__Id__c = g.dst_account_id__c
    LEFT JOIN BT_Zoominfo_Firmographics__dlm z ON z.account_id__c = g.dst_account_id__c AND z.profile_month__c = ${ZI_LATEST}
    WHERE ${OWNER_EDGE}
      AND g.src_account_id__c ${accountFilter}
  ) x
  WHERE rn = 1
  ORDER BY up DESC, conf DESC
  LIMIT 5
`;

const ownerSummarySql = (accountFilter: string) => `
  SELECT COUNT(DISTINCT g.src_account_id__c) AS owners, COUNT(DISTINCT g.dst_account_id__c) AS businesses,
         COUNT(DISTINCT CASE WHEN ${UPMARKET} THEN g.dst_account_id__c END) AS upmarket
  FROM BT_Synth_Relationship_Graph__dlm g
  LEFT JOIN BT_Zoominfo_Firmographics__dlm z ON z.account_id__c = g.dst_account_id__c AND z.profile_month__c = ${ZI_LATEST}
  WHERE ${OWNER_EDGE}
    AND g.src_account_id__c ${accountFilter}
`;

export type OwnerAngle = 'liquidity' | '401k' | 'succession';

export interface BusinessOwnerRow {
  /** My client (the owner). */
  accountId: string;
  businessId: string;
  businessName: string;
  confidencePct: number;
  revenueBand: string;
  employeeBand: string;
  angle: OwnerAngle;
  clientName?: string;
}

export interface BusinessOwnersResult {
  rows: BusinessOwnerRow[];
  owners: number;
  businesses: number;
  /** Owned businesses with $50M+ revenue. */
  upmarket: number;
  scope: BookScope;
}

const decode = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

export const OWNER_ANGLE_LABEL: Record<OwnerAngle, string> = {
  liquidity: 'Liquidity-event planning',
  '401k': '401(k) for the business',
  succession: 'Succession planning',
};

const angleOf = (revenueBand: string, employeeBand: string): OwnerAngle =>
  ['$50M-$200M', '$200M-$1B', '$1B+'].includes(revenueBand) ? 'liquidity'
    : ['51-200', '201-1000', '1001-5000', '5001-25000', '25001+'].includes(employeeBand) ? '401k'
    : 'succession';

/** W6 — the book's clients who own a business (top five + counts). */
export async function fetchBusinessOwners(ownerId: string | null | undefined): Promise<BusinessOwnersResult> {
  const res = await queryDataCloudForBook<Record<string, unknown>>(ownerRowsSql, ownerId, 5);
  const total = await queryDataCloud<Record<string, unknown>>(ownerSummarySql(res.accountFilter), 1)
    .then(r => r.rows[0] ?? {})
    .catch((): Record<string, unknown> => ({}));
  return {
    scope: res.scope,
    owners: Number(total.owners) || 0,
    businesses: Number(total.businesses) || 0,
    upmarket: Number(total.upmarket) || 0,
    rows: res.rows.map(r => {
      const revenueBand = decode(String(r.revenue_band ?? ''));
      const employeeBand = String(r.employee_band ?? '');
      return {
        accountId: String(r.owner_id ?? ''),
        businessId: String(r.biz_id ?? ''),
        businessName: String(r.biz_name ?? ''),
        confidencePct: Number(r.conf) || 0,
        revenueBand,
        employeeBand,
        angle: angleOf(revenueBand, employeeBand),
      };
    }),
  };
}

/* ── C6 — owner-wealth handoff ── */

// One row per owner (their highest-confidence business in my book), richest first.
const handoffRowsSql = (accountFilter: string) => `
  SELECT owner_id, owner_name, biz_id, conf, wealth, net_worth, life_stage FROM (
    SELECT g.src_account_id__c AS owner_id, p.ssot__Name__c AS owner_name, g.dst_account_id__c AS biz_id,
           g.confidence_pct__c AS conf, c.wealth_propensity_score__c AS wealth,
           c.estimated_net_worth_band__c AS net_worth, c.life_stage__c AS life_stage, ${NET_WORTH_RANK} AS nw,
           ROW_NUMBER() OVER (PARTITION BY g.src_account_id__c ORDER BY g.confidence_pct__c DESC) AS rn
    FROM BT_Synth_Relationship_Graph__dlm g
    JOIN ssot__Account__dlm p ON p.ssot__Id__c = g.src_account_id__c
    JOIN BT_Claritas_Demographics__dlm c ON c.account_id__c = g.src_account_id__c AND c.profile_month__c = ${CLARITAS_LATEST}
    WHERE ${OWNER_EDGE}
      AND g.dst_account_id__c ${accountFilter}
  ) x
  WHERE rn = 1
  ORDER BY nw DESC, wealth DESC NULLS LAST, conf DESC
  LIMIT 4
`;

const handoffSummarySql = (accountFilter: string) => `
  SELECT COUNT(DISTINCT g.src_account_id__c) AS owners,
         COUNT(DISTINCT CASE WHEN c.estimated_net_worth_band__c IN ('$1M-$5M', '$5M+') THEN g.src_account_id__c END) AS millionaires
  FROM BT_Synth_Relationship_Graph__dlm g
  LEFT JOIN BT_Claritas_Demographics__dlm c ON c.account_id__c = g.src_account_id__c AND c.profile_month__c = ${CLARITAS_LATEST}
  WHERE ${OWNER_EDGE}
    AND g.dst_account_id__c ${accountFilter}
`;

export interface OwnerHandoffRow {
  /** The owner's person account. */
  ownerId: string;
  ownerName: string;
  /** My business client they own. */
  businessId: string;
  confidencePct: number;
  wealthScore: number;
  netWorthBand: string;
  lifeStage: string;
}

export interface OwnerHandoffResult {
  rows: OwnerHandoffRow[];
  owners: number;
  /** Owners with an estimated net worth of $1M+. */
  millionaires: number;
  scope: BookScope;
}

/** C6 — owners of my business clients with personal-wealth potential. */
export async function fetchOwnerWealthHandoffs(ownerId: string | null | undefined): Promise<OwnerHandoffResult> {
  const res = await queryDataCloudForBook<Record<string, unknown>>(handoffRowsSql, ownerId, 4);
  const total = await queryDataCloud<Record<string, unknown>>(handoffSummarySql(res.accountFilter), 1)
    .then(r => r.rows[0] ?? {})
    .catch((): Record<string, unknown> => ({}));
  return {
    scope: res.scope,
    owners: Number(total.owners) || 0,
    millionaires: Number(total.millionaires) || 0,
    rows: res.rows.map(r => ({
      ownerId: String(r.owner_id ?? ''),
      ownerName: String(r.owner_name ?? ''),
      businessId: String(r.biz_id ?? ''),
      confidencePct: Number(r.conf) || 0,
      wealthScore: Number(r.wealth) || 0,
      netWorthBand: decode(String(r.net_worth ?? '')),
      lifeStage: String(r.life_stage ?? ''),
    })),
  };
}

/** C6 rows → Leads & Referrals rows (structurally each app's `LeadReferral`),
 *  with an `intro` prefill so the row opens the Lead modal in create mode. */
export function ownerHandoffLeads(res: OwnerHandoffResult, nameById: Record<string, string>) {
  return res.rows.map((h, i) => {
    const business = nameById[h.businessId] || 'a business client';
    const parts = h.ownerName.split(' ');
    return {
      id: `oh${i}`,
      name: h.ownerName || h.ownerId,
      source: `Owner of ${business} · refer to Wealth`,
      status: `${h.netWorthBand || 'Net worth n/a'} · wealth ${Math.round(h.wealthScore)}`,
      value: 0,
      email: '',
      intro: {
        accountId: h.ownerId,
        referrer: business,
        owned: true,
        confidencePct: h.confidencePct,
        discovered: '',
        scope: res.scope,
        firstName: parts.length > 1 ? parts.slice(0, -1).join(' ') : undefined,
        lastName: parts[parts.length - 1] || h.ownerName,
        company: business,
      },
    };
  });
}
