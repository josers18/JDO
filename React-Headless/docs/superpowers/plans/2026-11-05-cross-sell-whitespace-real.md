# Cross-sell / upsell white-space grid: making it real

**Date:** 2026-11-05
**Replaces:** step 3 / item #2 of `2026-11-05-real-data-no-mocks.md`
**Goal:** the white-space grid becomes a headline feature in all three cockpits. Every cell is either a product the client really holds, or a white-space opportunity with a real score, a real reason, a real dollar value and a one-click CRM action. Nothing is fixture data. Where data is missing, we generate it and query it.

## What exists today (verified live, 2026-11-05)

| Need in the grid | Source | State |
|---|---|---|
| **Owned products** | FSC `FinServ__FinancialAccount__c`, using the product **Name** (the `Type` picklist is too coarse) | Retail books have a real ladder. Sarah Smith: 7,306 checking, 2,122 savings, 1,347 auto, 844 mortgage, 542 personal loan, 182 HELOC. Justin Chen is similar. The wealth books (Adam Watson, Vince West, Kim Johnson) hold Premier checking, brokerage, Roth IRA, jumbo mortgage and HELOC. Allen Carter's commercial book holds business checking, analyzed checking, CRE, term, SBA and treasury. **Cumulus credit cards: ~0 org-wide. Insurance: none.** Jose Sifontes's book holds 69 FAs in total. |
| **Products held at a competitor** (the strongest "why") | `BT_Plaid_Held_Away__dlm` (latest month) | Rich. Brokerage 7.3K clients, checking 8.3K, savings 7K, IRA 5.9K, credit card 5.4K, 401k 3.2K, robo 3K, mortgage 2.9K, auto loan 3.2K, LOC 1.2K. Business: business checking 3.6K, commercial card 1.7K, commercial loan 1.1K, sweep 330. |
| **Propensity score + $ value** | `Offer_Eligibility_Model__dlm` (Databricks), plus `BT_Offer_Eligibility__dlm` (Snowflake, business) | It has per-client, per-product `Conversion_Probability__c`, `Value__c`, `Expected_Value_Uplift__c`, rank and channels. **Problems:** (a) it ignores holdings, because CHK-ACQ is offered to 100% of existing checking holders; (b) eligibility is a flat ~50% for every product; (c) a single run dated 2026-08-12; (d) about 25K MDM clients, mostly in the retail books; the wealth and commercial books are barely scored. |
| **Context signals** | Already wired in `_shared` | CoreLogic home equity → HELOC; Claritas life stage → mortgage / first-time homebuyer; web engagement (product pages browsed) → any; large inflows → savings / investing; MoneyGuidePro plan gaps → wealth; UserGems liquidity / job change → rollover / managed; Harmonic funding / Demandbase intent → treasury / LOC. |
| **Action** | `CrmWriteRest` | Task, meeting, email and lead writes exist today. There's no Opportunity create yet. |

**Conclusion:** owned cells and reasons can be real **today**. Scores need a holdings-aware model that covers every book, and two product lines need holdings generated.

## Design

### Columns per persona (products the bank sells; each maps to real holdings + held-away + model codes)

| Retail | Wealth | Commercial |
|---|---|---|
| Checking · Savings · Credit Card · Auto Loan · Mortgage · HELOC · Personal Loan · Investing (Brokerage/IRA) | Premier Checking · High-Yield Cash · Managed Account · Roth/IRA · 401k Rollover · Jumbo Mortgage · HELOC | Business Checking · Treasury (ACH/RDC/Positive Pay) · Sweep · Commercial Card · Line of Credit · Term Loan · CRE · Equipment/SBA |

A single mapping table (`COLUMNS` in `_shared/src/data/whitespace.ts`) holds, for each persona column, the FSC name patterns, the Plaid `account_type` values and the offer-model action codes.

### Cell rules
- **Owned:** the client holds a matching FSC FinancialAccount (status not Closed). Owned always wins over the model.
- **White space:** not owned. The cell shows:
  - **Score (0–100):** the model's `Conversion_Probability__c` for that product. No client-side formula, so the number is the model's.
  - **Reason:** the strongest real signal, in priority order:
    1. Held at a competitor (Plaid): "Auto loan at Chase · $18.4K balance"
    2. Asset/property signal (CoreLogic equity, large inflow)
    3. Life-stage or life event (Claritas, UserGems)
    4. Product-page browsing (web engagement)
    5. Model only: "Model rank 2 of 10"
  - **Est. value:** the model's `Expected_Value_Uplift__c`, or `Value__c` when there's no uplift figure.
  - **Action:** a channel-aware verb from `Recommended_Channels__c` plus the product, such as "Book rate-lock consult" or "Send card pre-approval".
- **No score and no signal:** a plain empty cell, never an invented tint.

### Rows
The top 12 clients in the signed-in banker's book (view-as aware), ranked by total white-space expected value. Clicking a row header opens the 360. Clicking a cell or the detail row runs the action.

### Close the loop
- "Make it happen" writes a **real Opportunity**: product, amount = est. value, stage Prospecting, plus a note with the reason. This adds `POST /crm/opportunity` to `CrmWriteRest`.
- Opening a matching FA flips the cell to owned on the next load, because holdings are live.
- A grid header shows "N opportunities · $X est. value · M won in 30d". The won count comes from Opportunities created via the grid (tagged by `LeadSource = 'Cross-sell grid'`) that reached Closed Won.

## Data generated (shipped 2026-11-05)

**No new Snowflake table was needed.** The gap was the model's coverage, not the shape of the data. It was closed by extending the existing generator:

1. **`OFFER_ELIGIBILITY` v2** (`Snowflake_Offer_Eligibility/procedures/sp_generate_offer_eligibility.sql`) — the existing SP was rewritten to score **every** book: retail, wealth and business, all keyed to the Salesforce Account Id. It is **holdings-aware**: a product the client already holds gets no row. It uses real inputs: CRM holdings, Plaid held-away balances, Claritas life stage and income, CoreLogic equity, and FICO.
   - The run produced 440,070 rows, after the generated holdings were loaded and excluded (a backup clone is `OFFER_ELIGIBILITY_BAK_20261105`).
   - It already flows zero-copy into `BT_Offer_Eligibility__dlm`, so no stream or DMO work and no full refresh were needed.
   - The new codes are HEL-ACQ, PL-ACQ, INV-ACQ, PCHK-ACQ, WM-CASH, IRA-ROL, MTG-JMB and BIZ-CARD.
   - The Databricks `Offer_Eligibility_Model__dlm` is no longer read anywhere in `_shared`.
   - *Deferred:* the 6-month score backfill and the "score moved" trend.
2. **CRM holdings gaps** (`scripts/crosssell/`; the runbook is in its README). Loaded 2026-11-05:
   - 5,226 Cumulus consumer cards (Cash Rewards / Travel Points / Secured), for clients whose profile carries a card and who hold none elsewhere.
   - 297 Cumulus Corporate Cards in Allen Carter's book.
   - 5,526 `FinServ__Card__c` plastics, one per new card account.
   - All of these are mirrored into Snowflake `FINANCIAL_TRANSACTION_ACCOUNTS`, so the daily generator now produces card spend. The SP was rerun, and owned cards dropped out of the white space.
   - **Correction:** Jose Sifontes's "commercial book" is 5,071 households; he's the integration owner. Its ladder was therefore not a real gap. Only his 16 real businesses got holdings.
3. **Outcome history:** 168 Closed Won Opportunities with `LeadSource = 'Cross-sell grid'`, built from the new accounts opened in the last 60 days. "Won in 30d" per banker: Sarah 31, Justin 30, Vince 8, Allen 7, Kim 6, Adam 6.
4. **Insurance/annuity: dropped.** The column was removed rather than faked.

## Build order

| # | Work | Ships | Depends on |
|---|---|---|---|
| A ✅ | `COLUMNS` mapping + `fetchWhitespace(persona, ownerId)` in `_shared`: FSC holdings (GraphQL, name-pattern match) + Plaid held-away + existing signals. Score/value from the **current** offer model where present; otherwise the cell shows the reason with no score. Wire Retail, Wealth and Commercial; delete `MOCK_*`; `data` becomes required. | Real owned cells + real reasons in all 3 cockpits now | none |
| B ✅ | `CrmWriteRest` `POST /crm/opportunity` + grid actions → real Opportunity / Task / Meeting; header stats | Insight → action loop | A |
| C ✅ | Extend `OFFER_ELIGIBILITY` SP to all books + holdings-aware (no new table); backfill deferred | Holdings-aware scores for every book, with trend | none (parallel with A) |
| D ✅ | Cumulus consumer + corporate cards + plastics, FTA mirror, rescore | Full-width columns, no artificially empty product lines | none (parallel) |
| E ✅ | Outcome backfill + "won in 30d" | Credible results story for demos | B |

Each step builds the affected bundles and deploys `dist/` (+ Apex). The live browser check is the verification.

## Decisions
- Wealth Insurance/Annuity column: **dropped** (2026-11-05).
- Databricks offer model: **no longer read**. `BT_Offer_Eligibility__dlm` is the single holdings-aware source.
