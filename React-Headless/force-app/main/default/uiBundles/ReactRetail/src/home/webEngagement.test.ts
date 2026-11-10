import { productOf } from '@shared/data/webEngagement';

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
