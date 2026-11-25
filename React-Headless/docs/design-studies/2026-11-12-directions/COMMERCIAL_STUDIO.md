# Commercial Atlas visual follow-through

This source-preserving decorator addresses the second design pass: company credit and coverage should be visual working environments, and Pipeline and Workbench should have deliberate compositions. It runs only for Atlas + Commercial and delegates every other page and all original methods to `createCommercialAtlas`.

Design plan: a technical relationship atlas in navy, muted teal and paper; a native-probability grid for treasury depth; a supplier-payment landscape for business-credit context; capital allocation pillars for Pipeline; a grouped source-work triage ledger with one exact-record detail for company execution. Preserve the company and exact record identity at every handoff. Keep the existing useful treasury lanes, origination desk, intelligence inbox, company dossiers and real grid calendar. Fit multiple useful views together rather than add decorative metrics.

The implemented plan was checked against the brief: probability cells are actionable and ownership-aware; credit circles use real PAYDEX and days beyond terms; the stage pillars use captured Opportunity amounts and retain stage filtering; mobile coverage starts with a single product lens rather than a sideways customer strip. The scatter domain includes the captured 180-day observations without clipping them at 60 days. Company selection is also available in an accessible button list where coordinates overlap.

## Preservation and changes

| Scene | New visual treatment | Retained source and behavior |
| --- | --- | --- |
| Treasury / Coverage | Probability-colored heat map; product lens; owned and unavailable patterns; mobile product focus | Same 12 selected companies, eight native product groups, exact offer code, holdings override, native rank then EV selection, monthly offer evidence and draft action. Treasury plays, model movers, new Lead and owner introductions remain unchanged. |
| Credit & coverage | Clickable proportional payment distribution; PAYDEX-versus-supplier-days scatter; company focus folio and cohort selection | Independent full-book payment-band counts and mean PAYDEX, captured period, 16 sampled companies, failure and raw delinquency scores, exact company dossier, agency/leadership watch, revenue cohorts and ZIP market drill-ins. Four missing profiles remain missing, not zero risk. |
| Pipeline | Full-book contextual total plus sampled-stage allocation pillars, company-to-Opportunity handoff diagram | Exact source Opportunity selection, reload deep link, stage filter, 100 captured deals versus independent 3,412 / $3.634B full-book totals, source probability/close date, eight historical snapshots, source ownership and original follow-up/review forms. No inferred credit approval stages. |
| Workbench | Task-priority / meeting-date / case-status triage groups; bounded work ledger; one exact original inspector card; local-proposal review desk | Original Task/Event/Case source lists, search, original inspection/update/delete proposal editors, ServiceNow references, source owner and company links, all local proposal review/editor paths. Source totals never change after local actions. |
| Activity & plans | Two-scale company/owner planning diagram and calendar layout refinement | Existing grid calendar, recorded-versus-planned modes, exact Event date/time/duration/location and edits, separate personal Accounts/Plans/Goals/milestones and owner introductions. Provider observation dates remain distinct from CRM Events. |

No SDK, Apex, production bundle, org metadata, record, source dataset, view-as, global search, notification, waffle or user-menu logic is changed. This is a bounded captured-data study, not a live application deployment. Existing `data-ca` actions are retained. Added handlers use `data-cs` and recheck Atlas + Commercial before running.

## Validation

`node --check commercial-studio.js`

`node tests/commercial-studio.browser.cjs` from repository root using the full test path.

The browser check covers 20 scenes across 1512, 1024, 768 and 390 pixels; verifies no document horizontal overflow; exercises native offer evidence, ownership in the product lens, payment filtering and exact company focus, exact Opportunity reload and the existing follow-up editor; also exercises Tasks, recorded meetings, Cases and local proposal review through the triage detail; and records page exceptions and non-GET requests. It saves screenshots and `report.json` under `output/playwright/commercial-studio/`. The isolated test can inject the decorator until shared registration lands; once registered it uses the integrated assets.

Visual review inspected the large-screen Credit and Coverage compositions and corrected the chart domain and compact-screen product density. Full-book totals are never calculated from sampled cards. Overlapping scatter points can be selected through the company list. The chart is an observation landscape, not a fabricated stress score or loan delinquency chart.

QA follow-through: replaced the initial equal-card Workbench with a bounded source triage ledger and selected inspector. The selected content now determines its mode label, eliminating an inherited `events` route value mislabeled as the displayed task mode. Compact pipeline summary and stage pillars keep the deal actions closer to the first viewport.
