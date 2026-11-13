# Retail Atlas Gap Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task, sequentially. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the Retail Atlas mock's existing Retail workflows and preserve current application capabilities before a separately authorized production migration.

**Architecture:** Keep all design implementation inside the standalone study. Introduce small exact-record selectors and focused workflow modules rather than replacing production fetchers or growing duplicate data paths. Reuse captured source records; acquire additional read-only captures only where needed and label unavailable/source/date states honestly.

**Tech Stack:** Static JavaScript/HTML/CSS, Atlas tokens, Node built-in test runner for selector contracts, Playwright for user journeys.

**Spec:** [Retail gap analysis round 2](../../design-studies/2026-11-12-directions/RETAIL_GAP_ANALYSIS_ROUND_2.md).

## Global Constraints

- Atlas is the only direction receiving new design work; Retail is the current persona focus.
- Keep persona content bespoke; share only plumbing and primitives.
- Preserve exact Account/Lead/Contact/FinancialPlan/source identities across navigation and drafts.
- Source counts, dates, known holdings, unknown balances and modeled probabilities have distinct meanings.
- No invented records, histories, appointments, referrers, banking outcomes or live AI responses.
- All mock actions remain local drafts. Do not modify production bundles/Apex or deploy under this design authorization.
- Preserve unrelated working-tree changes. Stage explicit paths only; push the feature branch without force.
- Commit the existing design baseline, then independently tested milestones. Record progress and remaining gaps here.

## Review Focus

- Duplicate names: associations must use exact IDs; never merge or guess ownership from names.
- Sparse records: an absent capture must stay unavailable, not imply zero source activity.
- Scope: cohort filters must not remove a customer's evidence when opening 360; Retail data must not leak into other personas.
- Draft continuity: exact IDs and source context must survive creation/editing/reload and Workbench review.
- Responsive/source semantics: preserve readable labels and keyboard actions; no invented dates, trends or balances.

## Milestone 0 — checkpoint the existing study and plan

**Files:** `docs/design-studies/2026-11-11-cockpits/`, `docs/design-studies/2026-11-12-directions/`, this plan.

- [x] Inspect staged files for secrets/generated artifacts; include the earlier study because the current mock imports its fixtures.
- [x] Commit the existing design and gap-analysis baseline, retaining all source-data scope notes.
- [x] Push and track `design/retail-atlas-gap-closure`.

## Milestone 1 — exact-customer Growth → 360 → follow-up continuity (R06; part of R07)

**Files:** create study `retail-context.js`, `tests/retail-context.test.cjs`; modify `workspace.js`, `workspace.html`; add focused browser regression script under `tests/`.

**Interfaces:** `createRetailContext({ownerId, accountIds, offerSources, holdingSources})` establishes the allowed capture owner/account set. `retailContext.offersForAccount(accountId, ownerId)` returns deterministic, deduplicated captured Account/product rows with provenance; `holdingsForAccount(accountId, ownerId)` returns known source holdings without inferring balances. Pure selectors do not inherit page/cohort filter state.

- [x] Write failing selector tests for Kyle's captured offers, duplicate precedence, unknown accounts, wrong-owner exclusion and known holdings without balances.
- [x] Implement selectors over existing captured datasets. Keep original eligibility/history rows authoritative on duplicate Account/product keys.
- [x] Render the exact customer's scored offers and available history in relationship Opportunities, including model evidence and Account-linked opportunity/task draft actions.
- [x] Show known product holdings separately from complete financial accounts when no balances were captured; remove contradictory "nothing captured" messaging.
- [x] Verify main Growth → Kyle → same product/evidence → exact-account draft → Workbench, plus another captured Retail customer and Wealth/Commercial isolation at desktop/mobile sizes.
- [x] Commit, push and update progress log; do not claim missing real customer histories were captured.

## Milestone 2 — daily prioritization and pulse (R01, R02; part of R11)

**Files:** create `retail-priorities.js` and focused CSS/tests; modify `atlas-day-hero.js`, `retail-workflows.js` and Retail capture module if additional real signal rows are obtained.

**Interfaces:** normalized priority items preserve source record/account, reason, due date, source scope and action. Production `buildPriorityQueue` and current Right Now selection are the behavioral reference, not a fabricated new score.

- [x] Capture bounded source-backed Retail Who-to-Call/transaction/liquidity examples and weekly net-flow/history aggregates where available; preserve unavailable states otherwise.
- [x] Test deduplication, source coverage, due buckets, reserved eligible liquidity item and recent-browser versus top-call first-move behavior against current production contracts.
- [x] Connect hero, Why/Quick View/Prep, explicit session snooze and compact Today/This week/Watch queue. Preserve pipeline position directly below the hero.
- [x] Add weekly flow/attention context and actual-source pipeline movement/history drill-ins. Never copy fixed Wins $0 or schedule-count-as-seven-day-activity.
- [x] Verify exact-account action continuity, source failure/empty examples, keyboard/mobile behavior; commit and push.

## Milestone 3 — business development (R03–R05, R10)

**Files:** `retail-cohesion.js`, `workspace.js`, new `retail-prospecting-data.js` if needed, focused tests.

- [ ] Add current Lead source/AnnualRevenue create/edit fields and preservation tests.
- [ ] Capture real relationship-graph introductions; keep referrer/target/confidence/date/scope distinct from CRM Leads. Do not invent a referring employee for Employee Referral rows.
- [ ] Build Introductions mode and prefilled create-Lead proposal; test duplicate-name and Lead/Account identity boundaries.
- [ ] Carry complete cross-sell holder/mover/reason/outcome contracts into Growth design using actual-source examples; whole-book outcomes must not be calculated from visible samples.
- [ ] Connect home equity/refinance/mortgage/invest-ready cohorts using the current source targeting rules and renter gates.
- [ ] Browser-test source → lead/opportunity → action → return, including no-result/missing-contact states; commit and push.

## Milestone 4 — Retail customer and execution depth (R07, R11, R12)

**Files:** bounded Retail capture module; `atlas-expansion.js`, `workspace.js`, `retail-workflows.js`, `workbench-collections.js`, focused tests.

- [ ] Obtain one coherent Retail customer's accounts/transactions, interactions, notes, goals/plans, campaigns and actual Task/Event records where sources return them.
- [ ] Populate Retail-specific financial, engagement, notebook and campaign views; replace Wealth-oriented empty-state guidance inside Retail.
- [ ] Preserve goal type/priority/description/plan identity and existing supported Task/Event fields/operations.
- [ ] Demonstrate actual-source agenda separately from proposed meeting drafts; support exact WhoId/WhatId and source assignee semantics.
- [ ] Test record continuity, missing-capture boundaries, private preparation and draft review; commit and push.

## Milestone 5 — signal and risk coverage (R08, R09)

**Files:** new Retail signal capture/normalization module, `persona-workspaces.js`, `retail-refinement.js`, focused tests.

- [ ] Add source-backed liquidity, large inflows, marketing touches and AML/Gong changes to an Intelligence inbox.
- [ ] Add book property-exposure, engagement and ServiceNow watch modes within Health, preserving CRM/external service separation.
- [ ] Connect each source/customer/date/reason/action to Today and 360; cover true empty/unavailable/stale states.
- [ ] Review responsive density and record-level journeys; commit and push.

## Milestone 6 — migration contract and production readiness (R13–R18)

**Files:** current study coverage/preservation docs and a separate production implementation plan.

- [ ] Specify route/Back/cohort/prospect/Workbench context persistence and exact signed-in/View As semantics.
- [ ] Map every designed action to existing React clients, supported CRM fields/operations and success/error/refetch behavior.
- [ ] Plan existing Agentforce, AI action/model catalog, full theming/display scale, shell utilities and per-source loading/retry integration.
- [ ] Document private-draft persistence/ownership contract and inherited implementation limitations.
- [ ] Re-audit the capability matrix; define production acceptance journeys. Production implementation/deployment is a subsequent scope, not implied completion of the mock.

## Progress log

- Plan created after the second Retail audit. Current baseline has 10 Retail destinations and nine relationship tabs; the key initial defect is Kyle's missing relationship-level offer evidence despite existing Growth scores.
- Implementation starts with Milestone 1. Other milestones remain open until their data, workflow and verification steps are complete.

- Milestone 0 complete: baseline commit `8a58bb51b` pushed with tracking branch `origin/design/retail-atlas-gap-closure`. The commit includes both design-study directories because the current mock imports the earlier fixtures; unrelated files and generated output are excluded.
- Milestone 1 complete: six pure-selector tests and the committed browser journey passed. Kyle's six native Retail product scores/history now render in relationship Opportunities. Source precedence, owner/account allowlist, unknown records, non-mutation and balance-unavailable holdings are tested. Product/account keys survive local follow-up into Workbench; changing the draft's Account clears stale product linkage. Returning through navigation preserves the Growth cohort. Browser checks cover two Retail customers at 1512/768/390px plus Wealth/Commercial isolation, without page errors or network writes.
- Ruling: this initial execution batch covers the baseline and Milestone 1; subsequent milestones remain scheduled work. The user's instruction was to create the plan and start, so no production migration or speculative new source data is included in this first checkpoint.
- Next: Milestone 2, daily prioritization and pulse. R06 is addressed for the relationship Opportunities path; broader profile/overview/source-signal enrichment, real Retail interactions and live integrations remain open under R07 and later milestones.

- Milestone 2 complete (Nov 13): source-backed first-move selection, ranked queue/due views, Why/Quick View, exact-record preparation, explicit session snooze/restore, signed weekly net-flow/attention/Lead pulse and pipeline snapshot history. Current app SQL and a fresh read-only six-Opportunity Probability query are captured; the org and Kim's scope were verified. Nine core tests plus six prior selector tests passed; new Today browser journeys and the previous customer-context browser suite passed. Details and source limits are in `docs/design-studies/2026-11-12-directions/RETAIL_PRIORITY_MILESTONE.md`.
- Ruling: preserve the current captured Who-to-Call scores, but label stress as source observations because its CTE returned values above six; do not reproduce a false six-month statement. Fixing that production query is separate from mock design. Reconstruct stage amounts only for currently open opportunities; do not call them stage transitions.
- Ruling: exact AccountId/action dedupe, retention of known derived-item IDs, future-browsing rejection and local snooze/refill improve identity/recency semantics without changing production modules. Other independent signal feeds remain Milestone 5 work; Milestone 2 does not claim complete live ranking coverage.
- Next: Milestone 3, business development. Existing Lead source/value fields, relationship-graph introductions and cross-sell outcome/mover depth remain open.
