import {
  browsingAction,
  browsingReason,
  isBrowsingNow,
  isWebEngagementStale,
  needsBrowsingFollowUp,
  productOf,
  browsingFollowUpDue,
  SURGE_VIEWS,
  WEB_STALE_DAYS,
  webEngagementQueueItems,
  type BrowsingClientRow,
  type WebEngagementResult,
} from '@shared/data/webEngagement';

// R6 shows each product by the name the site uses, not its title-cased URL slug.
const SITE = 'https://cumulus-rtom-demo-b30dfbe65e2e.herokuapp.com';

describe('productOf', () => {
  it.each([
    ['lending', 'heloan', 'HELOAN'],
    ['lending', 'heloc', 'HELOC'],
    ['deposits', '6mo-cd', '6-Month CD'],
    ['deposits', '12mo-cd', '12-Month CD'],
    ['deposits', '60mo-cd', '60-Month CD'],
    ['wealth', '401k-403b-rollover', '401(k)/403(b) Rollover'],
    ['lending', '5-1-arm-mortgage', '5/1 ARM Mortgage'],
    ['wealth', 'revocable-irrevocable-trusts', 'Revocable & Irrevocable Trusts'],
    ['deposits', 'high-yield-savings', 'High-Yield Savings'],
    ['business', 'asset-based-lending', 'Asset-Based Lending'],
    ['business', 'point-of-sale-systems', 'Point-of-Sale Systems'],
    ['lending', 'personal-line-of-credit', 'Personal Line of Credit'],
    ['cards', 'secured', 'Secured Card'],
    ['cards', 'cash-rewards', 'Cash Rewards Card'],
    ['cards', 'travel-points', 'Travel Points Card'],
    ['business', 'business-checking', 'Business Checking'],
  ])('%s/%s → %s', (line, slug, product) => {
    expect(productOf(`${SITE}/products/${line}/${slug}`)).toEqual({ line, product });
  });

  it('ignores a query string or fragment after the slug', () => {
    expect(productOf(`${SITE}/products/lending/heloan?utm=x#top`).product).toBe('HELOAN');
  });

  it('falls back when the URL is not a product page', () => {
    expect(productOf(`${SITE}/dashboard`)).toEqual({ line: '', product: 'a product page' });
  });
});

// Gabe Hoskins in Kim Johnson's book, as R6 showed him on 2026-11-10. Timestamps sit at
// midday UTC so "Nov 10" holds in any US timezone.
const row = (over: Partial<BrowsingClientRow> = {}): BrowsingClientRow => ({
  accountId: '001am00000GabeHosk',
  householdAccounts: 1,
  products: [
    { product: 'HELOAN', line: 'retail', views: 3 },
    { product: 'Auto Loan', line: 'retail', views: 2 },
  ],
  views: 5,
  lastSeen: '2026-11-10T17:00:00Z',
  clientName: 'Gabe X Hoskins',
  ...over,
});

describe('browsingReason', () => {
  it('names the most-viewed product, its views, the other products and the last visit', () => {
    expect(browsingReason(row())).toBe('Viewed HELOAN 3× on the website · 1 other product · last seen Nov 10');
  });

  it('pluralizes the other products', () => {
    const products = [...row().products, { product: '12-Month CD', line: 'retail', views: 1 }];
    expect(browsingReason(row({ products }))).toBe('Viewed HELOAN 3× on the website · 2 other products · last seen Nov 10');
  });

  it('drops the other-products part when only one product was viewed', () => {
    const products = [{ product: '401(k)/403(b) Rollover', line: 'wealth', views: 4 }];
    expect(browsingReason(row({ products, views: 4 }))).toBe('Viewed 401(k)/403(b) Rollover 4× on the website · last seen Nov 10');
  });

  it('falls back to the total views when no product is known', () => {
    expect(browsingReason(row({ products: [], views: 6 }))).toBe('Viewed product pages 6× on the website · last seen Nov 10');
  });
});

describe('browsingAction', () => {
  it('follows up on the most-viewed product', () => {
    expect(browsingAction(row())).toBe('Follow up on HELOAN interest');
  });

  it('falls back when no product is known', () => {
    expect(browsingAction(row({ products: [] }))).toBe('Follow up on product interest');
  });
});

// Gabe's last view was 2026-11-10T17:00:00Z; `now` is that instant plus the offset.
const DAY = 86_400_000;
const after = (ms: number) => new Date(Date.parse('2026-11-10T17:00:00Z') + ms);

describe('isBrowsingNow', () => {
  it('holds for two days after the last view, inclusive', () => {
    expect(isBrowsingNow(row(), after(0))).toBe(true);
    expect(isBrowsingNow(row(), after(2 * DAY))).toBe(true);
  });

  it('ends just past two days', () => {
    expect(isBrowsingNow(row(), after(2 * DAY + 1000))).toBe(false);
  });
});

describe('needsBrowsingFollowUp', () => {
  it('needs SURGE_VIEWS page loads', () => {
    expect(SURGE_VIEWS).toBe(3);
    expect(needsBrowsingFollowUp(row({ views: 3 }), after(DAY))).toBe(true);
    expect(needsBrowsingFollowUp(row({ views: 2 }), after(DAY))).toBe(false);
  });

  it('holds for 14 days after the last view, inclusive', () => {
    expect(needsBrowsingFollowUp(row(), after(14 * DAY))).toBe(true);
    expect(needsBrowsingFollowUp(row(), after(14 * DAY + 1000))).toBe(false);
  });
});

describe('isWebEngagementStale', () => {
  // Kim Johnson's book on 2026-11-10: 6 households, 28 page loads, window ending at Gabe's view.
  const result = (windowEnd: string): WebEngagementResult => ({
    rows: [row()],
    clients: 6,
    views: 28,
    windowEnd,
    scope: 'book',
  });

  it('is fresh through 30 whole days', () => {
    expect(WEB_STALE_DAYS).toBe(30);
    expect(isWebEngagementStale(result('2026-11-10T17:00:00Z'), after(30 * DAY))).toBe(false);
    expect(isWebEngagementStale(result('2026-11-10T17:00:00Z'), after(31 * DAY - 1000))).toBe(false);
  });

  it('turns stale at 31 whole days', () => {
    expect(isWebEngagementStale(result('2026-11-10T17:00:00Z'), after(31 * DAY))).toBe(true);
  });

  it('is stale when the book has no recognized views', () => {
    expect(isWebEngagementStale(result(''), after(0))).toBe(true);
  });
});

describe('webEngagementQueueItems', () => {
  // Kim Johnson's book as R6 showed it on 2026-11-10, most page loads first.
  const kim = (over: Partial<WebEngagementResult> = {}): WebEngagementResult => ({
    rows: [
      row({ accountId: 'dustin', clientName: 'Dustin P Fox', views: 6, products: [{ product: 'Personal Loan', line: 'retail', views: 4 }, { product: 'Personal Line of Credit', line: 'retail', views: 2 }] }),
      row({ accountId: 'gabe' }),
      row({ accountId: 'christopher', clientName: 'Christopher T Marquez', views: 5, products: [{ product: '12-Month CD', line: 'retail', views: 4 }, { product: 'High-Yield Savings', line: 'retail', views: 1 }] }),
      row({ accountId: 'duncan', clientName: 'Duncan L Macintosh', views: 4, products: [{ product: 'Managed Advisory', line: 'wealth', views: 3 }, { product: '401(k)/403(b) Rollover', line: 'wealth', views: 1 }] }),
      row({ accountId: 'raymond', clientName: 'Raymond Ramirez', views: 2, products: [{ product: 'Premier Checking', line: 'retail', views: 2 }] }),
    ],
    clients: 6,
    views: 28,
    windowEnd: '2026-11-10T17:00:00Z',
    scope: 'book',
    ...over,
  });
  const names = { dustin: 'Dustin P Fox', gabe: 'Gabe X Hoskins', christopher: 'Christopher T Marquez' };
  const opts = (now: Date) => ({ segment: 'Mass Affluent', now });

  it('queues the top three households with SURGE_VIEWS+ loads, in card order', () => {
    const items = webEngagementQueueItems(kim(), names, opts(after(DAY)));
    expect(items.map(i => i.clientId)).toEqual(['dustin', 'gabe', 'christopher']);
    expect(items.map(i => i.id)).toEqual(['we0', 'we1', 'we2']);
  });

  it('skips households under SURGE_VIEWS or last seen over 14 days ago', () => {
    const stale = row({ accountId: 'old', views: 9, lastSeen: '2026-10-20T17:00:00Z' });
    const rows = [stale, kim().rows[4], kim().rows[3]];
    const items = webEngagementQueueItems(kim({ rows }), {}, opts(after(DAY)));
    expect(items.map(i => i.clientId)).toEqual(['duncan']);
  });

  it('queues nothing once every visit is over 14 days old', () => {
    expect(webEngagementQueueItems(kim(), names, opts(after(15 * DAY)))).toEqual([]);
  });

  it('is due two days out and carries the given segment', () => {
    const now = after(DAY);
    expect(browsingFollowUpDue(now)).toBe('2026-11-13');
    for (const item of webEngagementQueueItems(kim(), names, opts(now))) {
      expect(item.dueDate).toBe('2026-11-13');
      expect(item.segment).toBe('Mass Affluent');
      expect(item.relationshipValue).toBe(0);
    }
  });

  it('builds the reason and action from the household’s most-viewed product', () => {
    const [dustin] = webEngagementQueueItems(kim(), names, opts(after(DAY)));
    expect(dustin).toMatchObject({
      clientName: 'Dustin P Fox',
      reason: 'Viewed Personal Loan 4× on the website · 1 other product · last seen Nov 10',
      action: 'Follow up on Personal Loan interest',
      source: 'Web engagement',
    });
  });

  it('falls back to the account id when the name is unknown', () => {
    const items = webEngagementQueueItems(kim(), {}, opts(after(DAY)));
    expect(items[0].clientName).toBe('dustin');
  });

  it('ranks a visit within two days higher, capped at 0.85', () => {
    const [now] = webEngagementQueueItems(kim(), names, opts(after(DAY)));
    const [later] = webEngagementQueueItems(kim(), names, opts(after(5 * DAY)));
    expect(now).toMatchObject({ severity: 'medium', score: 0.45 + 6 / 50 + 0.15 });
    expect(later).toMatchObject({ severity: 'low', score: 0.45 + 6 / 50 });
    const heavy = kim({ rows: [row({ views: 40 })] });
    expect(webEngagementQueueItems(heavy, names, opts(after(DAY)))[0].score).toBe(0.85);
  });

  it('marks org-wide results in the source', () => {
    const [item] = webEngagementQueueItems(kim({ scope: 'org' }), names, opts(after(DAY)));
    expect(item.source).toBe('Web engagement · org-wide');
  });
});
