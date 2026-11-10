import {
  browsingAction,
  browsingReason,
  isBrowsingNow,
  isWebEngagementStale,
  needsBrowsingFollowUp,
  productOf,
  SURGE_VIEWS,
  WEB_STALE_DAYS,
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
