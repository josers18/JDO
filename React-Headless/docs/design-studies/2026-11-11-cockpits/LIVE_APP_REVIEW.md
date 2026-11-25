# Deployed application review — November 12, 2026

The user asked for three distinct cockpit designs, the information density of Study 02, a less green Retail palette, and a review of all sections in the deployed applications. No existing production functionality or backend wiring may be lost.

## Review method and limits

The three supplied App Domain URLs were opened in an isolated browser using the existing Salesforce CLI frontdoor session, as requested by the user. Credentials and frontdoor URLs were held in memory, not written into study files or printed. The review navigated screens and tabs; it did not submit CRM writes, configuration changes, model refreshes, or AI action approvals.

All three applications opened under **Jose Sifontes / My book**. Visible org-wide fallback labels were preserved when interpreting signals. These live review observations must not be relabeled as Kim Johnson's or Allen Carter's book data. The existing Study 02 CRM snapshot still uses its explicitly named owners; the newly added Wealth headline metrics match the live review's Jose scope.

Full-page screenshots and visible-text captures are under `output/playwright/cockpit-studies/`. These are local review evidence, not deployable application content or a live data connection.

### Verified screens

| Surface | Live observations | Design implication |
|---|---|---|
| Retail Today, Current and Cockpit | Brief and freshness, Right Now, KPIs, tasks/schedule, priority queue, recommended actions, selected workspace and supporting modules | Lead with daily work, customer needs and customer context, rather than an analytical company grid |
| Retail Growth | Cross-sell grid/detail, Rising/Falling, six-month movement, life-stage mix, web engagement, pipeline, leads/referrals and pulse | Growth needs a complete working view, not a tiny summary card |
| Retail Health | Metrics, pulse, alerts and life-event workflows; source also conditionally renders property risk, stress and deposit attrition | Keep all conditional modules reachable even when absent for the reviewed book |
| Wealth Home, Current and Cockpit | Held-away assets, plan risk/reviews, crypto/robo leakage, trading pulse, business owners, upgrade prospects, concentration, cross-sell, priorities/actions, work and relationship modules | Organize the cockpit around a household review environment, capital context and advisory lenses |
| Commercial Home, Current and Cockpit | Credit/payment watch, outlook, leadership, ESG, firmographic growth-tier mix, branch/market footprint, cross-sell, transaction and external signals, work/actions | Give companies a multi-lens intelligence table and keep deal execution, coverage and company context together |
| All three Configuration routes | Per-action model settings, generation parameter storage, brand/palette/role controls, distinct AI accent, Light/Dark baselines, saved themes and per-user display sizes | Keep Configuration intact; no visual redesign can discard its persistence or administrative behavior |
| Full 360 entry and tab navigation | Overview/Details; Finances; Relationship; Growth; Notes & Tools. Retail/Wealth reviewed with Julie E Morris; Commercial also reviewed with United Partners | Preserve the complete grouped-tab architecture and record context |
| Commercial Company Intel navigation | The Finances group includes Money, Property and Company Intel | Keep Company Intel attached to the selected company, with its current data sources |

### Cross-sell loading and scope

An initial Retail Growth capture showed `Scoring your book…`. A later capture waited for that state to finish and showed seven opportunities, one Rising result, scores, six-month changes, expected value, held-away reasons, and next-step actions. This distinction matters: an initial zero/loading display is not evidence that the functionality or data is absent.

### Deep 360 content

All five tab groups and their visible leaves were opened in each app. Several captures still showed the customer-detail loading surface while the identity header and navigation were already available. The controls and source implementations were inspected, but those early captures do **not** verify the fully loaded contents of every tab. A separate settled-content check timed out after 90 seconds waiting for the Retail Tearsheet Builder heading. No claim of end-to-end functional validation should be inferred from the section inventory, and this design task did not change the production fetchers to address that loading behavior.

The leaf inventory from live controls and current source is:

- Overview and Details.
- Money and Property; Commercial additionally exposes Company Intel.
- Journey, Engagement and Cases.
- Opportunities and Campaigns.
- Notes and Tearsheet.

## Observations that shape the redesign

1. **Different jobs need different main surfaces.** Retail's moments/needs flow, Wealth's household review and Commercial's company comparison should not share one home-page layout with different colors.
2. **Keep the operational depth.** The cross-sell grid, detailed financial/relationship views, queue controls, real action modals, source freshness and supporting explorers are product capabilities, not visual clutter to delete.
3. **Connect signals instead of repeating them.** Gabe's saved borrowing interest and captured service cases illustrate why the selected relationship workspace should connect service, need and opportunity.
4. **Use persona-native KPIs.** The live Wealth page displayed $2.2M held away across five clients, 3,014 plans below 70% modeled success, 108 reviews due within 30 days and $204.8K net flow for the week of Nov 2 across 27 accounts. Study 03 uses these displayed values with their scope and date, rather than inventing AUM or repeating Retail's metrics.
5. **A risk signal is not a conclusion.** Payment behavior, model probability, sentiment and plan outcomes should support an investigation or conversation. Keep their source semantics and relevant action paths.
6. **Theme flexibility is existing functionality.** The new palettes must ultimately map into the current token/brand infrastructure and support the existing user-controlled display scale and Light/Dark baselines.

## Study 03 compositions

| Persona | Main composition | Visual direction | New study interaction |
|---|---|---|---|
| Retail | Work lane → customer-needs list → customer workspace; pipeline and relationship detail below | Warm ivory and ink blue with coral, ochre and restrained teal; slim navigation | Customer-moment entry points keep service context ahead of a sales conversation |
| Wealth | Capital ribbon → household selector → broad advisory dossier; compact work rail; analysis and business development below | Parchment, bronze and dark olive/ink, editorial typography and fewer boxed regions | Plans/priorities, capital/holdings and relationship-work lenses |
| Commercial | Multi-lens company table and action queue beside company context/Intel; pipeline execution and market coverage below | Navy, cool blue, cyan details and amber attention cues | Relationship, credit/payment and product-opportunity lenses; Company Intel entry points |

These are standalone design explorations. A complete production design and migration still need to demonstrate the functionality preservation map; none of the study's contract-preview dialogs replace working production pages or actions.
