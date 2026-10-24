/**
 * S6 — campaign touches on my clients (`Marketing_Engagements__dlm`, one row per
 * Sent / Delivered / Opened / Clicked / Bounced / Unsubscribed event, keyed by
 * `account_id__c`, persona in `personal_business__c`).
 *
 * The feed has no conversion event, so "engaged, not converted" is read as: the
 * client clicked through a campaign and hasn't unsubscribed. Each client's most
 * clicked campaign wins; the strongest client per campaign comes first so the
 * queue isn't eight copies of one offer. The history is batch-loaded (latest
 * book click mid-Sept 2026) and the live hourly feed is thin, so the window is
 * the 30 days before the book's latest click, like S4. Verified live 2026-10-22:
 * 8 per book (Sarah Smith — Rewards Credit Card; Jose Sifontes — Merchant Services).
 */
import { queryDataCloudForBook, type BookScope } from './dataCloudClient';
import type { QueueSignalItem } from './priorityQueue';

export type CampaignPersona = 'Personal' | 'Business';

const CLICKS = "SUM(CASE WHEN m.engagement_type__c = 'Clicked' THEN 1 ELSE 0 END)";

const campaignTouchSql = (persona: CampaignPersona) => (accountFilter: string) => `
  SELECT account_id, campaign, product, clicks, opens, last_at FROM (
    SELECT x.*, ROW_NUMBER() OVER (PARTITION BY campaign ORDER BY clicks DESC, last_at DESC) AS pn FROM (
      SELECT m.account_id__c AS account_id, m.campaign_name__c AS campaign, m.product_name__c AS product,
             ${CLICKS} AS clicks,
             SUM(CASE WHEN m.engagement_type__c = 'Opened' THEN 1 ELSE 0 END) AS opens,
             MAX(m.engagement_at__c) AS last_at,
             ROW_NUMBER() OVER (PARTITION BY m.account_id__c ORDER BY ${CLICKS} DESC, MAX(m.engagement_at__c) DESC) AS rn
      FROM Marketing_Engagements__dlm m
      WHERE m.engagement_type__c IN ('Opened', 'Clicked')
        AND m.personal_business__c = '${persona}'
        AND m.engagement_at__c >= (SELECT MAX(engagement_at__c) FROM Marketing_Engagements__dlm
                                   WHERE engagement_type__c = 'Clicked' AND account_id__c ${accountFilter}) - INTERVAL '30' DAY
        AND m.account_id__c ${accountFilter}
        AND m.account_id__c NOT IN (SELECT account_id__c FROM Marketing_Engagements__dlm
                                    WHERE engagement_type__c = 'Unsubscribed' AND account_id__c ${accountFilter})
      GROUP BY m.account_id__c, m.campaign_name__c, m.product_name__c
    ) x
    WHERE rn = 1 AND clicks > 0
  ) z
  ORDER BY pn, clicks DESC, last_at DESC
  LIMIT 8
`;

export interface CampaignTouch {
  accountId: string;
  campaign: string;
  product: string;
  clicks: number;
  opens: number;
  lastTouch: string;
}

export interface CampaignTouchResult { rows: CampaignTouch[]; scope: BookScope; }

/** S6 — up to eight clients who clicked through a campaign in the latest 30 days. */
export async function fetchCampaignTouches(
  ownerId: string | null | undefined,
  persona: CampaignPersona,
): Promise<CampaignTouchResult> {
  const res = await queryDataCloudForBook<Record<string, unknown>>(campaignTouchSql(persona), ownerId, 8);
  return {
    scope: res.scope,
    rows: res.rows.map(r => ({
      accountId: String(r.account_id ?? ''),
      campaign: String(r.campaign ?? ''),
      product: String(r.product ?? ''),
      clicks: Number(r.clicks) || 0,
      opens: Number(r.opens) || 0,
      lastTouch: String(r.last_at ?? '').slice(0, 10),
    })),
  };
}

/** S6 rows → priority-queue follow-ups, due today (interest is already cooling). */
export function campaignTouchQueueItems(
  res: CampaignTouchResult,
  nameById: Record<string, string>,
  opts: { segment: string; now?: Date },
): QueueSignalItem[] {
  const today = (opts.now ?? new Date()).toISOString().slice(0, 10);
  return res.rows.map((t, i) => ({
    id: `mc${i}`,
    clientId: t.accountId,
    clientName: nameById[t.accountId] || t.accountId,
    segment: opts.segment,
    reason: `Clicked "${t.campaign}" ${t.clicks}× (${t.opens} opens), last ${t.lastTouch}`,
    action: `Follow up on ${t.product || 'campaign'} interest`,
    score: Math.min(0.85, 0.55 + t.clicks * 0.05),
    severity: t.clicks >= 2 ? 'medium' : 'low',
    source: `Marketing engagement${res.scope === 'org' ? ' · org-wide' : ''}`,
    relationshipValue: 0,
    dueDate: today,
  }));
}
