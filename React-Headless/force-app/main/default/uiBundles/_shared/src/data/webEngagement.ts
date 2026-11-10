/**
 * R6 — digital-engagement surges: recognized clients browsing product pages on
 * the Cumulus sites. Two live sources, unioned: the RTOM demo site (via
 * `ssot__WebsiteEngagement__dlm`, `ssot__LinkURL__c`) and the bank website
 * (`CumulusWeb_Engagements__dlm`, `webInteractions_sourceUrl__c` — its rows in
 * the unified DMO carry no URL). A product page is `/products/<line>/<slug>`.
 *
 * Recognition: an event's device id is a `SourceRecordId__c` on
 * `UnifiedLinkssotAccountAcc__dlm`; the same `UnifiedRecordId__c`'s CRM-sourced
 * links (`001…`) are the Accounts. A household's devices resolve to one unified
 * record, so rows group by that record: one row per household, opening its lowest
 * account id in the book, with the member-account count beside the name.
 *
 * Counting: one product page load = one view. The RTOM sitemap fires "Viewed
 * Product Detail" twice per load (~20ms apart) plus two "Product Interest
 * Captured", so only the first action is kept and repeats of a device + URL within
 * 2s collapse. SURGE_VIEWS (3 loads) replaces the old 5, which was tuned against
 * the doubled events.
 *
 * Recognized traffic is sparse, so the window is the 7 days up to the BOOK's
 * latest product view (like S6) and the card says when that was; the queue and
 * Right Now only take recent visits. Past WEB_STALE_DAYS the card shows "No
 * recent identified visits" instead. Since 08-19 most site devices are anonymous;
 * identified browsing for 33 client households (Sarah's and Justin's six shared
 * households plus ten registered in each book; Jose's Julie E Morris plus six
 * registered; `web_browsing.py --register` links a device by email) is sent weekly by the Marketing_Engagement worker
 * (`web_browsing.py`). Verified live
 * through the Apex bridge 2026-11-09 (PT): Sarah Smith 6 households, 20 page
 * loads; Justin Chen 5 households, 16 page loads. 2026-11-10 17:46Z: Jose
 * Sifontes 7 households, 46 page loads. 18:55Z: Sarah 11 households, 132 page
 * loads; Justin 10 households, 117. 19:45Z (second batch): Sarah 16, 157;
 * Justin 15, 142.
 */
import { queryDataCloud, queryDataCloudForBook, type BookScope } from './dataCloudClient';
import type { QueueSignalItem } from './priorityQueue';

/** Product page loads in the window at which a household earns a follow-up. */
export const SURGE_VIEWS = 3;
/** Only visits this recent reach the queue (the card shows the book's latest week regardless). */
const QUEUE_DAYS = 14;

// raw = product-detail views from both sites (RTOM: only "Viewed Product Detail" —
// the sitemap fires it twice per load, plus two "Product Interest Captured");
// ev = one row per page load (repeats of a device + URL within 2s collapse);
// ac = device → household (unified record) → the book's CRM accounts in it;
// rec = one row per load × account; win = the book's latest product view.
const ctes = (accountFilter: string) => `
  WITH raw AS (
    SELECT ssot__Id__c AS eid, ssot__IndividualId__c AS dev, ssot__EngagementDateTm__c AS ts, ssot__LinkURL__c AS url
    FROM ssot__WebsiteEngagement__dlm
    WHERE ssot__DataSourceObjectId__c = 'CumulusRTOM_Behavioral_Events_5DD30D2C'
      AND ssot__EngagementChannelActionId__c = 'Viewed Product Detail' AND ssot__LinkURL__c LIKE '%/products/%/%'
    UNION ALL
    SELECT eventId__c AS eid, deviceId__c AS dev, dateTime__c AS ts, webInteractions_sourceUrl__c AS url
    FROM CumulusWeb_Engagements__dlm
    WHERE webInteractions_sourceUrl__c LIKE '%/products/%/%'
  ),
  seq AS (SELECT eid, dev, ts, url, LAG(ts) OVER (PARTITION BY dev, url ORDER BY ts) AS prev FROM raw),
  ev AS (SELECT eid, dev, ts, url FROM seq WHERE prev IS NULL OR ts > prev + INTERVAL '2' SECOND),
  ac AS (
    SELECT DISTINCT l.SourceRecordId__c AS dev, l.UnifiedRecordId__c AS hh, a2.SourceRecordId__c AS acct
    FROM UnifiedLinkssotAccountAcc__dlm l
    JOIN UnifiedLinkssotAccountAcc__dlm a2 ON a2.UnifiedRecordId__c = l.UnifiedRecordId__c
    WHERE a2.SourceRecordId__c LIKE '001%' AND a2.SourceRecordId__c ${accountFilter}
  ),
  rec AS (SELECT DISTINCT ev.eid AS eid, ac.hh AS hh, ac.acct AS acct, ev.ts AS ts, ev.url AS url FROM ev JOIN ac ON ac.dev = ev.dev),
  win AS (SELECT MAX(ts) AS hi FROM rec)`;

// One row per household × product; the household shows as its lowest account id.
// CROSS JOIN fails on the DC engine; the comma join works.
const rowsSql = (accountFilter: string) => `${ctes(accountFilter)}
  SELECT rec.hh AS hh, MIN(rec.acct) AS account_id, COUNT(DISTINCT rec.acct) AS accounts, rec.url AS url,
         COUNT(DISTINCT rec.eid) AS views, MAX(rec.ts) AS last_ts, MAX(win.hi) AS hi
  FROM rec, win
  WHERE rec.ts >= win.hi - INTERVAL '7' DAY
  GROUP BY rec.hh, rec.url
  ORDER BY views DESC
  LIMIT 25
`;

const summarySql = (accountFilter: string) => `${ctes(accountFilter)}
  SELECT COUNT(DISTINCT rec.hh) AS clients, COUNT(DISTINCT rec.eid) AS views
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
  /** The household's lowest CRM account id in the book — what the row opens. */
  accountId: string;
  /** The book's accounts in this household (one device resolves to all of them). */
  householdAccounts: number;
  /** Most-viewed product first. */
  products: ProductInterest[];
  views: number;
  /** ISO timestamp of the client's latest product view. */
  lastSeen: string;
  clientName?: string;
}

export interface WebEngagementResult {
  /** Households by product page loads in the window, most first. */
  rows: BrowsingClientRow[];
  /** Households (unified profiles), not accounts. */
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

/** R6 — the book's recognized households browsing product pages, latest week of activity. */
export async function fetchWebEngagement(ownerId: string | null | undefined): Promise<WebEngagementResult> {
  const res = await queryDataCloudForBook<Record<string, unknown>>(rowsSql, ownerId, 25);
  const total = await queryDataCloud<Record<string, unknown>>(summarySql(res.accountFilter), 1)
    .then(r => r.rows[0] ?? {})
    .catch((): Record<string, unknown> => ({}));
  const byClient = new Map<string, BrowsingClientRow>();
  for (const r of res.rows) {
    const hh = String(r.hh ?? r.account_id ?? '');
    const accountId = String(r.account_id ?? '');
    const views = Number(r.views) || 0;
    const lastSeen = iso(r.last_ts);
    const c = byClient.get(hh) ?? { accountId, householdAccounts: Number(r.accounts) || 1, products: [], views: 0, lastSeen };
    c.products.push({ ...productOf(String(r.url ?? '')), views });
    c.views += views;
    if (lastSeen > c.lastSeen) c.lastSeen = lastSeen;
    byClient.set(hh, c);
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

/** SURGE_VIEWS+ product page loads, the latest within two weeks — earns a follow-up. */
export const needsBrowsingFollowUp = (r: BrowsingClientRow, now = new Date()) =>
  r.views >= SURGE_VIEWS && now.getTime() - new Date(r.lastSeen).getTime() <= QUEUE_DAYS * 86_400_000;

/** Past this many days since the book's latest product view, the card reads "no recent identified visits". */
export const WEB_STALE_DAYS = 30;

/** Whole days from the window end (the book's latest recognized product view) to now. */
export const webEngagementAgeDays = (res: WebEngagementResult, now = new Date()) =>
  res.windowEnd ? Math.floor((now.getTime() - new Date(res.windowEnd).getTime()) / 86_400_000) : Infinity;

/** The latest recognized product view is over WEB_STALE_DAYS old. */
export const isWebEngagementStale = (res: WebEngagementResult, now = new Date()) =>
  webEngagementAgeDays(res, now) > WEB_STALE_DAYS;

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
