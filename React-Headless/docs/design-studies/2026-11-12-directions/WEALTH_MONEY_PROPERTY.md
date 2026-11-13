# Wealth customer money and property

The Money studio replaces the plain financial ledgers with an account/product landscape, selectable account groups, exact-account evidence, transaction rhythm/search and an execution journal. All records remain accessible in bounded, keyboard-reachable vertical regions; no horizontal customer scrolling or multi-page source list is introduced.

Profile adds a property/resilience work surface: source ownership, estimated value, equity, mortgage balance, HELOC model propensity, property type, flood-zone code and wildfire source score. The property outline is explicitly illustrative. A ratio compares source estimated equity and estimated value only when both exist; no lending limit or performance is implied.

## Source rules

- `window.enhanceWealthMoneyStudio(api,base)` preserves every facade method and overrides only Wealth `relationship('finances'|'profile', account, fallback)`.
- Supplemental `wealthCustomerEvidence` sources take precedence: `customer_financial_accounts`, `customer_transactions`, `customer_trades`, `customer_property`, `customer_details`. Top-level org/owner, source scope/owner/status and exact `account_id` must all match. An unavailable or wrong-owner supplemental source never silently falls back to older data.
- Without a supplemental envelope, the module uses the existing exact-ID Wealth financial-account capture and the correctly linked Julie/Anika deep-source envelopes. It never borrows a second customer's rows.
- Financial-account groups use the supplied product/type, falling back to the source account name for display grouping. Individual balances remain distinct. Banking, investment and borrowing values are never added into AUM.
- Transactions preserve raw amounts and type. Their amount bars compare only the shown capture; they are not a full-period cash-flow series. Trades preserve source date, instrument, side, quantity, price and gross-value cents. No order action, performance or turnover is invented.
- Homeowner value/equity/mortgage/HELOC fields require explicit source ownership. Non-owner/unknown ownership suppresses those fields; missing is not `$0`. Actual zero mortgage/model/hazard values remain zero when owned.
- The original broader active-external-asset section and captured source signals remain below the new Money surface. Exact financial-account IDs and primary-owner relationships remain in the source inspector.
- Profile identity remains read-only. Verified family roles, beneficiaries and estate-document completeness are not inferred.

## Validation

`tests/wealth-money-studio.browser.cjs` checks twenty scenes across 1512/1024/768/390, source account/transaction/trade inspectors and filters, exact cents and quantities, owner/renter property gates, successful zero, unavailable source and wrong-owner supplemental rejection. It also verifies preservation of the original all-active-external-assets section. The harness supports isolated validation before root registration and normal validation afterward.

Screenshots/report: `output/playwright/wealth-money-studio/`. All interactions are source inspection or local proposals; no Salesforce record writes or simulated trades are made.
