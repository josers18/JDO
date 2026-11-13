# Commercial Atlas Gap Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task, sequentially. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the Commercial Atlas mock's current-app capability gaps with source-backed company, treasury, credit and deal workflows while preserving existing production integration contracts.

**Architecture:** Add focused Commercial-only capture, selection and presentation modules to the standalone study. Exact Account, Opportunity and source-event keys travel across views and local proposals; reusable plumbing can be shared, but Commercial content stays company-specific. Current ReactCommercial fetchers, shared clients and Apex are behavioral references and remain unchanged by this mock plan.

**Tech Stack:** Existing static HTML/JavaScript/CSS Atlas study, Node built-in test runner, cached Playwright/Chromium, and bounded read-only Salesforce/Data 360 captures when implementation begins.

**Spec:** [Commercial gap analysis](../../design-studies/2026-11-12-directions/COMMERCIAL_GAP_ANALYSIS.md).

## Global Constraints

- Atlas only; Commercial is a company relationship/credit/treasury/deal workspace, not a Retail clone. Preserve existing Retail and Wealth scenes.
- Keep all implementation in `docs/design-studies/2026-11-12-directions/` and its tests/documentation. Production UI Bundles, Apex, metadata, live writes and deployment are separate scope.
- Preserve current capabilities and backend plumbing from [FUNCTIONALITY_MAP.md](../../design-studies/2026-11-11-cockpits/FUNCTIONALITY_MAP.md). The source implementation is not proof of deployed runtime success.
- Exact Account/Opportunity/Lead/Contact/FinancialPlan IDs and source refs establish association. Names, visual proximity, generated array indexes and an external case reference do not.
- Record provider period, capture time, scope, sample limit and source state per feed. Independent aggregates never come from a visible sample or local drafts.
- Graph confidence, offer probability, expected value, D&B scores, liquidity flags, sentiment and source event dates retain distinct meanings. No synthetic credit outcomes, histories, dates, company contacts, ratios or appointments.
- All mock actions remain private local proposals. Existing stage-preview/checklist/readiness states do not update bank records.
- Preserve unrelated working-tree edits; stage explicit paths and checkpoint each tested milestone. Reuse the current design branch or an explicitly chosen child design branch; never force push.

## Review Focus

- Repeated company names and several Opportunities under one company must retain separate exact IDs through every draft and return path.
- A source may be org-scoped, stale, successful-empty or unavailable. None may be presented as a current zero-valued banker-book metric.
- Higher-is-safer D&B directions conflict with one customer-source label; severity/rank-derived health/drop must not become observed score/history. Resolve or visibly withhold the disputed presentation.
- Graph owner/target Accounts, CRM Leads, Contact WhoIds, external ServiceNow refs, book ownership and activity assignees are separate identities.
- Returning from company details/Workbench and switching persona must preserve the intended Commercial context without showing Retail/Wealth data or replaying an action.

## File and interface map

All proposed paths below are inside `docs/design-studies/2026-11-12-directions/` unless a full path is shown. New names are planned interfaces, not claims that code already exists.

| Module | Responsibility / proposed interface |
|---|---|
| `commercial-context.js` | Pure selector `createCommercialContext({ownerId, accountIds, offerSources, holdingSources})` → `offersForAccount(accountId, ownerId)`, `holdingsForAccount(accountId, ownerId)`; exact-ID allowlist and deterministic source precedence independent of page filters. |
| `commercial-data.js` | Bounded, immutable Commercial fixtures and `sources[key]={state,scope,capturedAt,period,limit}`; actual account names/IDs and source refs only. Split by milestone if it becomes unwieldy. |
| `commercial-priorities.js` / `.css` | Company-first Today triage, actual driver evidence, due views and source-linked first-move actions; source rules live in a focused pure `commercial-priority-core.js`. |
| `commercial-intelligence.js` / `.css` | Company market/risk inbox and credit/coverage watch modes; `normalizeCommercialSignals(capture, scope)` preserves native source fields and `signalsForAccount(accountId)`. |
| `commercial-growth.js` / `.css` | Treasury coverage, native holder/mover/outcome behavior, Lead/introduction/owner-handoff modes and proposal editors; pure rules in `commercial-growth-core.js`. |
| `commercial-customer.js` / `.css` | Coherent exact-company accounts, cash/service/conversation/notebook and provider dossier; activity/goal editors preserve supported fields and original records. |
| `tests/commercial-*.test.cjs` / `.browser.cjs` | Pure source/identity tests and actual record journeys, including other-persona regressions. |
| `tests/commercial-*-capture.sql` / `.soql` | Read-only query evidence, source filters, bounds and periods; not automatic startup scripts. |
| `COMMERCIAL_*_MILESTONE.md` | Each milestone's decisions, capture limits, validation, unresolved source issues and next step. |
| `workspace.js`, `workspace.html`, `persona-workspaces.js`, `atlas-home.js`, `atlas-expansion.js`, `workbench-collections.js` | Minimal guarded dispatch/action integration; no large wholesale rewrites or leaking persona content. |

## Milestone 0 — source rules and checkpoint (C15; foundation)

**Files:** Commercial audit, this plan; new `COMMERCIAL_SOURCE_CONTRACT.md`; focused `tests/commercial-context.test.cjs` when selectors begin.

**Inputs:** `ReactCommercial/src/home/homeDataReal.ts`, `HomePage.tsx`, `personas/customer/customerDataReal.ts`, `full360DataReal.ts`; shared `commercialWhoToCall.ts`, `priorityQueue.ts`, `dataCloudClient.ts`, `crmWriteClient.ts`, `CrmWriteRest.cls`.

- [ ] Inspect current branch/status and re-read the audit. Record which current-source claims remain runtime-unverified; preserve the 44-surface audit as dated evidence rather than acceptance results.
- [ ] Write a field/metric contract for PAYDEX, failure score, delinquency predictor, composite risk, source deal risk and supplier-payment days. Record the customer/home predictor-direction conflict without silently choosing a meaning.
- [ ] At future read-only capture time, verify org and banker identity again. Select the book explicitly and capture scope metadata; do not run a shared helper's empty-book fallback and label its results as Allen's book.
- [ ] Record a ruling for disputed/missing values: use verified source label/direction where available; otherwise show raw/unavailable context without invented risk color or fabricated health/drop. Real source-policy changes remain separate production work.
- [ ] Commit source-contract/audit checkpoint. No production fixes or live writes are included.

**Exit:** Every later score/count has a defined source, meaning and scope; ambiguous health/drop and predictor direction cannot be mistaken for observed validated metrics.

## Milestone 1 — exact company/product/deal continuity (C03, C08; foundation for C06/C13)

**Files:** create `commercial-context.js`, `commercial-data.js`, `tests/commercial-context.test.cjs`, `tests/commercial-context.browser.cjs`; minimally modify `workspace.js`, `workspace.html`, `persona-workspaces.js`.

**Produces:** exact company offer/holding selectors and proposal fields `{accountId, offerCode, offerAccountId, sourceRef}`; deal preparations additionally carry `{original: opportunityId, opportunityId}`. Changing an Account invalidates incompatible product/deal provenance, including on the first save.

- [ ] Write failing tests for Cameron-Olson's captured product rows/history, another scored company, wrong-owner/unknown exclusion, duplicate source precedence, two identically named companies and multiple deals under one Account.
- [ ] Run `node --test docs/design-studies/2026-11-12-directions/tests/commercial-context.test.cjs`; observe the missing-selector failures.
- [ ] Implement page-independent selectors over existing captures first. Keep actual histories/holdings; do not infer missing balances or an unmet need from a score alone.
- [ ] Render the exact selected company's scored offers and known holdings in 360. Carry Account + exact product into task/opportunity proposals and Opportunity + Account into deal preparation/follow-up.
- [ ] Add browser journeys Growth → exact company → same product/evidence → draft → Workbench → edit/reload/return; Pipeline/deal room → exact Opportunity → follow-up. Test first-save and later Account reassignment cleanup.
- [ ] Verify at 1512/1024/768/390px; repeat with duplicate-name companies and Retail/Wealth isolation. Run the existing Retail suites once after shared-dispatch edits.
- [ ] Commit/push the tested milestone and log the exact captured scope. No score history may be manufactured for missing rows.

**Exit:** A company/deal never loses or borrows its product, ownership evidence or source identity when changing views.

## Milestone 2 — company-first Today, payment and credit triage (C01, C02, C04)

**Files:** new `commercial-priority-core.js`, `commercial-priorities.js`, `.css`, capture SQL/SOQL and pure/browser tests; modify guarded Commercial Today/Health dispatch.

**Consumes:** exact selectors and source contract. **Produces:** normalized work items `{key,accountId,sourceRef,sourceDate,dueDate,action,drivers,score?,severity?,scope}`. Scores/severities are native captured/calculated source outputs or explicitly unavailable; never guessed from a company name.

- [ ] Write failing tests for native driver weights/order, exact-account/action dedupe, Opportunity/overdue-Task derivation, reserved market-signal slot, due buckets, snooze/refill and absent probability. Compare against actual `commercialWhoToCallItems` / `buildPriorityQueue` behavior where possible.
- [ ] Verify test failures, then capture bounded top-source rows, independent payment/credit aggregates and weekly business net-flow/CRM history using current app query contracts. Record caller scope and the disputed predictor presentation from Milestone 0.
- [ ] Build a compact hero/pulse followed by company triage: defend/support the relationship, then progress an eligible treasury/financing discussion. Keep pipeline near the opening work area and use native business cash semantics.
- [ ] Add payment-band and credit-driver inspectors with constituent captured company lists, source dates and actual available history. Book counts are independent of the sampled rows; payment bands remain supplier-credit observations.
- [ ] Add qualifying ACH receipt, fee-spike, Gong and AML examples to Today with exact-company handoffs. Missing/empty/stale/future evidence must have explicit states; no derived mock health/drop is labeled observed.
- [ ] Run pure tests and browser journeys first move → Why/Prep/company → task → Workbench; snooze/restore; payment band → company; negative business flow; source failure. Verify no banking status changes or network writes.
- [ ] Commit/push and log source rules, snapshot limits and any unresolved interpretation.

**Exit:** Today demonstrates actual Commercial decision inputs and supported source actions, not just a saved story carousel.

## Milestone 3 — company intelligence and credit/coverage workbench (C04–C06, C09)

**Files:** `commercial-intelligence.js`, `.css`, focused core/capture/tests; modify `atlas-expansion.js`, `workspace.js` and Commercial persona dispatch.

**Produces:** `normalizeCommercialSignals(capture,scope)` and `signalsForAccount(accountId)` with separate family/source/ref/Account/date fields; provider dossier selectors also require exact AccountId and source period.

- [ ] Write failing tests for source-specific keys; duplicate names; multiple independent events per company; booked/current event distinction; AML New/Changed/null-prior rules; missing source fields; and external ServiceNow references.
- [ ] Verify failures, then capture bounded Demandbase competitor/surge, Harmonic funding, UserGems champion, Moody's outlook, BoardEx leadership, MSCI mover, marketing and ServiceNow examples only where source returns them. Capture independent summary counts when needed; do not force a populated example by inventing records.
- [ ] Capture a second company-provider dossier with ZoomInfo/BoardEx/MSCI/SEC fields from `fetchFull360Real` contracts. Preserve actual SEC no-match and unavailable/error states; populated filing sections require real source text/identifiers.
- [ ] Build a defend/develop inbox with actionable selected evidence, customer/source/date search and actual native alert precedence. Preserve original/current/new-employer associations and never manufacture a Contact or available funding proceeds.
- [ ] Extend Credit & coverage with company results for payment/outlook/ESG/leadership and firmographic/market cohorts. Retain the current payment bands and ZIP visualization; ESRI recommendation never asserts a branch closure.
- [ ] Connect every source to exact company Today/360 evidence and an Account-linked local follow-up. CRM Cases and external ServiceNow records remain separate; dates and null flags stay honest.
- [ ] Test source → company → proposal → Workbench → return; no-result/missing-source cases; two companies; all four widths; keyboard chart/list actions and other-persona isolation.
- [ ] Commit/push and record which feed/source states remain unverified. Source queries are read-only; compliance workflow or credit decisions are not simulated as completed actions.

**Exit:** Market and risk context is a workable company desk with per-company provider depth, not two name-only stories or a single hardcoded dossier.

## Milestone 4 — treasury growth and business development (C07, C10, C11)

**Files:** `commercial-growth-core.js`, `commercial-growth.js`, `.css`, bounded data/capture/tests; minimally modify `persona-workspaces.js`, `workspace.js`, `workbench-collections.js`.

**Produces:** exact Account/product coverage and existing-opportunity keys; directed introduction/handoff `{key,businessAccountId,referrerAccountId,targetPersonAccountId,confidence,discovered,scope}`; Lead proposals retain these separately from `original` Lead ID and Contact/Lead `whoId`.

- [ ] Write failing tests for twelve total native coverage rows including three reserved Corporate Card holders; best eligible offer within grouped Treasury/Equipment/SBA columns; disjoint Operate/Optimize cash/Fund growth membership; ownership gates; held-away reason; native book movers; actual zero versus missing outcome aggregate.
- [ ] Run tests to observe failures, then capture bounded native grid/holder/mover/history/held-away examples and independent open/Won outcomes. Source sample limits and owner scope must be visible. A missing history remains unavailable.
- [ ] Implement coverage beside the existing treasury lanes. Keep probabilities, EV, balances and proposed Opportunity amount distinct; source grid outcomes do not increase when a local draft is saved.
- [ ] Write failing identity/field tests for real CRM Leads, warm introductions and owner-Wealth handoffs; include same-name targets, no contact names, missing email, legacy source/status values and zero/blank AnnualRevenue.
- [ ] Capture actual graph/handoff examples and active source metadata where authorized. Build separate CRM Lead / suggested introduction / owner-handoff modes inside a cohesive business-development area; only add a top-level Prospecting route if the UX review justifies it over a Growth mode.
- [ ] Implement full Lead create/edit/review and prefilled proposals. Graph confidence is relationship confidence, not consent or conversion. Do not identify a referring employee merely from Employee Referral source text. AnnualRevenue is annual company revenue.
- [ ] Browser-test source → directed business/owner identities → reviewed Lead proposal → Workbench edit/reload; cell/mover → same product/company → opportunity proposal → return; owned/existing-opportunity and missing-source states at all widths.
- [ ] Commit/push, update the capability matrix and record remaining production creation/ownership constraints.

**Exit:** Commercial origination works through actual company and owner relationships, with preserved native cross-sell contracts and distinct Lead identities.

## Milestone 5 — coherent company execution and dossier depth (C08, C12, C13)

**Files:** `commercial-customer.js`, `.css`, focused source/core/tests; guarded integration with `atlas-expansion.js`, `workbench-collections.js`, `workspace.js`.

**Produces:** a coherent exact-company source bundle; activity proposals retain `{original,sobjectType,operation,accountId,whatId,whoId,ownerId}` and goal proposals retain `{financialPlanId,accountId,type,priority,description}`.

- [ ] Write failing tests for source Task/Event versus newly planned meeting, original assignee versus account owner, supported update fields, UTC start-time round-trip, date-only goals, FinancialPlan scoping, private-note account separation and unavailable finance/source totals.
- [ ] Capture one coherent Commercial company's financial accounts/transactions, actual Tasks/Events, interactions, notes, cases, campaigns, plans/goals and available provider records. If Cameron is sparse, retain Cameron's Company Intel and choose another verified company for execution depth; record successful empty responses honestly.
- [ ] Build a company cash/service/conversation dossier and activity inspector. Keep business context primary and distinguish any genuinely linked owner/person plans or milestones. Remove Julie-oriented empty guidance without filling it with invented company data.
- [ ] Preserve current create/update/delete support from `CrmWriteRest`: fixed versus editable Who/What/Owner, Event duration/update limitations, blank-update semantics and success-only execution/refetch requirements remain explicit. All mock operations stay proposals.
- [ ] Ensure source Event update/delete proposals never enter the new-meeting planning calendar; selected deal preparation keeps Opportunity and Account IDs in the relationship outbox. Reassignment clears stale source provenance.
- [ ] Run source → company → Task/Event/goal proposal → Workbench full edit/review → return journeys, including two same-name companies, unknown assignee/date, no note/campaign rows and missing/partial balances. Repeat other-persona regression gates.
- [ ] Commit/push the tested milestone and document coherent-capture limits and inherited source defects.

**Exit:** Company execution and customer depth are demonstrated with real record relationships, while human-owner context stays separate and supported capabilities remain reachable.

## Milestone 6 — Commercial acceptance and migration readiness (C14–C16)

**Files:** update Commercial audit/coverage/milestone docs; create `COMMERCIAL_MIGRATION_CONTRACT.md`, `COMMERCIAL_PRODUCTION_ACCEPTANCE.md` and a separate future production implementation plan.

- [ ] Re-audit every C01–C16 row as design-covered, partial, unavailable/unverified, integration-only or future scope; attach actual test/capture evidence rather than a parity percentage.
- [ ] Specify URL/Back/search/cohort/source/company/selected Opportunity/Workbench persistence and signed-in actor versus View As book semantics. Private drafts must be keyed by org, actor, persona and source record context; existing tab storage is not a production security boundary.
- [ ] Map every designed action to supported React clients/fields/operations, recipient/account lookup, permission/ID validation, real error/retry behavior and success-only refetch. Resolve cross-sell viewed-owner behavior separately from general session-actor writes.
- [ ] Preserve actual ACC teardown/re-embed, configured AI/model catalog, valid prompt-flow slots, theme library/per-user activation/display size, shell utilities, loading/error/source freshness and source/client boundaries. A visible agent context label alone does not establish record grounding.
- [ ] Record source issues and production decisions separately: disputed delinquency direction, rank-derived health/drop, broad fallback scope, default/missing values, local-only Details editing, synthetic display IDs and unsupported profile/team/facility operations. Do not quietly promote them to working integration.
- [ ] Define gated Commercial production acceptance: exact company/deal continuity; credit semantics; owner handoff; corporate intel empty/populated; external service isolation; identity/View As; failed-write no-refetch; successful-write refetch; retry ambiguity; AI/config/theme persistence; keyboard/mobile and Retail/Wealth regressions.
- [ ] Commit/push the reviewed contract and plan. Production execution/deployment needs its own explicit scope; this milestone documents readiness gates rather than performing a migration.

## Verification commands and checkpoint policy

From the repository root, use `node --test docs/design-studies/2026-11-12-directions/tests/commercial-<milestone>.test.cjs`. Run each matching browser script against the port-5187 preview, using the existing cached Playwright/Chromium setup described in the study tests README. Every implementation milestone must report the actual commands/results, page-error/network-write checks and capture limits. Screenshots are local artifacts under `output/playwright/commercial-<milestone>/`; they do not replace assertions or production acceptance.

Commit a coherent tested milestone with explicit paths, update its log/audit status, and push without force when the session's authorization remains in effect. Do not stage unrelated files, source credentials, generated browser output or captured authentication material.

## Progress

- Plan created November 13 after the Commercial source/browser gap analysis. Planning and the 44-surface local inventory are complete; implementation milestones remain unchecked.
- Ruling: preserve the strong existing Commercial compositions and fill source/record workflow gaps. No account-team, facility/covenant engine, A/R aging or borrowing-base source was established by this audit; those remain separately specified future scope, not missing current functionality to fabricate.
