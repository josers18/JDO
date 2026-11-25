# Production apps → Atlas / Panorama gap analysis

Reviewed November 12, 2026. **The new mock improves navigation and visual working surfaces, but it is not yet a functional replacement for the three production apps.** Its largest content gaps are Customer 360 depth and persona-specific risk/intelligence coverage. Its largest implementation gaps are live data, existing CRM operations, authenticated AI, and configuration/theme parity.

## Evidence and confidence

This is a fresh **repository source audit**, compared with the actual current study files, supplemented by the [November 12 deployed-app review](../2026-11-11-cockpits/LIVE_APP_REVIEW.md). No new authenticated browser session, org query, CRM write, or deployment was performed for this analysis. Source presence proves an implementation exists, not that every endpoint or record is working in the deployed org today. The earlier deployed review had unsettled/loading Customer 360 tabs; their deep content was not fully runtime-verified.

The comparison target is `workspace.html` with Atlas/Panorama, including the latest persona workspaces and Workbench collections. The original `index.html` and Focus are earlier studies. The mock uses bounded captured records and session storage. A captured example, an empty sample, and a full live book are different states.

Priority meanings: **P0** = required for replacement parity; **P1** = next design expansion or depth needed; **P2** = useful new capability after parity. No parity percentage is claimed: the audit does not establish a complete denominator or runtime acceptance for every feature.

## What the mock already adds

| Addition | What it improves | Remaining boundary |
|---|---|---|
| Relationship landscape and comparison | Select relationships through a visual canvas; compare up to three accounts | Spokes connect records to the banker. They are not household, influence, or legal-entity relationships. |
| Pipeline plot and planning board | Inspect real captured amount/date/stage; explore a separate stage scenario | No actual stage update or forecast write. Current write bridge supports Opportunity creation, not Opportunity stage edits. |
| Life-event calendar and goal rings | See dates and funding progress without opening every record | Only captured events/goals; no full-book coverage or live edits. |
| Persona Growth / Intelligence / main Workbench | Retail needs/service, Wealth household/advisory, Commercial company/treasury/deal workflows | Several existing source feeds still lack a complete place in the design. |
| Task planning and service preparation | Local focus stages, notes, response checklists | Preparation state does not change the source Task or Case status. |
| Proposed meeting calendars | Select dates/times and display saved meeting drafts | No source appointments were captured. Availability, invitations, and event writes are not demonstrated. |
| Editable draft libraries | Review work, edit content, mark Working / Review / Ready | New browser-session workflow, not an existing server-backed draft or approval system. |

## Replacement parity gaps

| ID / priority | Current app evidence | New mock coverage / missing behavior | Proposal |
|---|---|---|---|
| G01 · P0 | Signed-in identity, View As, owner-scoped queries | Persona selects a fixed named capture owner; no signed-in identity or real book switch | Keep persona identity distinct from banker/book scope. Add an always-visible book selector with My book / View as, scope label, and refresh state. |
| G02 · P0 | Real KPI aggregates, Data 360 histories, weekly net flow, pipeline movement | Captured totals and selected statistics; no equivalent live persona vitals/history band | Add a readable persona performance strip with history and drill-ins. Preserve tile-vs-history source semantics and sample-vs-total labels. |
| G03 · P0 | Priority blender, severity/due-date ordering, deduplication, reserved third-party signal slot, Right Now and recommendation handlers | Selected signal stories and examples; no full production prioritization behavior | Feed a daily action queue from the existing blender. Include visible source/rationale and the existing Why, Quick View, Prep and action paths. |
| G04 · P0 | Global multi-object search, app launcher, notifications, user controls, Current/Cockpit preference | Relationship-only search, static identity, drafts utility; no equivalent utility controls or layout preference | Restore shared utilities in the new shell. Preserve current mode during migration; decide retirement explicitly after parity. |
| G05 · P0 | CRM task/event create, edit, completion, deletion, reassignment, related-record/contact references, event Show As and follow-up actions | Simplified review/create forms; local preparation stages and meeting drafts only | Put real operations in a selected-item inspector. Separate “Save task/event” from “Save preparation.” Preserve allowed fields, exact IDs, confirmation, success and failure feedback. |
| G06 · P0 | CRM email send, recipient lookup, case create, goal and life-event create/edit, lead create/edit, cross-sell Opportunity create | Eight local form types; fewer fields and no real writes, lookup, delete/completion or post-save refresh | Reuse existing clients and modal contracts. Add explicit final actions appropriate to each operation, source ID lookup, busy/error state, and success-only refetch. Do not imply case status updates are already supported. |
| G07 · P0 | Full cross-sell ranking, reserved holder rows, full-book mover queries, ownership and held-away reasons, open/won conversion counters | Selected accounts/offers/history and captured ownership; no equivalent whole-book coverage or conversion counters | Keep the new persona Growth canvas, with the complete source grid/explorer below it. Add book-wide movers and outcome tracking, retaining source thresholds and ownership semantics. |
| G08 · P0 | Authenticated Agentforce conversation client, four-agent switching; AI generation clients and existing configured action keys | Context panel, suggested questions and agent names; no generated response or actual session | Integrate the existing chat and generation paths. Preserve teardown/re-embed switching. Present generated results as editable work tied to the selected record and source context. |
| G09 · P0 | Brand theme library, logo/palette extraction, role colors, AI accent, Light/Dark, per-user active theme and full display scaling | One accent, limited reading-size preview and local preferences | Port the full existing configuration experience into an Atlas/Panorama theme studio. Test arbitrary customer brands and display sizes, not just the two default palettes. |
| G10 · P0 | Per-center model configuration, cached model catalog, refresh/debounce, org persistence | Four model-name fields and generation-parameter drafts | Retain actual catalog selectors, save/refresh states and shared persistence. Stored temperature/token values must not be presented as applied while Apex only applies model name. |
| G11 · P0 | GraphQL/Core vs Data Cloud bridge, platform basePath, authentication, FLS, async generations and source freshness | Standalone static files; no platform lifecycle, permission or production loading/error behavior | Implement in the existing React bundles and shared clients. Show source-level loading, unavailable, stale and retry states independently. Preserve full counts alongside bounded detail lists. |
| G12 · P0 | Existing routes, pinned selected workspace, explorer navigation and saved preferences | New eight-section navigation; some selections are transient; Workbench subview is not in the URL | Define route/deep-link mapping for sections, relationship tabs, selected records and Workbench collections. Preserve Back behavior and user-scoped preferences. |

## Customer 360 content gaps

The mock has Overview, Finances, Journey & goals, Engagement & service, Opportunities, Notes & tools, plus Commercial Company Intel. These destinations do not yet replace every leaf and contextual component in the current app.

| ID / priority | Missing or incomplete content | Recommended design |
|---|---|---|
| C01 · P0 | Detailed profile fields, identity/status indicators, complete existing financial spine | A compact persistent identity header plus a Profile drawer for contact, business and relationship details. Preserve field semantics without restoring a narrow dense sidebar. Profile editing needs a real write decision; see inherited limitations below. |
| C02 · P0 | Financial trades; complete transaction/financial-account coverage beyond selected samples | A Money workspace with account composition and a filterable activity ledger. Wealth gets a trade blotter with symbol, side, shares, value and date; use existing real fetchers. Preserve source limits/time windows and explicit load-more behavior if added. |
| C03 · P0 | Actual interaction history, call summaries, CSAT/NPS history and survey verbatims | A conversation timeline with channel filters, an adjacent satisfaction trend, and expandable source notes. Saved Gong evidence is not a replacement for the full interaction surface. |
| C04 · P0 | Meeting notes and KYC/WorldCheck summaries | A relationship notebook linking meetings, notes and next steps; a distinct screening drawer showing source/date/status and flags. Do not interpret “no captured row” as clear screening. |
| C05 · P0 | Contextual attrition/CSAT/product predictions and tab-specific Agentforce summaries | An optional evidence rail that changes with the selected workspace: account, transaction, trade, interaction, CSAT, opportunity, case or campaign. Show why, source date and action; do not conflate derived measures with trained model outputs. |
| C06 · P0 | Full case and campaign depth | Customer-level service history and campaign touch timeline, linked to the corresponding Workbench response or Growth opportunity. Current source-backed Cases content must remain reachable; no assumption of ServiceNow parity without confirming that source separately. |
| C07 · P1 | Tearsheet section selection, tone and prompt preview | A review-packet composer with selectable sections, preview and explicit output action. Reuse the readable paper preview. Prompt-service generation is a separate wiring task, not established incumbent behavior. |
| C08 · P1 | Property and provider-plan coverage across the actual book; complete selected-company provider content | Extend the current visual property, plan and Company Intel lenses to all supported records, preserving renter gates, provider periods, join keys and genuine empty results such as SEC no-match. |
| C09 · P1 | Customer-to-household/contact/company network | Add an actual relationship view only after identifying source-backed edges. Current new atlas is book navigation; current real fetcher also has empty network data and only a single-source unified-profile entry. A multi-org stitched household graph is not verified parity. |

## Persona intelligence gaps and proposed visual expansion

These are supported current-source modules/feeds or source-backed capabilities that the new design either omits or reduces to selected examples. Conditional production modules can be absent in a particular book without being absent from the product.

| Persona | Gap versus current source | Proposed experience | Priority |
|---|---|---|---|
| Retail | Deposit attrition and financial stress | **Relationship health:** selectable cohort bands for outflows, persistent stress and service friction; selected customer evidence and a service-first next step | P1 design / P0 parity |
| Retail | Book-level property risk and life-stage mix; limited browsing coverage | **Customer moments:** life-stage distribution leading into source-backed property/needs segments; retain homeowner gates and distinct hazard/propensity meanings | P1 design / P0 parity |
| Retail | Liquidity and full priority-feed coverage beyond the current three Intelligence lenses | Add the missing source lens and route eligible signals into the daily queue, retaining reserved-feed rules | P1 design / P0 parity |
| Wealth | Digital leakage, trading pulse, business owners and upgrade prospects | **Household opportunity desk:** separate lenses for outside platforms, actual trade activity, business-owner context and upgrade eligibility; each drives a household conversation | P1 design / P0 parity |
| Wealth | Full due-review and plan-risk cohorts, broader concentration/held-away coverage | **Review horizon:** a calendar of provider review dates, sortable review queue and selected household risk/capital context. Provider review dates remain distinct from booked meetings | P1 design / P0 parity |
| Commercial | Book-level Delinquency Watch, firmographic mix and market footprint | **Credit and coverage:** payment-band distribution, company drill-in where the source is joinable, and actual branch/market coverage view. The current D&B payment feed has account keys; preserve its book aggregate and distinguish it from the legacy non-joinable loan-delinquency dataset | P1 design / P0 parity |
| Commercial | Leadership departures, ESG/outlook changes and full intent/funding coverage | **Company change radar:** source-separated changes on a selected-company timeline; route the correct signal into the reserved daily-queue slot | P1 design / P0 parity |
| Commercial | Business-owner wealth handoffs and warm-introduction detail | A company-to-owner handoff panel in Growth, showing source-backed referrer/owner context and the existing lead/referral action | P1 design / P0 parity |
| All | AML changes, campaign-touch signals, ServiceNow service-drag context and full warm-introduction/referral context | Source-separated evidence in the daily queue and relationship timeline. Distinguish external service evidence from writable CRM Cases; preserve actual source IDs and scope | P0 |
| All | Full transaction-driven signals, source freshness and rationale behind recommendations | A consistent evidence inspector reached from every persona canvas, with source/date, observed change, scope and existing action choices | P0 |

## New behaviors that need a product contract

These are additions proposed by the mock, not just rewiring existing screens.

| Addition | Decision needed before production | Recommendation |
|---|---|---|
| Local drafts / readiness | Persistence, ownership, retention, supported draft types, concurrency and final action | Start with private per-user drafts. Ready means prepared, not approved. Keep save-draft distinct from Send/Create/Update; return the resulting CRM ID and refresh after a successful final action. Choose platform storage only after the draft contract is defined. |
| Preparation notes/checklists | Private vs shared; relationship/record association; cross-device behavior | Key by persona, user and exact source ID. Keep preparation metadata separate from CRM status. Offer intentional promotion into the existing task or note workflow. |
| Relationship association | Several mock forms retain a relationship name; dossier draft matching uses a name | Store AccountId and appropriate ContactId/WhatId/WhoId alongside display text. Do not join drafts to relationships by name; duplicate names exist. |
| Pipeline scenario board | Whether a drag is a private scenario or an actual stage change | Keep scenario planning explicit by default. Add an actual stage-update path only with a supported bridge/action and explicit save result; preserve the captured/live baseline. |
| Meeting planning | Timezone, linked people, event edits, invitations, conflict detection | First preserve current Event fields and write behavior. Label proposed slots honestly; conflict detection and external calendar sync are later capabilities unless a real integration is identified. |
| Comparison and relationship graph | What quantities and edges mean across unlike records | Compare equivalent metrics with date/scope context. Add source-backed entity edges separately from the book-navigation map. |

## Existing limitations discovered during the comparison

Do not turn old implementation gaps into new feature claims:

- **Profile edit persistence:** `DetailsPanel.tsx` holds edits in React component state; it does not call a record-write client. Preserve the field coverage, but real Account editing is a separate implementation task.
- **Tearsheet generation:** `TearsheetBuilder.tsx` builds a prompt preview and toggles generated content after a local timeout; its Generate handler does not invoke a prompt service. A real prompt-generated packet is an enhancement/fix, not verified current parity.
- **Relationship graph / unified identity:** the inspected real customer fetcher returns an empty network and one source-profile entry. The older inventory describes a broader target; it does not establish a working multi-org graph in these React apps.
- **Generation parameters:** current settings store temperature/max tokens, but the documented Apex binding only applies model name. Avoid implying model controls do more than the actual API path supports.
- **Runtime confidence:** the earlier live review encountered Customer 360 loading delays. Revalidate settled deep content and write/error flows before replacement acceptance.
- **Legacy mock/fallback code:** source includes representative/default and fallback paths. `PRODUCT.md` requires real values or honest unavailable states; visual migration should not preserve fabricated data simply because an old component renders it.

## Recommended sequence

1. **Complete the design coverage.** Add the Customer 360 profile/money/engagement/notebook/evidence surfaces and the persona Health / Review horizon / Credit and coverage lenses. Keep Atlas as the main clean composition and use Panorama's broader canvas where data benefits from width; both remain theme-compatible directions.
2. **Complete operational design.** Expand Workbench inspectors to cover existing task/event fields and actions, exact-ID relationship lookups, and visible busy/success/error states. Add a private-draft finalization flow. This is more valuable than another round of decorative boxes.
3. **Migrate a complete workflow in the current React architecture.** Reuse fetchers, CRM clients, queue logic, configuration and Agentforce. Keep old routes/mode available during the migration. Suggested first slice: Retail customer signal → relationship evidence → task/meeting action → refreshed Workbench. Then Wealth household review → packet/follow-up; Commercial company signal → deal/service action.
4. **Accept parity by journey and capability, not screenshot count.** Check each table row against current production, including conditional feeds and unavailable/error states. Verify full-book scope, real writes and refresh, all four agents, configuration persistence, arbitrary brand themes, display sizes, keyboard/mobile operation and platform routing.
5. **Add P2 capabilities after parity.** Team/shared preparation, cross-device draft collaboration, actual calendar availability/sync, influence graphs, richer scenario forecasting and output/export workflows should have their own source and persistence contracts.

### Next design pass I recommend

Produce three complete persona journeys rather than adding another shared dashboard:

- **Retail:** Relationship health → selected customer’s transaction/service story → recovery or needs conversation → saved task/event.
- **Wealth:** Review horizon → household money/trades/goals/engagement → evidence-backed review packet → follow-up.
- **Commercial:** Credit and coverage → company/leadership/payment/source timeline → selected deal/service context → coordinated next action.

Each should include its populated, empty, loading, unavailable and failed-action states. That would address the most consequential missing content while preserving the visual direction the user prefers.

## Source index

Production paths are relative to `force-app/main/default/uiBundles/`:

- Routes: `ReactRetail/src/routes.tsx`, `ReactWealth/src/routes.tsx`, `ReactCommercial/src/routes.tsx`.
- Persona modules and conditions: each app's `src/home/HomePage.tsx`, `homeTypes.ts`, `homeDataReal.ts`.
- Customer depth and real source joins: each app's `src/personas/customer/Full360Tabs.tsx`, `full360DataReal.ts`, `Customer360Page.tsx`, `ContextSidebar.tsx`.
- Existing implementation limitations: Retail `src/personas/customer/DetailsPanel.tsx`, `TearsheetBuilder.tsx`, `customerDataReal.ts`.
- Actions: `_shared/src/data/crmWriteClient.ts`, `_shared/src/components/home/ScheduleDetailModal.tsx`, the other action modals, and `force-app/main/default/classes/CrmWriteRest.cls`.
- Queue and Growth: `_shared/src/data/priorityQueue.ts`, `crmKpis.ts`, `kpiTrend.ts`, `whitespace.ts`; `_shared/src/components/home/CrossSellWhitespaceLive.tsx`.
- AI and configuration: `_shared/src/components/AgentforceChat.tsx`, `_shared/src/data/aiGenerateClient.ts`, `configClient.ts`; `_shared/src/components/config/ConfigPage.tsx`; `_shared/src/theme/`.
- Mock: `workspace.js`, `workspace-visuals.js`, `persona-workspaces.js`, `workbench-collections.js`, [coverage](WORKSPACE_COVERAGE.md), [persona design](PERSONA_WORKSPACES.md), [collections](WORKBENCH_COLLECTIONS.md).
- Binding migration contract: [functionality preservation map](../2026-11-11-cockpits/FUNCTIONALITY_MAP.md). The older [customer inventory](../../customer-360-inventory-and-gaps.md) supplies target content, but its old counts, schema references and “not surfaced” flags are not treated as current app facts.


## Atlas follow-through after approval

The user selected Atlas as the sole direction going forward. The first implementation pass is documented in [ATLAS_EXPANSION.md](ATLAS_EXPANSION.md). It adds source-backed profile/trade/interaction/satisfaction/notebook/screening surfaces (C01–C04 presentation), a configurable local review packet (C07), Retail retention/stress, Wealth upcoming reviews/digital platforms, Commercial payment/firmographic/market coverage, and task-operation/final-action proposals with explicit Account IDs. These close parts of the visual/workflow gaps; they do not close the P0 live-integration requirements. Remaining intelligence feeds, complete cohorts/histories, authenticated AI, live CRM writes and configuration/theme parity remain on the migration checklist.

The Commercial source was rechecked during implementation: the current Delinquency Watch uses account-joinable D&B payment behavior grouped into trade-credit payment bands. It must not be described as loan delinquency or confused with the older non-joinable Loan_Delinquencies dataset.

## Subsequent Retail-only re-audit

The latest Today hero, Prospecting, cohort-based Growth and Retail health changes supersede portions of this initial cross-persona presentation audit. See [Retail gap analysis, round 2](RETAIL_GAP_ANALYSIS_ROUND_2.md) for the fresh source comparison, local browser findings, concrete context-continuity gaps and next three proposed passes. Integration boundaries above remain open.
