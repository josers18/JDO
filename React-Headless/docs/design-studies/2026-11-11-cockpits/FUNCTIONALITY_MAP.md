# UI overhaul — functionality and backend preservation

The user requires **no loss of existing functionality or backend plumbing**. The work is a UI/UX redesign of the existing apps. This initial map records where capabilities belong in the proposed information architecture. It is not a claim that a replacement UI has implemented or verified parity.

Production application code and metadata are unchanged in this design study. The study's static read-only CRM capture is separate from the production SDK/data paths.

## Preservation map

Paths below are relative to `force-app/main/default/uiBundles/` unless stated otherwise.

| Existing capability | Proposed presentation | Preserve |
|---|---|---|
| App entry, routes, launcher and identity | Compact shared shell | Existing `app.tsx`, route hierarchy, platform basePath, App Domain deployment, launcher, and actual user identity |
| View-as book scoping | Visible scope control | `_shared/src/components/home/ViewAsPicker.tsx`, effective user/owner query scoping, preview semantics, and session behavior |
| Home dashboard aggregation | Performance band and worklist | Each persona's `homeDataReal.ts`, `HomeDashboard` contracts, aggregate versus bounded-list distinction, errors, and refresh hooks |
| Live KPI values and histories | Compact, explorable performance metrics | `_shared/src/data/crmKpis.ts`, `kpiTrend.ts`, `fetchNetFlow`, Data 360 histories, source windows, and delta semantics |
| Priority blending and reserved feeds | One relationship worklist | `_shared/src/data/priorityQueue.ts`, due dates, severity, scoring, deduplication, and reserved signal slot |
| Recommendations and Right Now | Briefing and contextual next actions | Existing recommendation data, rationale, prep, Why, QuickView, and next-step handlers |
| Workspace selection and pinned accounts | Persistent relationship context | `_shared/src/components/home/WorkspacePanel.tsx`, selection context, account enrichment, pinned state, and rail-to-explorer bridge |
| Full customer 360 | Context workspace → existing persona full 360 | All existing routes/tabs, account identities, data fetchers, financial/account details, timelines, AI flows, and selected-record context |
| Commercial Company Intel | Company 360 intelligence view | ZoomInfo, BoardEx, MSCI and SEC evidence and the current company data contracts |
| Cross-sell grid and movers | Full Growth workspace | `CrossSellWhitespaceLive.tsx`, `whitespace.ts`, owned-product semantics, eligibility scores, held-away reasons, reserved holders, score/EV histories, and whole-book Rising/Falling queries |
| Cross-sell Opportunity conversion | Selected cell → existing next step | `CrmWriteRest` Opportunity bridge, banker ownership, lead source, name, stage, close date, feedback, and open/won counters |
| Tasks, meetings, emails, cases | Context actions and work/calendar explorers | Existing write modals and `_shared/src/data/crmWriteClient.ts`; account/recipient lookup; validation; success-only `onSaved`/refetch; failure handling |
| Financial goals and life events | Relationship tabs and dedicated explorers | Current CustomerGoal/LifeEvent modals, FinancialPlan scoping, create/edit capabilities, dates, and refresh behavior |
| Leads, referrals and warm introductions | Growth pipeline and lead explorer | Current Lead modal, all records/statuses, referral data, create/edit flows, person/company context, and contact details |
| Pipeline, stages and opportunities | Stage chart, deal table and full explorer | Existing live totals, real histories, dates, stages, record identifiers, filters, and all reachable details/actions |
| Activity, agenda and supporting explorers | Work rail and deeper working views | All existing `DataExplorerModal` categories, filters, detail modals, schedule counts and date/status handling |
| Generative AI actions | Contextual preparation and editable results | `_shared/src/data/aiGenerateClient.ts`, configuration cache, existing action keys/models, prompt inputs, result handling, and current fallback contract |
| Real Agentforce chat and switching | Persistent assistant entry and contextual launch | `AgentforceChat.tsx`, authenticated ACC, single-embed constraint, teardown/re-embed switching and animation-frame registry settling |
| Configuration and model catalog | Existing Configuration route | `_shared/src/data/configClient.ts`, per-center config, model cache, background probes, refresh/debounce, and stored parameter behavior |
| Brand themes, Light/Dark and display scale | Existing personalization settings | Theme library, per-user active theme/display size, logo/palette tools, token-role mappings, and Apex persistence |
| App chrome | Compact navigation and utility controls | `GlobalSearch.tsx`, `AppLauncher.tsx`, `NotificationBell.tsx`, `UserMenu.tsx`; all existing actions and routes remain reachable |
| Current/Cockpit layout preference | Keep existing behavior until migration is explicitly settled | `HomeView.tsx`, saved preference, view toggle and section-navigation behavior; do not silently retire an existing working mode |
| Data freshness and source availability | Visible source context and detailed provenance | Actual source periods, cadence rules, stale/empty/unavailable/error distinctions, book/org fallback notices and no invented live claims |

## Persona intelligence to carry forward

| Persona | Required existing information families |
|---|---|
| Retail | Deposit attrition/retention, net flow and transaction moments, property/home-equity/refinance signals, property hazards, financial stress, life stages, website engagement, campaigns, liquidity events, blended Who-to-Call, next-best offers and cross-sell |
| Wealth | Held-away and recurring outflow, plan success/critical plans/stale plans/reviews, goals, crypto/robo leakage, trading pulse and net sellers, concentration, business-owner clients, upgrade prospects, liquidity events, blended Who-to-Call, next-best offers and cross-sell |
| Commercial | Credit/payment watch and delinquency bands, Moody's outlook, BoardEx leadership/governance, ESG changes, firmographics, market footprint, business-owner Wealth handoffs, fee stress/excess cash, Demandbase intent/competitor research, Harmonic funding, UserGems champion departure, company intelligence and cross-sell |
| All | CRM KPI histories, pipeline movement, tasks/events/cases, ServiceNow context, leads/referrals, customer goals and life events, call sentiment, screening changes, marketing activity, recent activity and freshness |

## Integration boundary

- Keep existing fetcher signatures, data contracts, caching, owner scoping, source queries and Apex routes. Build new presentation components over them.
- Do not replace working modals or full 360 pages with the study's placement previews. Those previews are design annotations only.
- Retain real Agentforce output and actions. Study-authored briefs and simulated session notes must not become production substitutes.
- Preserve all existing error, empty, unavailable and stale-data states, and the successful-write refresh contract.
- Do not make the new layout an excuse to remove lower-priority modules. Give them meaningful grouped views with an accessible route or explorer.
- Preserve full/aggregate scope when reducing visible rows. Sampling is a presentation choice, not a new source total.

## Evidence needed before a production replacement

1. Expand this map into exact routes, controls, handlers and persona modules from all three current apps. Mark every capability reachable in the new UI.
2. Confirm read behavior and owner/source scope against the existing implementation, including history and cross-sell mover semantics.
3. Exercise each existing write action and its success/failure/refetch behavior with the new presentation.
4. Verify full 360 navigation, pinned selection, Agentforce switching, configuration and personalization.
5. Run the appropriate existing unit/build checks and focused browser journeys across all three personas, including keyboard/narrow-screen and theme/display-size behavior.
6. Only replace an existing surface after its capability parity is demonstrated. The current standalone studies do not satisfy this production integration gate.
