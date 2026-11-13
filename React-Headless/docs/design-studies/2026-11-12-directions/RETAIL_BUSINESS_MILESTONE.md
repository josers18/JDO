# Retail Atlas — business development milestone

Implemented November 13, 2026, on `design/retail-atlas-gap-closure`. Standalone mock only; production bundles, Apex and org records are unchanged.

Open [Prospecting](http://127.0.0.1:5187/docs/design-studies/2026-11-12-directions/workspace.html?direction=atlas&persona=retail&page=prospecting&v=retail-business-11) or [Growth](http://127.0.0.1:5187/docs/design-studies/2026-11-12-directions/workspace.html?direction=atlas&persona=retail&page=growth&v=retail-business-11).

## Workflows

- Prospecting keeps CRM Leads/referrals and suggested introductions in separate modes. Introduction worklists show the connecting customer, outside-book target, discovered date, directed graph confidence and assignment state. Private preparation carries into an Account-linked task to the connecting customer or a reviewed, prefilled new Lead proposal. Graph targets never enter the owned-book directory through the introduction source.
- Lead forms and Workbench editing preserve source, status, email, names, company and AnnualRevenue, including recorded legacy picklist values. AnnualRevenue describes annual company revenue, not banking revenue or opportunity value. Blank and zero stay distinct. A valid new Lead proposal requires reviewed last name/company, not a pre-existing Lead or Account ID.
- Growth retains the original needs explorer and life-stage rail, and adds native coverage, book movers, and home/investing needs. Four modes share the same workspace. Coverage has twelve customers including three reserved card holders, eight product columns, owned cells and exact account/product evidence. Small screens switch four product columns at a time; no horizontal customer strip.
- Book movers use independent score-point and expected-value changes from actual history. Evidence includes recommended channels, model rank, held-away reason, real monthly observations and captured open-opportunity state. Eligible proposals preserve exact product/Account and native Cross-sell grid source; the banker reviews opportunity amount.
- Home/investing needs add equity/refinance, mortgage planning and investing readiness, with four cards per page. Propensity scores are distinguished from conversion probabilities. Renters and unknown housing do not receive property-equity claims.
- Book-level cross-sell outcomes remain independent of selected rows, cohorts and local drafts. The capture has **0 open / 3 Closed Won in 30 days**. Details show actual records. Missing aggregates render unavailable, never a fabricated zero.

## Capture and source bounds

Read-only capture verified org `00Dam00000Uo32qEAB`, Cumulus Financial Services, and Kim Johnson's book (`005am000003PbFAAA0`) on November 13. Exact source queries are committed in `tests/retail-business-capture.sql` and `.soql`; response fixtures are in `retail-business-data.js`.

| Source | Captured evidence and limits |
|---|---|
| Relationship graph | 6 directed REFERRAL suggestions from the **synthetic demo graph**. Confidence describes an edge; it is neither consent, an employee referral identity nor a conversion prediction. Targets are outside Kim's book and may already have another banker. Missing contact details stay missing. |
| Eligibility coverage | 93 value-ranked source rows and 105 holder-source rows; native selector reserves 3 holder customers **within 12 total**, not 15. Card candidates follow the current app's first-200 holding window, not the full holder population. Current run date was not captured. |
| Book movers | Up to 50 rows per direction, six-month window, ≥2 score points or ≥$250 EV movement. Native processing excludes grid IDs, takes 25, then suppresses known-owned cells. Cohort filters operate on this bounded sample, not a fresh complete-cohort ranking. |
| History | 987 actual monthly rows for selected grid/product and mover/product pairs. No interpolated history or invented current dates. Some unselected mover pairs have no history capture. |
| Holdings / outside accounts | 47 CRM financial accounts for the selected 62-customer set; bounded lookup completed. 179 matching linked-account rows. Personal ownership excludes closed and business products. Held-away reason chooses the largest matching positive balance; it does not imply transferable funds. |
| Cross-sell outcomes | Separate owner-scoped CRM aggregates and matching record queries, LeadSource = Cross-sell grid. Won since October 14. Zero open is actual source evidence. Local proposals never increment source counters. |
| Property | 8 owner-only high-propensity equity/refinance examples; book aggregate 945 owners, $986,001,193 equity, 80 refinance signals; CoreLogic quarter October 1. Missing LTV/rates remain unavailable. Equity is not approved credit. |
| Mortgage | 21 native candidate rows, three selected housing situations, excluding equity-feed customers. Missing CoreLogic is explicitly unknown; prefer a confirmed renter in the first-home slot when one is captured. |
| Investing / mix | 12 propensity ≥70 examples; five stage aggregates. Propensity is readiness, not conversion probability or confirmed intent. |
| Lead metadata | Fresh active source values and current app's five supported manual statuses, with the selected recorded legacy values preserved. No conversion action is offered. Existing seven selected Leads remain unchanged. |

Source references: shared `relationshipGraph.ts`, `whitespace.ts`, `lifeStageMix.ts`, `propertySignals.ts`, `LeadModal.tsx`, `crmWriteClient.ts`, and `types.ts`. Source-specific rules remain separate rather than substituting a generic fabricated scoring model.

## Verification

All 31 selector tests passed (16 business, 6 customer-context, 9 priorities). The business, customer-context and Today browser suites passed without page errors or network writes.

`tests/retail-business.test.cjs` covers graph/Lead identity, missing contact names, zero/blank revenue, twelve-row/three-holder selection, mover limits and ownership, held-away identity, real history, renter/unknown gates, mortgage exclusion, exact existing-opportunity keys, true zero outcomes, missing aggregates and first-save provenance invalidation.

`tests/retail-business.browser.cjs` exercises introduction → Lead → Workbench edit/review; existing Lead source/value preservation; introduction task reassignment before first save; mover → product-specific opportunity; falling offers; reserved holders; confirmed-renter needs; source-unavailable summaries; four widths (1512/1024/768/390); and Wealth/Commercial isolation. Assertions reject page errors, horizontal page overflow and network writes. Existing customer-context and Today browser suites remain regression gates. Screenshots are local artifacts under `output/playwright/retail-business/` and are not committed.

Review findings resolved: invalidate hidden offer/introduction IDs when an Account changes before the first save; render missing source aggregates as unavailable. Mobile needs pagination and a unified Growth selector reduce scroll and ambiguous active views.

## Remaining integration work

All actions remain session-local proposals. Salesforce inserts/updates, real duplicate checking, current authorization/owner validation, consent coordination, fresh source queries and successful-write refetch belong to production migration. The mock preserves existing-open-opportunity matching by exact Account and native product-name prefix, an inherited heuristic rather than a unique offer relationship. Actual capture has no open grid opportunity; matching behavior is verified with synthetic selector inputs, not presented as a captured record.

Milestone 4 remains next: coherent Retail customer financial/engagement/notebook/campaign context and execution depth. Route/view persistence and production authentication remain later migration work.
