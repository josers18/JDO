# Retail Atlas — Intelligence and relationship watch

Implemented November 13, 2026, on `design/retail-atlas-gap-closure`. Standalone design study only: no production bundle/Apex edits, bank-record writes or deployment.

[Open Intelligence](http://127.0.0.1:5187/docs/design-studies/2026-11-12-directions/workspace.html?direction=atlas&persona=retail&page=intelligence&v=retail-watch-13) · [Open Relationship health](http://127.0.0.1:5187/docs/design-studies/2026-11-12-directions/workspace.html?direction=atlas&persona=retail&page=health&v=retail-watch-13).

## Workflows

- Intelligence now opens as a source-filtered signal inbox: screening changes, declining call tone, qualifying inflows, marketing engagement and employer-departure liquidity signals. Search and eight-row pages keep the worklist usable. Selected evidence preserves the customer, source date, reason and source-specific fields. Preparation is private to this tab; a follow-up becomes a local Account-linked task proposal.
- Recognized visitors remains an independent Intelligence view with the existing browsing search, product filters and evidence. Existing Today/other links that request browsing open that view rather than losing their destination in the new inbox.
- Today gains a compact, independent source-inbox band below ranked work. It links selected screening, call and cash evidence into the same customer/action flow. This supplements the existing first-move/queue behavior; it does not invent a combined score or silently rerank the prior production-derived queue.
- Relationship overview and engagement show exact-Account source links. Screening shows captured change evidence when available, preserving a prior rating separately from the current source rating. A first screening differs from a changed rating with missing prior evidence.
- Health preserves the Portfolio pulse, financial-stress and outside-deposit views. New modes add Property exposure, Engagement watch and Service watch.
- Property exposure shows disjoint flood-only/both/wildfire-only counts and source property/mortgage values. Click a cohort or a keyboard-accessible point to inspect the customer. The plot uses actual value and wildfire index, not fabricated geography. Missing coordinates are omitted from the plot and retained as unavailable in the list.
- Engagement watch combines independent weekly Gong aggregate counts and latest-CSAT context with a bounded call-profile worklist. A source deal-risk index, CSAT response and credit/compliance determination remain distinct concepts.
- Service watch keeps CRM and ServiceNow in separate lanes. External references stay external; they cannot become Salesforce Case IDs. Creation age is labeled without declaring an SLA breach. The CRM button explicitly opens the service desk even after a different Workbench collection was used.

## Capture and source limits

Org verified again: Cumulus Financial Services `00Dam00000Uo32qEAB`, banker Kim Johnson `005am000003PbFAAA0`. Exact read-only queries are in `tests/retail-watch-capture.sql` and `.soql`; fixtures and per-source scope are in `retail-watch-data.js`.

Data Cloud queries use the current app's book filter against ingested Account ownership. All customer IDs used for source detail were checked through CRM in batches of at most 50 and resolved to Kim-owned Accounts. A supplemental AML projection capture retained change type; 64 Account names were checked across the initial capture and its refinement. Names never establish associations. Duplicate display names remain separate IDs.

| Source | Captured evidence / bounds |
|---|---|
| WorldCheck changes | Eight severity-ordered escalation rows from native `amlChangeSql`, plus explicit `change_since_last_run` projection. Changed→Medium with no prior row follows the native COALESCE rule; New→Medium is excluded. Null flag evidence stays unavailable. This is not the complete screening population. Ties within severity have no stable native tiebreaker, so capture refinement can change which tied examples appear. |
| Gong | Eight negative/very-negative, declining call profiles at the latest global source week; added period/trend/last-call projections. Eight actual book-level weekly counts; latest November 9 has 28 matched profiles. Detail row count is not the aggregate count. Source next-call dates are shown as recorded, never invented appointments. |
| Inflows | Four qualifying credits returned by the native seven-day bonus/tax-refund query, at least $2,000, largest per Account, up to eight. Amounts retain cents and are not forecasts of investable balances. |
| Marketing engagement | Eight native selected customer/campaign rows, using the book's latest-click-anchored 30-day window, campaign diversity ordering and exclusion of recorded unsubscribers. Counts are events, not conversions or contact permission. This source is **Marketing_Engagements**, distinct from **Marketing_Campaigns** queried for customer history in Milestone 4; the successful empty result there does not imply this feed is empty. |
| UserGems liquidity | Eight selected employer-departure rows with a liquidity flag in the native 180-day window; independent matched-book aggregate is ten. The person Account ID is the association; reported external person/employer fields do not overwrite CRM identity. Opportunity/risk scores are not displayed as conversion probabilities. |
| Property exposure | Native owner-only latest-quarter aggregate: 331 profiles, 180 flood indicators, 168 wildfire indicators, 17 both. Disjoint derived cohorts: 163 flood-only, 17 both, 151 wildfire-only. Estimated property value $496,858,375; mortgage balance $112,800,901. These are source exposure amounts, not credit limits or losses. |
| Property examples | Native top-six hazard rows retained as evidence; an additional owner-scoped source query captures up to four highest-value profiles in each disjoint hazard cohort (12 total). No complete-book ranking is claimed for the plotted worklist. Only complete numeric value/index pairs become plotted points; a real zero remains valid. |
| CSAT context | Per-customer latest-response query: 1,312 matched profiles, 852 with CSAT below 70, latest source period October 1. This is the matched Data Cloud population, not the CRM book size. No portfolio NPS or loan-risk measure is inferred. |
| ServiceNow | Native open-status aggregate: 26 open/in_progress, 16 created more than 30 days ago. Twelve oldest open external detail records captured. Query explicitly filters `ssot__DataSourceObjectId__c='service_now_cases'`; null IsClosed is not treated as the status definition. `SN-HOME-*` references are not Salesforce IDs. |
| CRM service | Independent current-Account-owner CRM aggregate: 223 open cases. CRM and external totals are not added into a deduplicated count. Existing CRM service detail remains its bounded capture. |
| Source dates | Latest book record dates for marketing, property, Gong, AML and ServiceNow. They are record-date evidence, not ingestion-success checks. ServiceNow synchronization against the zero-copy source table was not checked. No live-refresh or connector-health claim is made. |

Native contracts inspected: shared `transactionSignals.ts`, `campaignTouches.ts`, `jobChangeSignals.ts`, `propertySignals.ts`, `serviceDrag.ts`, `dataCloudClient.ts`, `dataFreshness.ts`; Retail `homeDataReal.ts`. The helper script used local TypeScript transpilation to extract actual query functions. Production files were not changed. Data Cloud results completed as ResultsProduced with returned rows matching result counts. SQL LIMITs are intentional sampling limits, not proof of whole-source completeness.

## Identity, source state and execution boundaries

Signals key on family, exact Account, source date and available source reference. Customer lookup requires the captured banker owner. A single customer can have multiple different signals; equal names do not merge records. Task proposals carry `signalKey`, `signalAccountId`, `signalFamily`, `signalDate`, `sourceSystem` and optional external reference. Reassigning the Account clears mismatched signal provenance on the first save and later Workbench edits. No external case reference becomes a Task/Case update ID or a Contact/Lead link.

Evidence dates are compared with the pinned November 13 capture date. Daily, weekly and source-window allowances label current, historical, future-dated and unavailable observations. An observation's date does not prove customer intent, consent, screening clearance or connector freshness. Missing captures remain unavailable; a successful empty query is separate from both unavailable and zero-valued aggregate evidence.

All follow-ups remain local proposals. Real source refresh, permission and identity validation, connector synchronization, compliance workflow, CRM writes and successful-write refetch remain production integration work. The existing action bridge remains the intended execution boundary; this milestone does not bypass it or simulate successful bank actions.

## Verification and review

52 selector/contract tests passed across the five Retail milestones, including ten new signal/watch tests. New checks cover exact IDs/owners and duplicate names, native AML transitions, source-null flags, date state, property overlap, missing coordinates/zero values, source-unavailable versus successful-empty states, source aggregate zero and provenance cleanup.

All five browser suites passed: watch, Today priorities, customer depth, business development and prior customer-offer continuity. The new suite covers source filters/search/empty states; preparation → exact-account task → Workbench; first-save and later reassignment cleanup; Today and customer/screening evidence; browsing preservation; property cohort/keyboard drill-in and null coordinates; Gong; CRM service navigation after Local drafts; ServiceNow reference isolation; historical/missing-source states; four widths (1512/1024/768/390); and Wealth/Commercial isolation. No page errors or network writes occurred. Screenshots under `output/playwright/retail-watch/` remain local artifacts.

Independent review findings fixed: omit null property coordinates rather than plot zeros; retain native Changed/New AML semantics; explicitly reset the Workbench destination for CRM service navigation. Missing/empty status labels remain visible on small screens. Source and scope notes are committed for later production acceptance work.

Next: Milestone 6, migration contracts and production-readiness acceptance planning. This is a separate planning step, not an implied production deployment.
