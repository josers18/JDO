# Wealth Atlas Gap Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the Wealth Atlas mock’s advisor, household-review and business-development workflows while preserving current ReactWealth capabilities and exact source identities.

**Architecture:** Keep new design work inside the standalone study. Compose Wealth-specific advisor-agenda, review-horizon, capital/exposure, intelligence and execution modules over small pure exact-record selectors and bounded captured source envelopes. Share study plumbing and primitives; do not copy Retail’s layout or replace production clients during mock implementation.

**Tech Stack:** Static JavaScript/HTML/CSS, existing Atlas tokens, Node built-in test runner, Playwright; read-only CRM/Data Cloud capture using the existing source contracts when execution is authorized.

**Spec:** [Wealth current-app gap analysis](../../design-studies/2026-11-12-directions/WEALTH_GAP_ANALYSIS.md).

## Global Constraints

- Atlas is the only direction receiving new work. Wealth remains an independent advisor experience, with readable type, meaningful density, investment/planning visuals and compact source worklists.
- All authored actions remain local proposals. No production bundle/Apex edits, live CRM writes or deployment are included in this mock plan.
- Preserve exact Account, Contact/Lead, FinancialPlan, goal, Task/Event, employer/company and Account+offer keys. Display names never establish associations.
- Keep held-away opportunity, digital-platform assets, CRM financial-account balances, holdings-source AUM, modeled EV, probability, propensity, gross execution value and net flow distinct.
- Query calculations belong in Data Cloud where available. Reuse the native query/select/ranking contracts; never create a new health or conversion score from visual preferences.
- Retain source date, owner scope, query bounds, returned scope and unavailable/successful-empty states. Never silently display org fallback as an advisor book or infer a complete book from top rows.
- Provider review dates are not booked Events; CRM goals link through FinancialPlan. No invented family roles, beneficiaries, meetings, investment returns, consent, proceeds received or successful bank actions.
- Existing Retail and Commercial views/wiring remain isolated. Preserve unrelated working-tree changes; stage explicit files, commit and push tested milestones on the authorized design branch without force.

## Review Focus

- Two customers can share a name; identical Account+product evidence must survive Growth → 360 → local action → Workbench and be cleared when the linked Account changes.
- An empty advisor book, org fallback, failed source, missing amount, true zero and incomplete capture must remain distinguishable.
- A changed source/owner/date must invalidate mismatched selection/preparation; Back/reload must not attach the previous household’s material to a new household.
- Provider plan health, native CRM goal funding and actual Task/Event dates/assignees are independent records with different write contracts.
- A polished household view must not convert source defaults, illustrative family roles, a visual Agentforce context label, sample execution values or computed “health drop” into observed facts.

## Planned file responsibilities

Paths below use `S = docs/design-studies/2026-11-12-directions/`. These are planned files, not an instruction to create empty placeholders now.

| File group | Responsibility |
|---|---|
| `S/wealth-context.js`, `S/wealth-capture-data.js` | Capture envelope, exact owner/account allowlist, source precedence, customer/product/plan selectors and immutable source records. |
| `S/wealth-priority-core.js`, `wealth-priorities.js/.css` | Native advisor ranking/due context, source-specific first outreach, compact agenda and vitals, without name-coded financial metrics. |
| `S/wealth-planning-core.js`, `wealth-planning.js/.css` | Provider plan risk/due/stale views, compact review grid, selected household and source-to-goal context. |
| `S/wealth-capital-core.js`, `wealth-capital.js/.css` | Investable held-away versus platform context, ticker/client exposures, coverage/movers/outcomes and Acquisition lenses. |
| `S/wealth-intelligence-core.js`, `wealth-intelligence.js/.css` | Wealth source inbox, actual weekly trading pulse and net-seller evidence, Today/360 handoffs. |
| `S/wealth-execution-core.js`, `wealth-execution.js/.css` | Complete goal/Lead forms, actual activity versus proposal separation, folio/private preparation and draft editing. |
| `S/tests/wealth-*.test.cjs`, `wealth-*.browser.cjs` | Pure identity/source contracts and meaningful record-level/browser journeys. Add capture SQL/SOQL and milestone notes beside each capture. |
| `S/workspace.js/.html`, `persona-workspaces.js`, `atlas-home.js`, `atlas-day-hero.js`, `atlas-expansion.js`, `workbench-collections.js` | Small gated dispatch points only. Preserve Retail-specific modules and existing persona paths. |

Core interfaces to settle before UI work:

- `createWealthContext({capture, effectiveOwnerId})` exposes `offersForAccount(accountId)`, `holdingsForAccount(accountId)`, `plansForAccount(accountId)` and source status. The capture envelope includes `{capturedAt, ownerId, orgId, sources, datasets, accounts}`; each source includes returned scope, bounds and period.
- Signal records preserve `{key, accountId, source, sourceRecordId?, sourcePeriod, reason, nextStep, dueDate?, ownerId, captureScope}`. Account+offer actions add `{offerCode, offerAccountId}`. A graph introduction separately retains referrer/target IDs.
- Context selection keys include persona+effective owner+exact Account+source key. View selection does not filter the customer’s source evidence. Local draft creation/edit functions invalidate source associations on Account/plan changes as required by their actual contracts.

## Milestone 0 — evidence and preservation checkpoint (W12/W14)

**Files:** `S/WEALTH_GAP_ANALYSIS.md`, this plan, `S/wealth-capture-data.js`, `S/tests/wealth-source-capture.sql/.soql`, `S/WEALTH_CAPTURE_SCOPE.md`.

- [ ] Re-read this spec, `AGENTS.md`, the Retail [migration contract](../../design-studies/2026-11-12-directions/RETAIL_MIGRATION_CONTRACT.md) and [acceptance contract](../../design-studies/2026-11-12-directions/RETAIL_PRODUCTION_ACCEPTANCE.md). Reuse identity/execution principles, not Retail layouts.
- [ ] Verify active branch/HEAD and preserve unrelated files. Record current source functions and existing browser baseline before changing shared study dispatch.
- [ ] At implementation time, verify the target org and effective Wealth advisor. Capture source-scoped examples and separate aggregates using native query contracts; retain sample limits and date periods. Resolve Account names in chunks of at most 50 and verify ownership.
- [ ] Select Julie only if still appropriate to the verified Wealth capture, plus one second genuinely different customer with usable source data. Keep sparse source domains explicitly unavailable; do not fill them with Julie’s data.
- [ ] Write failing source-envelope tests for empty book, org fallback, unavailable source, null/zero amount and duplicate names; implement only the minimal envelope/allowlist handling and run them green.
- [ ] Record scope/default limitations, including representative source fields and historical/deployed uncertainty. Commit/push the evidence checkpoint without claiming live integration or modifying production source.

**Capture bounds:** start from the native top-row limits in current fetchers: Who-to-Call nine raw rows; held-away eight plus independent total; reviews six; plan-risk six plus eight spares; concentration five plus four exposure tickers; source inbox eight per native signal. Increase scope only for a specific tested journey; never label a limited result complete.

## Milestone 1 — exact household/product continuity (W05/W09; W12 foundation)

**Files:** `S/wealth-context.js`, `wealth-capture-data.js`, `workspace.js/.html`, `persona-workspaces.js`; `S/tests/wealth-context.test.cjs`, `wealth-context.browser.cjs`; `S/WEALTH_CONTEXT_MILESTONE.md`.

- [ ] Write failing tests for source precedence on duplicate Account+offer keys; wrong-owner/unknown-account exclusion; two equal display names; missing balances; and product/source provenance invalidation at both first save and Workbench reassignment.
- [ ] Implement exact-record selectors and a relationship Opportunities product picker. Keep customer evidence available independently of the active Growth household or movement filter.
- [ ] Carry Account+offer identity from Growth evidence to opportunity/task proposals and Workbench editing. Prefer source fields over name-based conditionals; remove Wealth-only display-name financial-value routing in touched paths.
- [ ] Preserve captured holdings separately from financial-account balances and ownership completeness. Known-owned products must not advertise acquisition proposals merely because a model row exists.
- [ ] Browser-test household A Growth → same customer/product/history in 360 → draft → Workbench → return; repeat with customer B and with missing source evidence. Verify other personas at desktop/mobile sizes.
- [ ] Run selector/browser checks, document what remains unavailable, commit and push this independently reviewable milestone.

**Acceptance:** no product is inferred from its title; exact Account+code survives every valid handoff. Score probability, EV, Amount and outside balances retain their units and meaning. Reassigning Account clears mismatched product/source keys and requires the authored text to be reviewed before eventual production execution.

## Milestone 2 — advisor agenda and review horizon (W01/W02)

**Files:** `S/wealth-priority-core.js`, `wealth-priorities.js/.css`, `wealth-planning-core.js`, `wealth-planning.js/.css`; bounded capture supplement; `atlas-home.js`, `atlas-day-hero.js`, `atlas-expansion.js`; focused tests and `WEALTH_PLANNING_MILESTONE.md`.

- [ ] Write failing tests that compare native Wealth Who-to-Call/blender inputs, source deduplication, due-date inheritance and reserved eligible liquidity behavior. Cover a real source date, a missing date and a future/stale observation without inventing history.
- [ ] Build a compact advisor agenda under the book hero: plan rescue, due review, relationship care and investment conversation. Use the native score/drivers and actual due context; avoid derived severity/rank “health drops.”
- [ ] Capture independent held-away/net-flow/plan aggregates and real series where returned. Give the pulse advisor-specific meaning; preserve pipeline near the top and avoid whole-page repetition of the same KPI.
- [ ] Write failing plan selectors for Active/Stale versus Draft, <70/<50 boundaries, due-30 window and twelve-month/stated staleness. Implement the exact native rules with source-period labels.
- [ ] Expand Review horizon into due/at-risk/stale modes with a compact date grid and selected-household plan assumptions/goal exposure. Keep modeled success and CRM goal funding separate.
- [ ] Exercise Why → source → 360 → review prep; then provider review → proposed meeting → Workbench. Verify no source review becomes a booked appointment and no missing aggregate is shown as zero.
- [ ] Run Wealth and existing Retail regression gates; log capture scope and any source-policy decisions, commit and push.

## Milestone 3 — capital, exposure and acquisition (W03–W06)

**Files:** `S/wealth-capital-core.js`, `wealth-capital.js/.css`, capture supplements; `persona-workspaces.js`, `atlas-expansion.js`, `workspace.js/.html`; pure/browser tests and `WEALTH_CAPITAL_MILESTONE.md`.

- [ ] Write failing held-away tests for latest active positive Brokerage/Robo-Advisor opportunity versus broader external assets, Crypto Exchange/Robo-Advisor leakage, missing data and source-scope fallback. Implement source-native selection and separate aggregate/detail display.
- [ ] Retain the capital-path composition, adding a searchable consolidation worklist and institution/product context. Show source cash flow direction without claiming money originated at this bank or is available to move.
- [ ] Write failing concentration tests for exact source/ticker/Account, native fund exclusion, ≥20% threshold and denominator. Build ticker exposure → holders → selected customer/plan context using actual market values; no invented market performance or trade recommendation.
- [ ] Capture native Wealth coverage and movers: seven product groups, twelve total rows including three Managed Account/Roth holders selected round-robin, six-month actual history, and independent open/Won-30 counters. Test owned suppression, exact existing-opportunity matching, score-versus-EV movement and null history.
- [ ] Implement a compact coverage/mover lens with meaningful visuals, a searchable household picker and bounded worklist selection instead of a horizontal customer strip. Group product columns on narrow screens so the seventh native product stays reachable without horizontal customer scrolling. Keep the source’s top-holder window/sample constraints visible.
- [ ] Add Acquisition lenses inside Wealth Growth: CRM Leads, graph introductions, business-owner relationships and emerging-wealth candidates. Use the current business-owner and Wealth-upgrade predicates; do not conflate a company, outside target, existing Account and existing Lead.
- [ ] Preserve full Lead source/status/email/name/company/AnnualRevenue fields. Proposal text must distinguish annual company revenue from AUM and modeled EV from Opportunity Amount. Explicitly document whether Wealth proposals prefill or require review of Amount, given the native grid currently submits modeled EV.
- [ ] Browser-test each source → exact customer/target inspector → correct proposal → Workbench/return, including no-contact, null/zero, duplicate-name and missing-source states. Run regression suites; commit and push.

**Source acceptance:** Wealth upgrades use native latest Claritas criteria (wealth propensity ≥80 or $1M–$5M/$5M+ band, excluding Wealth Management category), not a new account value threshold. Graph confidence is a source relationship measure, not consent/conversion. Outside targets do not enter the owned-household directory merely because an introduction is suggested.

## Milestone 4 — advisor Intelligence and trading context (W07/W08)

**Files:** `S/wealth-intelligence-core.js`, `wealth-intelligence.js/.css`, capture supplements; `persona-workspaces.js`, `atlas-day-hero.js`, `workspace.js/.html`; focused tests and `WEALTH_INTELLIGENCE_MILESTONE.md`.

- [ ] Capture native Wealth AML changes, Gong decline, qualifying inflows, marketing events and employer departures with independent source periods and limits. Keep the full change type where needed for native screening semantics.
- [ ] Write failing normalization tests for exact owner/Account/date/reference, duplicate names, New/Changed screening cases, null flags, liquidity windows, click events and source-empty/unavailable/stale/future cases. Implement source-specific records without a fabricated unified score.
- [ ] Build an advisor source inbox around planning/relationship/investment moments. Preserve Plan health and Concentration as meaningful lenses, linking them to the richer Review horizon/exposure views rather than duplicating giant cards.
- [ ] Capture native weekly gross Buy/Sell pulse and latest-week net sellers. Write failing tests for week boundaries, actual execution values and source identity; render the book aggregate separately from Julie’s or another customer’s selected execution ledger.
- [ ] Connect appropriate selected signals into Today and 360 with the same source key and private preparation. Keep generated AI wording distinct from recorded facts; no completed compliance case or funds-received claim.
- [ ] Browser-test source → same customer/date → task proposal → Workbench and return, plus a net-seller → actual executions journey. Ensure no trade-execution function is implied.
- [ ] Run responsive/keyboard and existing persona regressions, document missing feeds, commit and push.

## Milestone 5 — household folio and execution depth (W09–W11)

**Files:** `S/wealth-execution-core.js`, `wealth-execution.js/.css`, coherent customer capture; `workspace.js`, `workbench-collections.js`, `atlas-expansion.js`; tests and `WEALTH_EXECUTION_MILESTONE.md`.

- [ ] Capture one coherent Wealth customer’s actual financial accounts, transactions, trades, native plans/goals, interactions, notes, campaigns, Task/Event and case records where returned; retain a second customer for isolation tests. Source emptiness is acceptable; fabricated bookings/content are not.
- [ ] Write failing goal tests for type/priority/status/description/date/amounts and fixed FinancialPlan identity, including blank versus zero and a new goal that requires an exact plan. Implement complete goal review/create/edit while preserving Life event logging.
- [ ] Write failing activity tests for original record, WhoId, WhatId, source assignee, UTC round-trip, completion/update/delete support and exclusion of source Event operations from new-meeting planning.
- [ ] Add actual recorded commitments beside the proposal calendar. Expose only supported bridge update operations; show fixed/unsupported fields honestly. Current create handlers and update handlers support different field sets; use the shared Retail migration contract to avoid promising unsupported owner/type/location/ShowAs writes.
- [ ] Extend the review folio with dated source notes, account-keyed private preparation, selected evidence/goals and packet sections. Persist material by owner+persona+Account and preserve exact source IDs when it becomes a local action.
- [ ] Browser-test actual record → editable proposal → Workbench edit/review → original context, plus private-note reload and another customer with missing notes. Packet content must not borrow another household’s data or claim generated/sent/exported output.
- [ ] Review density/visuals and run all relevant selector/browser gates; update logs, commit and push.

## Milestone 6 — Wealth capability re-audit and migration handoff (W12–W14; W15 decision)

**Files:** `S/WEALTH_GAP_ANALYSIS.md`, `S/WORKSPACE_COVERAGE.md`, `S/WEALTH_MIGRATION_CONTRACT.md`, `S/WEALTH_PRODUCTION_ACCEPTANCE.md`, `docs/superpowers/plans/YYYY-MM-DD-wealth-atlas-production-migration.md`.

- [ ] Re-audit every W-row against implemented source-backed journeys. Distinguish design coverage, missing capture, source defect and production integration; do not replace this with a completion percentage.
- [ ] Specify Wealth route/lens/household/Workbench/Back restoration and signed-in/View As semantics. Preserve supported app routes and native SDK basename handling. Confirm all state/cache/preparation keys are owner-aware.
- [ ] Map each designed action to the actual CRM/AI clients, handler-supported fields, permission checks, success/error/refetch and duplicate/retry behavior. Preserve clear proposal-versus-executed state and do not replay local material automatically.
- [ ] Preserve live ACC switching/re-embed, explicit grounding handoff, AI model catalog and parameters, complete theme library/per-user theme/display presets, app launcher/search/user/notification tools and per-source loading/retry states in a separate production plan.
- [ ] Record source limitations: org fallback, derived health/drop/default values, grid existing-opportunity heuristic, grid View As assignment versus other handlers, source-period/grain differences and conversion/consent boundaries.
- [ ] Decide W15 only from actual source discovery. Beneficiary/member/estate-role capabilities remain unsupported discovery unless a verified read/write/permission contract exists; do not populate them to satisfy visual completeness.
- [ ] Define production acceptance journeys with ordinary banker, changed View As, unauthorized/stale record, empty book, source error, duplicate submission and cross-persona isolation. Carry forward preservation requirements in the [Retail migration plan](2026-11-13-retail-atlas-production-migration.md) where common, with explicit Wealth-specific scope.
- [ ] Commit/push the reviewed design handoff and leave production implementation/deployment unstarted until separately authorized.

## Validation commands and checkpoint rule

Run each new focused test from the repository root, for example:

```bash
node --test docs/design-studies/2026-11-12-directions/tests/wealth-context.test.cjs
node docs/design-studies/2026-11-12-directions/tests/wealth-context.browser.cjs
```

Browser scripts use the existing local preview on port 5187, a configured Playwright module/Chromium executable where needed, and write screenshots only to `output/playwright/wealth-*`. Verify 1512/1024/768/390px layouts, no horizontal page overflow, keyboard paths, no page errors and no unintended network writes. Test meaningful identity/source behaviors; avoid tests that only repeat rendered implementation strings.

Each milestone ends with its capture bounds, validation results, remaining limitations and next step in a short note. Commit only that milestone’s files; push the existing authorized branch without force, and verify local/remote HEAD. Planning does not establish that these milestones are already implemented.

## Initial status

- [x] Current-source and local-browser audit completed November 13: 28 surfaces, selected Growth proposal and Meetings checks; no org calls or production verification.
- [x] Separate Wealth mock gap-closure plan created.
- [ ] Milestone 0 implementation/capture checkpoint has not begun. All implementation checkboxes above remain open.
