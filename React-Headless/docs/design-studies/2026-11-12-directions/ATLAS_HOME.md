# Atlas main-page expansion

The user clarified that the desired gap-closing work belongs on the main banker/home side of the app, not primarily in customer drill-ins. Atlas Today now dispatches to three independent compositions in `atlas-home.js` / `.css`. Earlier Panorama and Focus homes remain unchanged.

| Persona | Main surface | Supporting views visible directly on home |
|---|---|---|
| Retail | Service-care / deposit-relationship / support-signal modes with selected-customer focus and in-place case/follow-up actions | Recorded commitments, source-backed product opportunity, life-event strip, full captured stage aggregates |
| Wealth | Upcoming-household selector with modeled plan-success ring, source review date, goal amount, last plan update and review/meeting preparation | Two outside-platform capital paths, selected Julie trade-day pulse and execution tickets, commitments, product opportunity and pipeline |
| Commercial | Owner-scoped D&B payment-band river plus selectable company/source docket and company evidence workspace | Pipeline stage view, selected opportunities and deal-room access, recorded commitments and product opportunity |

Every home retains the captured owner-scoped pipeline/task aggregate and account-owner CRM case aggregate in a slim shared pulse. KPI values are snapshots, not live. Conditional or bounded sources are not presented as complete book totals. Provider review dates are distinct from booked meetings, gross trade executions from portfolio flow/performance, and D&B supplier-payment behavior from loan delinquency. Source age and captured task dates remain explicit.

Retail retention uses the source's largest-inflow institution rule while the displayed flow/balance summarizes all captured qualifying outside-deposit accounts for that customer. Stress markers summarize the captured six-month High count, not newly generated observations. Wealth's review selector uses the six upcoming source-plan samples captured for Jose; outside-platform positions remain separate from all other assets. Company signals retain their saved-source labels and do not claim production queue ranking, live changes, or full coverage.

Home selections are isolated per persona. Follow-up tasks/meetings carry exact Account IDs into the existing local draft forms. Source cases, opportunity records, trade executions, offer evidence, payment-band detail and task-operation proposals can be opened directly from home. No captured source state or production data is mutated.

The Relationships directory also contains an explicit entry panel linking to the expanded profile, persona health and task-action views. The top bar identifies Atlas as the expanded workspace, and local assets use a new version URL so browser caches do not conceal the change. `page=today` is the main landing page; `page=relationships` without `client` is the directory, not a customer workspace.


## Verification

The three main homes were checked at 1512px, 1024px, 768px and 390px (12 layouts), with no page overflow or JavaScript errors. Browser journeys covered Retail service/retention/stress selection and exact-ID follow-up; Wealth household switching, meeting preparation, date-filtered trade tickets and outside-platform handoff; Commercial payment-band detail, company selection, evidence and deal-room navigation; and a task-operation proposal drafted directly from home. Screenshots and results are under `output/playwright/atlas-home/`. Directory shortcuts were separately checked for all three personas at desktop/mobile widths. No production app code or Salesforce data changed.


Home copy addresses the signed-in RM directly: “Welcome back, Kim/Jose/Allen,” followed by the persona’s own customer needs/reviews/company priorities. Do not describe the RM in third person or narrate the workspace as a product tour. Customer and company names still identify source records normally.
