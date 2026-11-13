# Wealth capital and intelligence visual pass

This is the standalone Atlas demo, not a Salesforce deployment. Native query captures and independent aggregates remain authoritative. All proposals stay in browser session storage. Retail scenes and production bridges are unchanged.

The approved flowing capital map and household observatory were restored in the subsequent additive correction; see `WEALTH_RETAINED_DESIGN.md`. Capital & Acquisition now opens the hybrid Capital paths, with all analytical modes below retained.

## Capability-to-view acceptance map

| Current-app capability | Atlas location | Design and interaction |
| --- | --- | --- |
| Held-away opportunities | Today pulse; Capital & acquisition → Held-away opportunities | Institution/balance landscape, exact household evidence and outreach; independent investable total preserved. |
| Outside digital platforms | Held-away opportunities | Separate crypto/robo observation cards; no conflation with investable totals or bank flows. |
| Native product white space | Capital & acquisition → White-space heat map | Six captured households × seven native products; owned, scored and absent states; product lens, household search, actual monthly history, exact Account/product proposal. Mobile reflows; no sideways customer scrolling. |
| Existing capital map | Capital & Acquisition → Capital paths | Retained household capital diagram, eligibility evidence, product selection, rising/falling source lenses and source-computed history. |
| Leads and referrals | Acquisition → Leads & introductions | CRM acquisition desk and native statuses; warm directed graph introductions are separate from Leads; exact source/target preserved. |
| Business-owner clients | Acquisition → Business owners | Source returns zero owner-client rows. Honest zero state beside separate business-to-Wealth handoffs, including broader independent 287/169 prospect aggregates. These are not 287 existing Wealth owner-clients. |
| Wealth upgrade prospects | Acquisition → Wealth upgrade prospects | Wealth-band cards, source life stage and two propensity tracks; independent 467/23/43 population counts distinct from five sampled rows. |
| Net flows | Today pulse; Intelligence → Liquidity & net flows | Eight completed source weeks, signed zero baseline, selectable credit/debit/account/transaction detail. Separate from gross trades and outside monthly activity. |
| Plan health | Intelligence → Plan health; Review horizon | Source tier composition and exact-account handoff into review preparation; due and stale counts overlap success tiers. |
| Concentration risk | Intelligence → Concentration | Clickable proportional issuer landscape plus holdings, source threshold and household position context. Issuer area denominator is only four shown exposures, not total AUM. |
| Trading activity pulse | Intelligence → Trading pulse | Nine actual source weeks, confirmed gross USD buys/sells, execution count, actual last source date and exact net-seller evidence. Latest trade week may be partial. |
| Liquidity moments | Intelligence → Liquidity & net flows | Exact observed refund/inflow; no assumption of investable proceeds. Career feed currently returns zero. |
| Relationship and service signals | Intelligence → Relationship signals | Preserved screening changes, negative calls, inflows, career and marketing lenses with source actions. |
| Pipeline | Pipeline | Rebuilt by wealth-studio: stage/value map, dated deal scatter, search/stage filter, exact selected opportunity and local follow-up. |
| Life events and CRM goals | Plans & goals | Rebuilt by wealth-studio: compact calendar, milestone illustrations and goal funding stories. Contact and FinancialPlan IDs remain exact. |
| Review preparation | Review horizon | Rebuilt by wealth-studio: planning composition, dated risk horizon, bounded household selector, review folio and source-bound proposed meeting. |
| Tasks, meetings, cases, drafts | My workbench | Rebuilt by wealth-studio: work folio, selectable original commitments, native case status lanes, local proposal review/edit. |
| Admin and navigation | Persistent top shell | View As, four-object search/full search route, waffle, notifications/tasks, avatar/config/setup/Data Cloud and display preferences retained. |

## Source and interaction boundaries

- User-facing money distinguishes model expected value, CRM opportunity amount, external balance, financial-account balance, source holdings value and bank net flow.
- An owned product suppresses acquisition even if a score exists. Missing score does not establish ownership. Unranked eligibility remains reviewable without a new Opportunity CTA.
- Opportunity proposal amount remains user-reviewed and blank initially; it is never copied from model EV.
- The captured cohort contains six households although the native query permits twelve. No filler households were added.
- Introduction proposals retain both edge endpoints, not only a target ID; reassignment uses the existing provenance sanitizer.
- Plan-provider totals are independent from CRM goals. A captured provider Draft does not establish an existing CRM FinancialPlan or permit borrowing another household’s goal scope.
- No new live queries, CRM writes, orders, deployments or backend changes are part of this pass.

## Validation

`tests/wealth-capital-studio.browser.cjs` checks 44 responsive scenes (1512/1024/768/390), exact offer proposal context, selection/reload, owned-product suppression, search/product filtering, actual-week flow inspector, exact-review routing, business-owner zero and introduction workflow. It records page exceptions and network writes, and produces local screenshots under `output/playwright/wealth-capital-studio/`.

See `WEALTH_STUDIO.md`, `COMMERCIAL_STUDIO.md` and `VISUAL_PARITY_REVIEW.md` for the other scenes and screenshot critique.
