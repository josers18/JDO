# Wealth Atlas gap rerun — November 13, 2026

## Outcome

The previously identified customer-detail design gaps are represented in Atlas. The rerun did find a substantive Life & Goals usability/content gap: month-scoped stories made the page appear empty, and provider financial plans were absent from that page. This milestone rebuilds it around a calendar, all-date illustrated milestones, selectable provider planning diagrams and actual CRM goal-funding scenes. It also fixes two malformed saved-state cases that could blank Relationships or the review packet.

This is **captured-data design coverage**, not production execution parity. No production React bundle, Apex, configuration, permissions or deployed app was changed. All proposed CRM actions remain local. All 22 authenticated production acceptance gates remain pending in [WEALTH_PRODUCTION_ACCEPTANCE.md](WEALTH_PRODUCTION_ACCEPTANCE.md).

## Comparison scope

Compared the current Atlas workspace and existing closure inventory against `force-app/main/default/uiBundles/ReactWealth/src/home/homeDataReal.ts`, customer `Full360Tabs.tsx`, `full360DataReal.ts`, `DetailsPanel.tsx`, `TearsheetBuilder.tsx`, and the shared shell/source/action contracts documented in this repository. Existing unit and browser suites exercise the underlying native-source replay and record identity contracts. This is a repository/captured-browser comparison, supplemented by fresh read-only CRM queries for Life & Goals; it is not a new authenticated walkthrough of every original app route.

Fresh CRM queries ran against verified Cumulus org `00Dam00000Uo32qEAB` using owner `005am000003PbCLAA0`. Each query returned totalCount equal to returned rows with hasNextPage=false: 31 PersonLifeEvents, four FinancialGoals and two FinancialPlans. Exact related Contact/Account/FinancialPlan links and owner fields are retained in `wealth-life-data.js`, together with queries, capture date and pagination evidence. All related Accounts are already among the 73 captured households.

## Current design coverage

| Area | Rerun result |
| --- | --- |
| Today / book overview | Book-at-a-glance hero, immediate outreach, portfolio pulse, Wealth priorities, held-away, pipeline and net-flow context are represented. |
| Relationships / customer detail | Searchable 73-household finder, book-member landscape, comparison, inspector and household context retained. Customer care/history, distinct prediction inputs, property hazards/mortgage/HELOC, money/transactions/trades, campaigns/notes/screening and review packet are represented where actual captured evidence exists. |
| Pipeline | Wealth-specific interactive opportunity plot, stage/search filtering and exact-deal follow-up proposals retained. |
| Life, plans & goals | **Gap found and addressed this pass.** Compact grid with adjacent agenda and planning checkpoints; all31 historical events reachable independent of month; three illustrated stories initially with more; 73 provider plans in a searchable/selectable planning workspace; all four CRM goals with active-first funding scenes. Dedicated lenses reduce navigation through the overview. |
| Capital & Acquisition | Approved curved capital paths retained with prior functional controls, monthly history, product selection, movers, known-owned guards and exact-source proposals. White-space probabilities, outside assets, leads/referrals, business-client and Wealth-upgrade source views remain available. Successful-empty business-owner evidence remains empty. |
| Intelligence | Approved plan orbits, concentration sculpture and liquidity transition retained alongside plan/concentration/liquidity/trading/relationship analytics. Model probabilities, bank net flow and execution samples remain distinct. |
| Review Horizon / Workbench | Interactive plan-risk/review views and source Task/Event/Case work remain; original record operations preserve exact identity and dates through local proposals. |
| Review packet / return context | Eight configurable sections, tone, questions, source-based preview, real local HTML download and printable view retained. Return links restore source filters and selections. Malformed or legacy saved packet/finder configurations now recover instead of blanking the page. |
| Shared shell / administration | View As, multi-object search, launcher, tasks/notifications and avatar/admin/Setup/Data Cloud Setup entry points remain represented and covered by shell checks. Live menu contents and authorization remain runtime acceptance work. |

## What is genuinely still missing

| Priority | Gap | Proposed next step |
| --- | --- | --- |
| P1 | Atlas is still a standalone capture, with a 73-household directory rather than live retrieval of the full advisor book. Source freshness/retry and complete cursor navigation are not demonstrated by populated pages. | Integrate Atlas behind a reversible production layout entry using the existing fetchers; implement full-book cursor/search and independent aggregates, owner-scoped cancellation/cache invalidation and explicit source states. |
| P1 | CRM proposals do not create/update records, send email or book appointments. Live receipts, uncertain writes and refetch are unverified. | Connect explicit reviewed actions to existing CRM clients, preserve source IDs/assignee, validate receipts and handle uncertain outcomes before refreshing. |
| P1 | Live Agentforce grounding/agent switching, server configuration/model catalog and theme persistence are not exercised by this mock. | Retain the existing production clients and ACC re-embed lifecycle when adding the Atlas shell. Verify with authenticated sessions and per-user settings. |
| P1 | Ordinary/restricted-user sharing, FLS/CRUD, Data360 access and deployment/rollback have not passed Atlas acceptance. | Execute the 22 documented production gates against the integrated build and capture ordinary/restricted-user evidence. |
| Source limitation | All31 actual life events are historical (latest September1,2026); four actual CRM goals belong to Julie and two CRM plans are available. The73 provider models are a separate source and cannot supply invented named goals or appointments. | Keep genuine dates/statuses. Add future moments/goals through authorized CRM workflows when real records exist. |
| Source limitation | Prediction/attrition detail is available for one captured household; property for seven; deeper transactions, interactions and notes have bounded coverage. Customer free-text verbatims, causal feature weights/model run period and verified family/beneficiary roles are not supplied. | Obtain the missing source contracts/records or show unavailable states. Never borrow another customer's detail or label input context as causal explanation. |

Two original surfaces also remain limited in their own source: `DetailsPanel.tsx` saves edits into React state, and `TearsheetBuilder.tsx` generates a deterministic preview after a timer. They do not establish live profile-write or AI/PDF capabilities to reproduce. Atlas now provides a configurable source-based working paper and actual local HTML/print output; it does not claim AI generation or server document persistence.

## Verification

Fresh checks during this rerun:

- **112 Node source/identity/contract tests passed**, including three new complete-query/exact-link/provider-vs-CRM tests. This count spans the study suite; it is not a production test count.
- Life studio browser: source counts, all31 moments reachable, 73 provider plans, four goals, month/day isolation, search/reset, Draft handling, selected-plan reload, exact native forms and an exact PersonLifeEvent proposal. Explicit empty/unavailable CRM and provider source tests. Responsive checks at1512/1024/768/390.
- Wealth studio regression: exact opportunity and milestone proposals, calendar/reset, original Event timestamps, cases/local proposal library and four widths.
- Native Wealth journeys, all14 final-review source-edge cases, retained analytics at16 layouts, review packets at8 scenes, and10 malformed/legacy saved-state configurations passed.
- The customer studio (28 scenes), source return-context and shared-shell suites passed earlier in this same rerun. Cross-persona visual parity covers48 scenes and88 interactions after updating the calendar control selectors for its intentional redesign.
- Browser runs reported no page errors or network writes. Screenshots/results are under `output/playwright/wealth-life-studio`, `wealth-studio`, `wealth-retained-scenes`, `wealth-review-packet`, and `atlas-visual-parity`. Desktop and phone Life screenshots were visually inspected; page overflow checks supplement that inspection.

The remaining work is principally production integration and genuine source availability. This rerun does not certify that every possible design improvement or every runtime/security condition is complete.
