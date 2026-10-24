/**
 * W7 — wealth-propensity upgrades from Claritas (`BT_Claritas_Demographics__dlm`,
 * monthly by `profile_month__c`): clients scoring `wealth_propensity_score__c`
 * ≥ 80 or carrying an `estimated_net_worth_band__c` of $1M+ who are not yet in
 * the Wealth segment (Account `FinServ_ClientCategory_c__c` ≠ 'Wealth Management').
 * Prospecting from inside the existing book. $5M+ ranks first, then wealth
 * propensity, then investment propensity.
 *
 * Verified live 2026-10-22: Sarah Smith 312 candidates, Justin Chen 326 — all
 * $1M–$5M (wealth propensity tops out below 80 in those books); both books are
 * categorised Retail end to end.
 */
import { queryDataCloud, queryDataCloudForBook, type BookScope } from './dataCloudClient';
import type { QueueSignalItem } from './priorityQueue';

const SLICE = `c.profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Claritas_Demographics__dlm)
    AND (c.wealth_propensity_score__c >= 80 OR c.estimated_net_worth_band__c IN ('$1M-$5M', '$5M+'))
    AND (a.FinServ_ClientCategory_c__c IS NULL OR a.FinServ_ClientCategory_c__c <> 'Wealth Management')`;

const rowsSql = (accountFilter: string) => `
  SELECT c.account_id__c AS account_id, c.estimated_net_worth_band__c AS net_worth,
         c.wealth_propensity_score__c AS wealth, c.investment_propensity_score__c AS invest,
         c.life_stage__c AS life_stage, c.prizm_segment_name__c AS prizm,
         a.FinServ_ClientCategory_c__c AS category, a.FinServ_AnnualIncome_pc__c AS income
  FROM BT_Claritas_Demographics__dlm c
  JOIN ssot__Account__dlm a ON a.ssot__Id__c = c.account_id__c
  WHERE ${SLICE}
    AND c.account_id__c ${accountFilter}
  ORDER BY CASE WHEN c.estimated_net_worth_band__c = '$5M+' THEN 1 ELSE 0 END DESC,
           c.wealth_propensity_score__c DESC, c.investment_propensity_score__c DESC
  LIMIT 5
`;

const summarySql = (accountFilter: string) => `
  SELECT COUNT(*) AS candidates,
         SUM(CASE WHEN c.estimated_net_worth_band__c = '$5M+' THEN 1 ELSE 0 END) AS five_m,
         SUM(CASE WHEN c.wealth_propensity_score__c >= 80 THEN 1 ELSE 0 END) AS high_propensity
  FROM BT_Claritas_Demographics__dlm c
  JOIN ssot__Account__dlm a ON a.ssot__Id__c = c.account_id__c
  WHERE ${SLICE}
    AND c.account_id__c ${accountFilter}
`;

export interface WealthUpgradeRow {
  accountId: string;
  netWorthBand: string;
  wealthScore: number;
  investScore: number;
  lifeStage: string;
  prizm: string;
  category: string;
  income: number;
  clientName?: string;
}

export interface WealthUpgradeResult {
  rows: WealthUpgradeRow[];
  candidates: number;
  fiveM: number;
  highPropensity: number;
  scope: BookScope;
}

const decode = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** W7 — the book's clients who look like Wealth clients but aren't segmented as one. */
export async function fetchWealthUpgrades(ownerId: string | null | undefined): Promise<WealthUpgradeResult> {
  const res = await queryDataCloudForBook<Record<string, unknown>>(rowsSql, ownerId, 5);
  const total = await queryDataCloud<Record<string, unknown>>(summarySql(res.accountFilter), 1)
    .then(r => r.rows[0] ?? {})
    .catch((): Record<string, unknown> => ({}));
  return {
    scope: res.scope,
    candidates: Number(total.candidates) || 0,
    fiveM: Number(total.five_m) || 0,
    highPropensity: Number(total.high_propensity) || 0,
    rows: res.rows.map(r => ({
      accountId: String(r.account_id ?? ''),
      netWorthBand: decode(String(r.net_worth ?? '')),
      wealthScore: Number(r.wealth) || 0,
      investScore: Number(r.invest) || 0,
      lifeStage: String(r.life_stage ?? ''),
      prizm: decode(String(r.prizm ?? '')),
      category: String(r.category ?? '') || 'Unsegmented',
      income: Number(r.income) || 0,
    })),
  };
}

/** W7 upgrades → queue, a this-week prospecting call. */
export function wealthUpgradeQueueItems(
  res: WealthUpgradeResult,
  nameById: Record<string, string>,
  opts: { segment: string; now?: Date },
): QueueSignalItem[] {
  const now = opts.now ?? new Date();
  const due = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 5).toISOString().slice(0, 10);
  const src = `Claritas propensity${res.scope === 'org' ? ' · org-wide' : ''}`;
  return res.rows.slice(0, 3).map((r, i) => ({
    id: `wu${i}`,
    clientId: r.accountId,
    clientName: nameById[r.accountId] || r.accountId,
    segment: opts.segment,
    reason: `Est. net worth ${r.netWorthBand} · wealth propensity ${Math.round(r.wealthScore)} · still in ${r.category}`,
    action: 'Wealth upgrade conversation',
    score: Math.min(0.8, 0.45 + r.wealthScore / 250),
    severity: r.netWorthBand === '$5M+' ? 'medium' : 'low',
    source: src,
    relationshipValue: 0,
    dueDate: due,
  }));
}
