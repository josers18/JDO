# Wealth: remaining gaps after Atlas workspace builds

November 13, 2026. Repository-to-demo review, including the new Relationships landscape/finder. This is not a fresh authenticated org audit. The original ReactWealth app remains the production capability floor; the new Atlas is a standalone captured-data mock with browser-local proposals.

## Latest rerun

See [the current gap rerun](WEALTH_GAP_RERUN.md) for the new Life & Goals content/usability finding, its redesign, fresh owner-complete CRM evidence and remaining source/runtime boundaries. Earlier tables below describe the pre-closure baseline.

## Latest status — customer/workflow closure

The subsequent customer/workflow milestone implements the design gaps below: observed satisfaction history, prediction input context, richer Money/Property, expanded actual-source coverage across all 73 captured households, configurable review packets with real local download/print, and exact return-to-workspace context. See [closure evidence and remaining runtime boundary](WEALTH_GAP_CLOSURE.md). The tables below are the pre-closure baseline and should not be read as current missing-design status. Runtime integration and genuine source limitations remain explicitly open.

## What is now covered in the mock

Today/advisor priorities; independent held-away and bank-flow context; searchable household landscape and comparison; Pipeline; grid-calendar life events and CRM goal proposals; hybrid Capital paths with exact-product actions, source history, coverage/movers and ownership guards; white-space heat map; investable/digital held-away separation; Leads/referrals, business handoffs and Wealth upgrades; planning/concentration/liquidity/trading/relationship Intelligence; Review Horizon; source Task/Event/Case work and local proposal review; shared search, View As, launcher, notifications and user/admin shortcuts.

These are interactive design/source-contract demonstrations, not proof of live execution parity. The 73 captured households and six coverage households are samples, not the full advisor population.

## Remaining design and feature gaps

| Priority | Area | Original Wealth app | New Atlas mock and remaining work |
| --- | --- | --- | --- |
| P1 | Customer satisfaction and engagement detail | `Full360Tabs.tsx` and `full360DataReal.ts` expose customer CSAT/NPS context, history and verbatim feedback, alongside interaction/Gong evidence. | Source interactions, call signals and campaigns are available, but there is no equivalent complete customer-level CSAT/NPS history/verbatim experience. Add a visual relationship-care timeline and source-linked feedback detail, using genuine customer-specific captures. Do not replace it with a synthetic health score. |
| P1 | Customer prediction explanations | Original customer sources include Attrition Prediction and Predicted CSAT, with model context/drivers where supplied. | Book signals and upgrade/product probabilities are represented; dedicated customer prediction/driver panels are incomplete. Add source-specific driver views and distinguish product conversion, attrition and predicted satisfaction rather than collapsing them into one score. |
| P1 | Customer financial/property depth | Original Money/Property tabs include account/transaction/trade detail plus mortgage, HELOC, flood-zone and wildfire observations. | Account, transaction and execution views exist for Julie/Anika, and property owner/value/equity gating is preserved. The property presentation omits some original mortgage/HELOC/hazard fields, even where capture fields exist; the money views remain mainly ledgers. Add a richer financial/property work surface while retaining cents, ownership gating and source dates. This is customer-detail work, separate from the now improved directory. |
| P1 | Cohesive depth beyond the two deep examples | The original fetches the selected Account dynamically through its clients. Some original customer visual structures are empty or representative. | Julie and Anika have coherent captured detail across multiple sources. Many of the other 73 directory records have only selected plan/signal/activity evidence. The new finder and comparison handle that honestly, but do not create equivalent full 360 depth. Add further coherent contrasting captures or connect the adapter to runtime fetchers; never reuse Julie's details. |
| P2 | Review packet / tearsheet controls | Original TearsheetBuilder has section selection, tone and prompt preview. Its generate action uses a timer and deterministic preview, not a wired model call; a working AI/PDF pipeline must not be claimed. | Atlas has a household folio, private questions, section choice and source material. Tone/prompt controls and a fully designed packet preview are not equivalent yet. Build the combined review studio, then define a genuine generate/export/share contract separately. |
| P2 | Cross-view context polish | Original offers workspace selection/explorers and record context; neither layout is a complete execution planner. | Key exact Account/product/source links and Back/reload are tested. Some lenses still maintain separate selections, and comparisons are browser-session state. Improve unified return-to context, selected-household continuity across Capital/Intelligence/Review and keyboard/focus restoration. Preserve today's useful independent views. |

## Runtime parity: still outstanding by design

| Priority | Area | What is still needed |
| --- | --- | --- |
| P1 | Full-book retrieval and freshness | Replace dated arrays with owner-scoped SDK/GraphQL and Data 360 adapters, cursor/full-book search, real loading/error/retry/freshness and truncation states. The 73-row finder searches its entire capture, not all live households. The six-row heat map is not native maximum-12/full-book coverage. |
| P1 | Executed actions | Connect reviewed Task/Event/Lead/Goal/life-event/Opportunity/Case/email proposals to supported bridge operations. Require real success/error/uncertain outcomes and refetch. Preserve source IDs, source assignee versus actor, Who/What, timezone semantics, ownership guards and reviewed Opportunity amounts. Current mock actions remain local drafts. |
| P1 | Live Agentforce and AI configuration | Retain authenticated ACC and real agent switching, explicit record handoff, AI action/model catalog configuration and failure states. A mock assistant or label is not a live grounded conversation. |
| P1 | Full theme/admin runtime | Existing launcher/search/alerts/avatar/View As/setup shortcuts are represented and tested in the mock. Full brand-theme library, logo/palette editing, per-user server persistence, actual role/permission enforcement and live menu data still require the production integration. |
| P1 | Security, identity and state isolation | Verify ordinary/restricted-user CRUD/FLS/sharing and Data 360 row access, stable org/actor/effective-owner keys, request/cache invalidation on View As and no cross-owner replay of private drafts. Source captures under an admin are not that verification. |

## Original-app issues that should not be copied as parity

- `ReactWealth/src/home/HomePage.tsx::healthFor/healthDropFor` derives displayed health and week-over-week drops from severity/rank. These are not measured health histories; Atlas should not manufacture equivalent metrics.
- `_shared/src/data/dataCloudClient.ts::queryDataCloudForBook` can widen an empty owner result to org scope. Any Atlas runtime adapter must display the true scope or use strict-book behavior.
- The original customer fetcher leaves `network`, `aumTrend`, `cashFlowIn`, `cashFlowOut`, `journey` and `webEngagements` empty when no clean source exists. Their presence in a UI component is not proof of populated parity.
- Original TearsheetBuilder's simulated generation and the existing stored-but-not-applied model temperature/token parameters are unfinished original features, not capabilities removed by Atlas.
- Beneficiaries, verified household-member/estate roles and document-completeness workflows do not have an established source contract in this inspection. The new directory graph shows advisor-book membership only; it does not invent family connections. Those would be new discovery, not restoration.

## Successful empty sources are not missing features

The current Wealth owner-client source and career/liquidity-event source return zero qualifying records. The outside-cohort mover feeds can also return no qualifying rows. Their views and empty states exist. Business-to-Wealth handoffs remain a separate population from current owner-clients. An empty source must not be filled with invented clients, proceeds or activity.

## Recommended next order

1. Complete the customer 360 care/prediction/property/financial visual depth using at least two contrasting coherent households.
2. Enhance the review folio into the best combined tearsheet/review packet experience, keeping deterministic/source content distinct from generated text.
3. Tighten cross-view navigation and ordinary-user acceptance, then implement the production adapters/action receipts/theme/ACC contracts as a separate authorized migration.

Evidence: `force-app/main/default/uiBundles/ReactWealth/src/personas/customer/{Full360Tabs,TearsheetBuilder,customerDataReal,full360DataReal}.tsx/.ts`, `ReactWealth/src/home/HomePage.tsx`, `_shared/src/data/dataCloudClient.ts`, `_shared/src/components/config/ConfigPage.tsx`, and this study's `wealth-atlas.js`, `wealth-capital-studio.js`, `wealth-retained-scenes.js`, `wealth-studio.js`, `wealth-relationships.js` and capture envelopes. See [migration contract](WEALTH_MIGRATION_CONTRACT.md), [action contract](WEALTH_ACTION_CONTRACT.md) and the earlier [gap baseline](WEALTH_GAP_ANALYSIS.md).
