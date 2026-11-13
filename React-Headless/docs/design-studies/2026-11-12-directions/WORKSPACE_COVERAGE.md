# Expanded workspace coverage

## Preview

`workspace.html` is a standalone interactive mock over real captured data. It supports three styles × three personas × eight primary sections, plus relationship dossiers. It does not import or change production React bundles, SDK clients, Apex, or Salesforce metadata.

- [Panorama](http://127.0.0.1:5187/docs/design-studies/2026-11-12-directions/workspace.html?direction=panorama&persona=wealth&page=today)
- [Relationship atlas](http://127.0.0.1:5187/docs/design-studies/2026-11-12-directions/workspace.html?direction=atlas&persona=wealth&page=relationships)
- [Advisory focus](http://127.0.0.1:5187/docs/design-studies/2026-11-12-directions/workspace.html?direction=focus&persona=wealth&page=journey)

The mock proposes new grouped navigation for comparing designs. It does not claim those exact eight routes already exist in production: Retail currently has Today/Growth/Health; Wealth and Commercial compose the capabilities on home, with customer and configuration routes.

## Implemented presentation and interactions

Growth, Intelligence, and Workbench now dispatch to nine separate persona render functions in `persona-workspaces.js` for Atlas/Panorama. Retail uses needs/service flows, Wealth uses capital/advisory/review flows, and Commercial uses treasury/company/deal flows. Their selections and preparation state are isolated by persona and record. See [PERSONA_WORKSPACES.md](PERSONA_WORKSPACES.md) for the compositions, source supplement, and verification. Focus retains the earlier sections.

| Area | Mock experience | Production source inspected |
|---|---|---|
| Today | Source-linked priority examples, full captured pipeline/task/case aggregate cards, milestone previews, task details, and contextual preparation | Each persona's `src/home/homeDataReal.ts`, `homeTypes.ts`; `_shared/src/data/priorityQueue.ts`; shared home actions |
| Relationships | Search, persistent tab-scoped pins, exact-ID selection, directory, style-specific selectors, deep links and browser Back | `_shared/src/components/home/WorkspacePanel.tsx`, `WorkspaceSelection.tsx`; persona customer fetchers |
| 360 overview | CRM facts, saved external signal evidence, milestones, preparation, task/meeting/email/case entry points | Persona `Customer360Page`, `Full360Tabs.tsx`, `full360DataReal.ts` |
| Finances | Captured financial-account types/balances/statuses; property/equity/HELOC and property risks; selected Julie transactions; saved concentration and outside-asset evidence | `full360DataReal.ts`; homeowner gate retained for property values and HELOC |
| Journey | Real Contact-linked life-event records, CRM goal progress, provider financial plan, type/status filters, local create/review forms | Home `PersonLifeEvent`/`FinancialGoal` queries; `LifeEventModal.tsx`, goal modal; FinancialPlan → Account linkage |
| Engagement & service | Account-linked CRM cases and tasks; Julie marketing campaign events; saved call sentiment evidence | Current Full 360 Engagement/Cases/Campaigns and home case/task fetchers |
| Opportunities | Selected exact-account opportunity records and creation/review form | Current Opportunity query and CRM write modal/client contracts |
| Notes & tools | Session notes, preparation drafts, context-linked action drafts, assembled tearsheet preview | Current Notes, `TearsheetBuilder`, shared preparation/actions |
| Commercial Company Intel | Real selected-company ZoomInfo bands, BoardEx board/CEO/governance, MSCI rating/component scores/carbon/controversies; explicit no-match SEC result | Commercial `full360DataReal.ts`, Company Intel leaf under Finances |
| Pipeline | Full stage SUM/COUNT capture, readable top-five stage visual, full stage breakdown, searchable stage-filtered deal sample, board vs. focused deal inspector | `crmKpis.ts`, home pipeline feed, Opportunity action |
| Growth | Eligible product examples by persona and owner, captured holdings-aware grid, expected-value/probability distinction, actual monthly history, Rising/Falling filters, lead/referral review | `_shared/src/data/whitespace.ts`, `offerModel.ts`, `CrossSellWhitespaceLive`; current lead flows |
| Intelligence | Saved Retail website, Wealth planning/holdings/held-away/liquidity, Commercial credit/call/product/competitor/funding evidence | Real-row tests for web engagement, Wealth who-to-call, liquidity, Commercial who-to-call, intent, and funding |
| Workbench | Persona-specific task planning, meeting calendars with local drafts, service triage/context, editable draft previews and readiness stages | Current schedule/task/case modals and CRM clients |
| CRM action design | Task, meeting, email, case, goal, life event, lead/referral, and opportunity forms, validation, review, local draft list | `_shared/src/components/home/` action modals and `crmWriteClient.ts` |
| Agentforce | Contextual panel, four current agent names, prepared questions and task-draft handoff | `_shared/src/components/AgentforceChat.tsx`; production still requires authenticated ACC and teardown/re-embed on agent switching |
| Configuration | Preview accent and reading-size persistence; four AI-action model-name draft fields, generation parameter draft | `ConfigPage.tsx`, `configClient.ts`, brand/display controls |

## Source and scope

1. **Prior CRM snapshot:** `../2026-11-11-cockpits/crm-snapshot.js`, captured Nov 12. Pipeline values and task/case totals are independent aggregates; detail lists remain bounded. Wealth has large sandbox Innovation Pipeline deals and 25 stage labels; no values are scaled down for aesthetics.
2. **New CRM capture:** `workspace-data.js`, read via Headless360 on Nov 12 after verifying org `00Dam00000Uo32qEAB`, Cumulus Financial Services. Scope: Kim Johnson `005am000003PbFAAA0`, Jose Sifontes `005am000003PbCLAA0`, Allen Carter `005am000003PbFDAA0`. Life events: latest 80-row probe per owner, deduplicated by Contact/type/date (20 Retail, 31 Wealth, 21 Commercial); selected goals (10/4/6); Account facts; 16 selected financial-account records; 17 selected account-linked opportunities. These are design samples, not all records or book counts.
3. **New Data Cloud capture:** `workspace-dc.js`, read Nov 12 using the Data 360 MCP SQL facade after verifying DMO metadata. Includes one Cameron-Olson row per ZoomInfo/BoardEx/MSCI provider, 2 property rows, 3 provider-plan rows, 8 Julie transactions, 7 Julie campaign events, 29 eligible-offer rows across six selected accounts, and 98 history rows for the 14 highest-value captured account/code pairs. Provider periods are preserved. SEC returned zero matching rows for the selected company. Queries used bounded limits; row counts were checked below the limits for eligible offers/history.
4. **Saved external fixtures:** previous `study-data.js` and current real-row source tests, dated Nov 10–11. Their values are labeled saved signals. They are not represented as new AI output or a fresh query result.

The directory also includes exact Account links from captured CRM records. Some of those are linked through a record owner rather than independently verified account ownership, and are labeled captured CRM relationships. Account names are never used to merge records. Source IDs are extracted from saved relationship URLs where the previous capture did not project `AccountId`.

CRM balances, outside balances, expected-value uplift, modeled conversion probability, modeled plan success, and pipeline amounts retain their different meanings. No fake AUM, chart history, appointment, provider detail, or model answer was added. The owned-product cells only reflect the captured financial-account rows, not a fresh full holdings sweep. Missing scores/holdings are marked not captured. The growth grid follows the source's persona product-code filters and ownership name patterns and mover threshold (2 conversion points or $250 expected-value change); the complete production book-wide ranking and reserved holder rows remain outside this selected capture.

## Design differences

### Visual interaction pass

Atlas and Panorama now use a visual working canvas in Relationships, Pipeline, and Life & goals. `workspace-visuals.js` keeps the interaction state separate from source records; `workspace-visuals.css` scopes their presentation. Existing forms, dossier tabs, notes, pins, and integrations remain behind the same handlers.

| Tool | Interaction | Data semantics |
|---|---|---|
| Relationship landscape | Select any captured account, switch signal/milestone/goal lenses, open the full dossier, compare up to three accounts | Spokes connect accounts to the advisor's book; no inferred account-to-account relationships. Counts and goal funding refer only to captured rows. |
| Deal plot | Select a dot or legend entry; inspect amount, date, and stage; switch between a zero baseline and fit-to-value scale | Dots use the actual captured opportunity amounts and close dates. Both axes use matching coordinate systems. The plot is the bounded high-value sample, not all pipeline records. |
| Planning board | Drag a card between stage lanes or choose a stage in the inspector; save/reset a local stage-plan draft | Captured record stage and full aggregate never change. The preview is stored separately in tab session storage. It is not a forecast update or CRM write. |
| Milestone calendar | Browse captured years, select timeline markers or event cards, review the source event, prepare outreach | Real PersonLifeEvent records grouped by event family/month; a crowded month grows vertically so markers remain reachable. |
| Balance composition | Click a donut segment, use Enter/Space on a segment, or choose a legend item to filter the financial-account table | Sum positive recorded balances by actual account type. Loans can be included. This is not AUM/net worth; missing and non-positive values remain in the unfiltered table. |
| Goal funding | Select a home-screen goal ring or review a goal in its dossier | ActualAmount / TargetAmount, visually capped at 100%; recorded status and amounts remain distinct. |

Visual review covered 144 section layouts across Atlas/Panorama, all three personas, and 1512px/768px/390px widths. Interaction checks covered map selection, lenses, comparison, full-record navigation, plot scales, stage preview isolation, plan drafting, drag/drop/reset, timeline years and records, goal rings, and balance filtering. The existing 57 dossier views and eight action-form journeys were rerun. Review evidence is under `output/playwright/cockpit-interactions/`; no JavaScript errors were observed.

- **Panorama:** broad cobalt shell, readable horizontal work surfaces, relationship directory, stage/deal boards, milestone bands.
- **Atlas:** lavender shell, spatial relationship/evidence entry points, adjacent directory/inspector, grouped milestone and growth landscapes. The map does not imply financial meaning for distance or connections between clients.
- **Focus:** plum frame with persistent selectors beside a single readable client, deal, milestone, or signal document. Long selectors scroll inside their lane.

All support keyboard focus, native dialog dismissal, field labels, responsive layout, and reduced motion. Full sources remain available in scrollable tables or explicit stage/detail views instead of shrinking text.

## Deliberate boundaries

The supplementary persona pass added 23 actual Commercial eligible-offer rows and 84 monthly history rows to the original Data Cloud capture, for 52 offers and 182 history rows total. Company owner IDs and native product-code filters remain intact. The rest of the original capture inventory above still describes its initial read.

Actions save **local drafts** in this tab; they do not invoke CRM writes, send email, schedule events, or change config. Existing life-event Contact/type are read-only, matching the current app's set-once fields. Goal creation chooses a captured financial plan. Edited records retain the original record reference in the local draft. Notes and pins also stay in session storage.

Agentforce is an interaction preview without responses; there are no invented assistant answers. The final integration must preserve all four existing agents and correct re-embedding behavior. The model catalog is not queried because its GET can enqueue billable probes; the mock accepts model-name drafts without claiming availability.

Financial trades, remaining intelligence feeds, full ServiceNow detail, complete source histories and book-wide cross-sell, live writes and post-save refresh, full brand library/logo/Light-Dark editing, and production authentication/accessibility/theme parity still require implementation. The mock preserves their place and does not certify production parity. See the original [functionality preservation map](../2026-11-11-cockpits/FUNCTIONALITY_MAP.md).

## Validation

Browser review rendered all 72 desktop section combinations and 24 mobile section views without horizontal overflow. Checked the relationship-to-life-event edit journey, immutable Contact/type, local draft review, notes persistence, tearsheet preview, pinning, assistant switching, reading preference, pipeline search/empty state, opportunity draft, goal navigation, and browser Back. A further 57 dossier views were checked at 1512px, 768px, and 390px, including Company Intel, property, provider plans, scored-offer history, default cross-sell stage/close date, all eight form types, and draft persistence across reload. No JavaScript errors were observed. Screenshots and machine-readable review results are under `output/playwright/cockpit-workspaces/`.

## Workbench collection expansion

`workbench-collections.js` / `.css` supply twelve supporting persona views through `persona-workspaces.js`. Retail task dates and all recorded task/case statuses come directly from the bounded CRM capture. Commercial task groupings are derived from captured subjects. No SLA, age, or appointment availability is inferred. The capture has no upcoming events; calendars show only user-created local meeting drafts. Selected date/time prefill the existing meeting form.

Notes/checklists/local task stages persist under `cumulus.workbench.plans`, keyed by persona and exact record ID. Draft content and readiness persist in the existing `cumulus.complete.drafts` session storage. Draft editing retains all untouched fields. A readiness change does not send, approve, or publish the draft. Source-record review and the existing forms remain available. Focus retains the earlier auxiliary layouts.


## Atlas-only gap-closing pass

Atlas is now the default direction and the only direction expanded in this pass. `atlas-data.js` contains read-only Cumulus captures and `atlas-expansion.js` / `.css` provide deeper Profile, trade ledger, interaction/satisfaction, Notebook, Screening, and review-packet views. Retail Relationship health, Wealth Review horizon, and Commercial Credit & coverage are new Atlas sections. Deep links support the new dossier tabs. Exact captured Account IDs are selectable in action forms and draft edits; relationship draft matching uses IDs instead of names. Task update/complete/delete/reassignment proposals and reviewed draft action plans are explicit local planning flows. Meeting forms/drafts retain location, duration, Show As and the planning timezone.

This expansion is not live parity. The source samples are bounded where labeled; provider review dates are not appointments. Individual 0–10 recommendation responses are not aggregate NPS. Company/payment bands are actual captured owner-scoped aggregates. See [ATLAS_EXPANSION.md](ATLAS_EXPANSION.md).


## Main banker landing pages

The user clarified that expansion should be visible on the main page side. Atlas Today now renders separate Retail, Wealth and Commercial main homes via `atlas-home.js` / `.css`. Customer care/retention/stress, upcoming reviews/outside platforms/trades, and payment watch/company intelligence/deal execution are visible directly on their respective main pages. Existing record/offer/preparation workflows remain accessible from these surfaces. See [ATLAS_HOME.md](ATLAS_HOME.md) for compositions and validation. The relationship directory and deeper 360 additions remain separate destinations.


## Retail refinement

The Retail-only Atlas follow-up adds a compact Today with top-area pipeline, wrapping/paged customer and milestone directories, richer Life & goals, source-backed probability heat map/life-stage mix/recognized browsing/leads in Growth, and a fuller portfolio-health workspace with real stress/deposit aggregates and risk/service alerts. `retail-data.js` holds the supplemental capture; `retail-refinement.js` / `.css` scope rendering to Retail Atlas. See [RETAIL_REFINEMENT.md](RETAIL_REFINEMENT.md) for source semantics, implemented coverage and verification.


## Retail workflow hierarchy

The latest Retail pass restores the annual grid calendar and replaces generic milestone/goal cards with illustrated stories and funding treatments. Customer finder mode uses broad identity search, source-backed cohort/initial filters, recent records and a scrollable match list instead of numeric pagination. Leads/referrals is now Growth's default primary workspace and a main Today region. The needs explorer/probability map and life-stage mix remain available as Growth lenses. Recognized browsing is consolidated into Intelligence with six selectable customers and product evidence. See [RETAIL_WORKFLOWS.md](RETAIL_WORKFLOWS.md) for read-only Lead capture, exact-ID follow-up behavior and verification.

## Latest Retail Atlas update: cohesive prospecting and customer growth

Prospecting is now a Retail-only primary destination with source/status/search filters, a Lead worklist, private preparation and linked follow-through. Growth connects the life-stage selector directly to source-joined customer needs and probability scores. The needs explorer and map are two views of the same selected cohort. Recognized browsing remains Intelligence; milestone calendar/stories remain Life & goals. The original generic section count above predates this Retail addition. [Implementation, bounded capture scope and validation](RETAIL_COHESION.md).

## Today opening hero

Atlas Today now opens with a personalized book brief, embedded Portfolio Pulse, and a suggested first outreach with source context, Open 360, preparation and call-planning actions. It replaces the previous welcome heading and detached KPI strip instead of stacking another header above them. Retail prioritizes the critical cases in the selected CRM sample, Wealth shows captured household risk signals, and Commercial shows captured relationship/credit signals. Next priority cycles within that persona's captured candidates; it does not mutate source priority or imply a refreshed ranking. Preparation and meetings remain local drafts.

CRM pipeline value/count and open-task/open-case aggregates come from each owner's existing November 12 snapshot. Retail persistent stress is a separate source aggregate. The brief is authored from captured values, not a live AI generation; source dates are shown. Pipeline remains immediately below the hero in Retail.

`atlas-day-hero.js` / `.css` implement the opening composition. Local browser verification passed 12 persona/viewport combinations (three personas at 1512, 1024, 768, 390 pixels), plus each persona's preparation, exact-account call planning, next-priority and pulse navigation actions. No page errors, document overflow, or non-GET requests during those checks. Screenshots reviewed under `output/playwright/atlas-day-hero/`. Production bundles and metadata remain untouched.
