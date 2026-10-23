/**
 * R6 — digital-engagement surges: recognized clients browsing product pages on
 * the Cumulus sites. Two live sources, unioned: the RTOM demo site (via
 * `ssot__WebsiteEngagement__dlm`, `ssot__LinkURL__c`) and the bank website
 * (`CumulusWeb_Engagements__dlm`, `webInteractions_sourceUrl__c` — its rows in
 * the unified DMO carry no URL). A product page is `/products/<line>/<slug>`.
 *
 * Recognition: an event's device id is a `SourceRecordId__c` on
 * `UnifiedLinkssotAccountAcc__dlm`; the same `UnifiedRecordId__c`'s CRM-sourced
 * link (`001…`) is the Account. Events are de-duplicated by id because one
 * device can link to several accounts (a household resolves to one unified
 * record — each member's account shows the same browsing).
 *
 * Recognized traffic is sparse, so the window is the 7 days up to the BOOK's
 * latest product view (like S6) and the card says when that was; the queue and
 * Right Now only take recent visits. Verified live 2026-10-22: Jose Sifontes 1
 * client — Cash Rewards ×12 today; Sarah Smith / Justin Chen last browsed
 * 2026-08-18 (Cash Rewards, Travel Points, CDs, 30-year fixed).
 */
import { queryDataCloud, queryDataCloudForBook, type BookScope } from './dataCloudClient';
import type { QueueSignalItem } from './priorityQueue';

/** Product views in the window at which a client earns a follow-up. */
export const SURGE_VIEWS = 5;
/** Only visits this recent reach the queue (the card shows the book's latest week regardless). */
const QUEUE_DAYS = 14;

// ev = product-page views from both sites; ac = device → CRM account; rec = one
// row per event × account; win = the book's latest product view.
const ctes = (accountFilter: string) => `
  WITH ev AS (
    SELECT ssot__Id__c AS eid, ssot__IndividualId__c AS dev, ssot__EngagementDateTm__c AS ts, ssot__LinkURL__c AS url
    FROM ssot__WebsiteEngagement__dlm
    WHERE ssot__DataSourceObjectId__c = 'CumulusRTOM_Behavioral_Events_5DD30D2C' AND ssot__LinkURL__c LIKE '%/products/%/%'
    UNION ALL
    SELECT eventId__c AS eid, deviceId__c AS dev, dateTime__c AS ts, webInteractions_sourceUrl__c AS url
    FROM CumulusWeb_Engagements__dlm
    WHERE webInteractions_sourceUrl__c LIKE '%/products/%/%'
  ),
  ac AS (
    SELECT DISTINCT l.SourceRecordId__c AS dev, a2.SourceRecordId__c AS acct
    FROM UnifiedLinkssotAccountAcc__dlm l
    JOIN UnifiedLinkssotAccountAcc__dlm a2 ON a2.UnifiedRecordId__c = l.UnifiedRecordId__c
    WHERE a2.SourceRecordId__c LIKE '001%' AND a2.SourceRecordId__c ${accountFilter}
  ),
  rec AS (SELECT DISTINCT ev.eid AS eid, ac.acct AS acct, ev.ts AS ts, ev.url AS url FROM ev JOIN ac ON ac.dev = ev.dev),
  win AS (SELECT MAX(ts) AS hi FROM rec)`;

// CROSS JOIN fails on the DC engine; the comma join works.
const rowsSql = (accountFilter: string) => `${ctes(accountFilter)}
  SELECT rec.acct AS account_id, rec.url AS url, COUNT(*) AS views, MAX(rec.ts) AS last_ts, MAX(win.hi) AS hi
  FROM rec, win
  WHERE rec.ts >= win.hi - INTERVAL '7' DAY
  GROUP BY rec.acct, rec.url
  ORDER BY views DESC
  LIMIT 25
`;

const summarySql = (accountFilter: string) => `${ctes(accountFilter)}
  SELECT COUNT(DISTINCT rec.acct) AS clients, COUNT(*) AS views
  FROM rec, win
  WHERE rec.ts >= win.hi - INTERVAL '7' DAY
`;

export interface ProductInterest {
  /** "Cash Rewards", from the URL slug. */
  product: string;
  /** retail / wealth / commercial — the URL's product line. */
  line: string;
  views: number;
}

export interface BrowsingClientRow {
  accountId: string;
  /** Most-viewed product first. */
  products: ProductInterest[];
  views: number;
  /** ISO timestamp of the client's latest product view. */
  lastSeen: string;
  clientName?: string;
}

export interface WebEngagementResult {
  /** Clients by product views in the window, most first. */
  rows: BrowsingClientRow[];
  clients: number;
  views: number;
  /** ISO timestamp the 7-day window ends at — the book's latest product view. */
  windowEnd: string;
  scope: BookScope;
}

// "2026-10-22 13:52:24.419 UTC" → ISO.
const iso = (v: unknown) => String(v ?? '').replace(' UTC', 'Z').replace(' ', 'T');

const WORDS: Record<string, string> = { cd: 'CD', ira: 'IRA', heloc: 'HELOC', '529': '529' };
const productOf = (url: string) => {
  const [line = '', slug = ''] = url.split('/products/')[1]?.split(/[/?#]/) ?? [];
  const product = slug.split('-').filter(Boolean)
    .map(w => WORDS[w] ?? w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  return { line, product: product || 'a product page' };
};

/** R6 — the book's recognized clients browsing product pages, latest week of activity. */
export async function fetchWebEngagement(ownerId: string | null | undefined): Promise<WebEngagementResult> {
  const res = await queryDataCloudForBook<Record<string, unknown>>(rowsSql, ownerId, 25);
  const total = await queryDataCloud<Record<string, unknown>>(summarySql(res.accountFilter), 1)
    .then(r => r.rows[0] ?? {})
    .catch((): Record<string, unknown> => ({}));
  const byClient = new Map<string, BrowsingClientRow>();
  for (const r of res.rows) {
    const accountId = String(r.account_id ?? '');
    const views = Number(r.views) || 0;
    const lastSeen = iso(r.last_ts);
    const c = byClient.get(accountId) ?? { accountId, products: [], views: 0, lastSeen };
    c.products.push({ ...productOf(String(r.url ?? '')), views });
    c.views += views;
    if (lastSeen > c.lastSeen) c.lastSeen = lastSeen;
    byClient.set(accountId, c);
  }
  return {
    scope: res.scope,
    clients: Number(total.clients) || byClient.size,
    views: Number(total.views) || 0,
    windowEnd: iso(res.rows[0]?.hi),
    rows: [...byClient.values()].sort((a, b) => b.views - a.views || b.lastSeen.localeCompare(a.lastSeen)),
  };
}

const day = (isoTs: string) => new Date(isoTs).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** "Viewed Cash Rewards 12× · 3 other products · last seen Oct 22". */
export const browsingReason = (r: BrowsingClientRow) => {
  const top = r.products[0];
  const others = r.products.length - 1;
  return `Viewed ${top?.product ?? 'product pages'} ${top?.views ?? r.views}× on the website${others ? ` · ${others} other product${others > 1 ? 's' : ''}` : ''} · last seen ${day(r.lastSeen)}`;
};

/** The follow-up for the client's most-viewed product. */
export const browsingAction = (r: BrowsingClientRow) =>
  `Follow up on ${r.products[0]?.product ?? 'product'} interest`;

/** Visited within the last two days — a Right Now moment. */
export const isBrowsingNow = (r: BrowsingClientRow, now = new Date()) =>
  now.getTime() - new Date(r.lastSeen).getTime() <= 2 * 86_400_000;

/** 5+ product views, the latest within two weeks — earns a follow-up. */
export const needsBrowsingFollowUp = (r: BrowsingClientRow, now = new Date()) =>
  r.views >= SURGE_VIEWS && now.getTime() - new Date(r.lastSeen).getTime() <= QUEUE_DAYS * 86_400_000;

/** Product follow-ups are due in 2 days — the queue item and the card's Task prefill. */
export const browsingFollowUpDue = (now = new Date()) =>
  new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2).toISOString().slice(0, 10);

/** R6 recent product-page surges → queue: a product follow-up. */
export function webEngagementQueueItems(
  res: WebEngagementResult,
  nameById: Record<string, string>,
  opts: { segment: string; now?: Date },
): QueueSignalItem[] {
  const now = opts.now ?? new Date();
  const due = browsingFollowUpDue(now);
  const src = `Web engagement${res.scope === 'org' ? ' · org-wide' : ''}`;
  return res.rows
    .filter(r => needsBrowsingFollowUp(r, now))
    .slice(0, 3)
    .map((r, i) => ({
      id: `we${i}`,
      clientId: r.accountId,
      clientName: nameById[r.accountId] || r.accountId,
      segment: opts.segment,
      reason: browsingReason(r),
      action: browsingAction(r),
      score: Math.min(0.85, 0.45 + r.views / 50 + (isBrowsingNow(r, now) ? 0.15 : 0)),
      severity: isBrowsingNow(r, now) ? 'medium' : 'low',
      source: src,
      relationshipValue: 0,
      dueDate: due,
    }));
}
