# Atlas visual and workflow parity review

This gate evaluates the standalone mock, not a Salesforce deployment. The prior source and browser suites remain the source-contract floor; their success does not establish that the design is compelling.

## Acceptance map

| Persona / scene | Visible capability and useful interaction | Evidence boundary |
| --- | --- | --- |
| Wealth / Today | Book pulse, first outreach, held-away, pipeline and actual weekly net flow are understandable before navigating away. | Net flow is credits minus debits, not trading volume or investment return. |
| Wealth / Pipeline | Stage composition and selected deal become a working decision surface; stage/search changes detail and next action. | Recorded Opportunity amount, owner, stage and close date stay distinct from modeled EV. |
| Wealth / Life & Goals | Compact month grid, meaningful milestone design and planning context coexist. A day/household can be selected without a customer ribbon. | Source milestones and CRM plans remain exact-account scoped. Zero CRM plans cannot inherit another household's plan. |
| Wealth / Growth | Preserve the capital map. Add actual product probability heat map, held-away consolidation and acquisition workflows. | Household + product cell must open the exact household/product context and proposal. Owned is not eligible; missing is not zero. |
| Wealth / Growth acquisition | Business-owner clients, business-to-wealth handoffs, upgrade prospects, warm introductions and leads are discoverable as distinct opportunities. | Existing majority-owner clients are a successful-empty source. Propensity is not conversion probability; confidence is not consent. |
| Wealth / Intelligence | Plan health, concentration, liquidity and trading have distinct useful visual lenses with an actionable selected record. | Plan aggregates include more than captured sample rows. Holdings value, deposit flow, outside assets and gross executions are different measures. |
| Wealth / Review Horizon | Due/risk/critical/stale lenses, review timing and selected household preparation form a coherent review desk. | Risk selection must use the risk source, not silently fall back to due rows. |
| Wealth / Workbench | Tasks, meetings, service and local drafts each have an appropriate visual workflow and exact-record action. | Account-less source events remain account-less until explicitly retargeted. Local proposals remain distinguishable from saved CRM records. |
| Commercial / Growth | Treasury lanes coexist with readable company/product probability coverage and development sources. | Exact company/product context; owned and unavailable states; no modeled EV copied into Opportunity amount. |
| Commercial / Health | Supplier payment distribution and company payment landscape support selection and a company-level next action. | PAYDEX / supplier days are separate from loan delinquency. Captured observations are not the complete book. |
| Commercial / Pipeline | Deal-stage composition, selection and next action form a bespoke company workflow. | Selected action must match the visible filtered deal. |
| Commercial / Workbench | Company tasks, meetings, cases and drafts support context-preserving review. | Retargeting clears graph/source company identifiers and requires review. |
| Shared shell | Waffle, View As, full search, notification/tasks bell, avatar, configuration, Setup and Data Cloud Setup remain reachable. | No implicit signed-in identity, unsupported View As book reuse or preview network writes. |

## Presentation gate

Inspect 1512, 1024, 768 and 390 pixel layouts. The main page must not overflow. Customer lists must not require horizontal scrolling. Primary actions and analytical labels must be readable. Charts must encode actual values and selection; decorative SVG count alone is not visual acceptance. Avoid a complete legacy page stacked beneath a new decorative introduction. Assess hierarchy, useful density, whitespace, contrast, customer identity, chart labeling and interaction discoverability from screenshots.

## Execution record

Integration run: **48 page layouts + 32 analytical variants** at 1512 / 1024 / 768 / 390, plus eight feature journeys. Zero page errors, non-GET requests, horizontal page overflow or duplicated complete page headings. Exact Wealth household/product → Opportunity proposal retains Account and leaves amount blank; Commercial cell → exact company/product proposal, Wealth deal/stage follow-up, calendar day, risk-map selection and Commercial payment selection all pass. Evidence: `output/playwright/atlas-visual-parity/report.json`; reproducible harness: `tests/atlas-visual-parity.browser.cjs`.

Visual inspection is a separate assessment. Reviewed actual desktop screenshots of Wealth heatmap, Pipeline, Life/Goals, Workbench and all four analytical lenses, plus Commercial Pipeline, Health and Workbench; reviewed phone Wealth Review Horizon and both probability-coverage views.

Final strengths: Wealth Pipeline is now a real date/value scatter desk with a compact source deal ledger. Life/Goals preserves the calendar and adds illustrated life moments and funding paths. Review Horizon adds planning composition, timing and selected-household preparation. Commercial Health is materially analytical. The revised Commercial Workbench replaces the initial repeated-card grid with a priority/date/status triage ledger and one exact-record inspector.

Remaining review observations sent to the implementers:

- Resolved: Wealth mobile all-product coverage initially expanded to roughly 6,000px. It now defaults to Managed Account, retains an explicit all-product choice and scrolls selected evidence directly into the viewport. The browser gate checks both default and actual selection position.
- Resolved: signed net-flow bars initially shared an upward baseline. They now use a zero baseline and negative-side geometry with an explicit note for tiny values.
- Resolved at source: capital-history SVG labels increased from 9px to 12px. SVG scaling still makes dense plot annotations smaller on a phone; principal values repeat in readable HTML.
- Wealth Workbench is useful master/detail, although its decorative preparation opening consumes about 325px before task controls. This is a density-polish opportunity rather than a missing workflow.
- Commercial Pipeline remains a fairly conventional stage-bar treatment. The builder compressed its opening and brought selected-deal actions higher after the first visual review.

Early inspection of builder screenshots (superseded where noted):

- Commercial Health materially improves the analytical workflow: proportional payment bands, a PAYDEX/supplier-days plot, selected-company detail and a compact company chooser. Identical source coordinates overlap; the textual chooser keeps each company reachable. Secondary agency-watch cards remain simple.
- Commercial Pipeline improves hierarchy and exact-company context but still devotes substantial vertical space to three plain stage bars. First deal actions appear far below the opening. A temporal view is behind a history action rather than integrated into the main canvas.
- Commercial Workbench initially had twelve equally tall text cards producing a roughly 2,800px page and mislabeled Tasks as “EVENTS”. Both were corrected: the integrated view uses a grouped triage ledger and one selected inspector, approximately 1,450px in the reviewed desktop screenshot.
