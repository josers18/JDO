# Wealth Atlas — future production migration plan

November 13, 2026. **Not started. This document authorizes no production implementation or deployment.** Retail remains held. This is the subsequent plan for the captured/local-proposal Wealth Atlas design, subject to separate authorization.

Contract: [Wealth migration](../../design-studies/2026-11-12-directions/WEALTH_MIGRATION_CONTRACT.md), [action fields](../../design-studies/2026-11-12-directions/WEALTH_ACTION_CONTRACT.md), [acceptance register](../../design-studies/2026-11-12-directions/WEALTH_PRODUCTION_ACCEPTANCE.md). The checked-out app/source functionality inventory is the behavioral floor; static fixtures must not become production data.

## P0 — identity, reversible layout and source lifecycle

- [ ] Capture current source/build/version and establish ordinary/restricted-user test scope; keep Current/Cockpit and source routes reversible while introducing Atlas behind an explicit layout mode.
- [ ] Extend runtime whoami with stable orgId; keep actor/effective owner/source assignee distinct. Partition caches/private state accordingly and abort/drop stale results on context changes.
- [ ] Introduce Wealth-specific typed source adapters over existing GraphQL and Data360 clients with strict book/no org fallback, independent source lifecycle, completion/cursor/cap metadata, units/period/freshness and safe retries.
- [ ] Preserve SDK basename/App-Domain routing and avoid monolithic legacy-home gating or hidden duplicate/org-fallback queries during Atlas operation.
- [ ] Unit/router-test empty/denied/changed owner, delayed results, null/zero, HTTP200 GraphQL errors, unavailable source and source recovery. Pass WA01–WA05 before richer views.

## P1 — advisor agenda and plan reviews

- [ ] Port the Wealth book brief/native queue, independent CRM/held-away/net-flow/plan aggregates and actual series; retain pipeline near the opening.
- [ ] Preserve native weights/reservations/dates and fix display-name dedupe with exact IDs. Capture explicit AML change type where native null-prior descriptions are ambiguous.
- [ ] Port due/risk/critical/stale review modes, compact calendar and selected assumptions/CRM goals. Exclude Draft provider plans from actionable health.
- [ ] Implement validated owner/Account/source-aware route, filters, Back/reload/focus/return context and real full-book directory search.
- [ ] Pass WA06–WA07 and route/source-state regressions with ordinary users.

## P2 — capital, positions and acquisition

- [ ] Port native investable held-away versus digital/all-asset lenses and actual position exposure/holder drill-in without inventing AUM or performance.
- [ ] Preserve seven native product groups, up-to12/three holder selection, Managed/Roth alternation, current ownership, exact product evidence/history and whole-book movers.
- [ ] Implement independent native grid outcomes and existing-opportunity matching tests, including renamed records and current name-prefix heuristic limits.
- [ ] Port Leads, directed intros, business-owner handoffs and emerging-wealth predicates. Keep outside targets, owned business/person, referrer and Lead separate; AnnualRevenue is not AUM.
- [ ] Pass WA08–WA13 with real source boundaries and empty/denied/large-book cases.

## P3 — customer folio and reviewed execution

- [ ] Fetch each selected household's actual CRM/customer sources by ID and gate property ownership. Remove name-conditioned/default financial/risk assertions from Atlas paths.
- [ ] Port source-aware folio sections/private questions and source Notes/Interactions separately; provide permitted runtime storage with migration/quarantine of legacy mock state.
- [ ] Implement complete Goal/Lead/Life-event create/update contracts and current-customer exact-plan/Contact scope, with date/blank/zero tests.
- [ ] Implement original Task/Event supported updates/complete/delete, correct Who/What/Owner and local↔UTC/DST conversion. Keep source operations out of new-appointment planning.
- [ ] Implement reviewed cross-sell Opportunity Amount/source/assignment separately from modeled EV. Do not invent Opportunity update/delete endpoints.
- [ ] Add verified receipts, duplicate suppression, uncertainty reconciliation and refetch; repair email send-result handling before a Sent state.
- [ ] Pass WA14–WA18 with explicitly authorized sandbox writes and restricted-user negative tests.

## P4 — runtime AI, configuration and shell preservation

- [ ] Reuse actual ACC configured agents and teardown/animation-frame/re-embed; implement supported explicit record handoff and verify grounding independently of chrome labels.
- [ ] Preserve composed/model/error/unavailable AI clients and editable source preparation, real model catalog/refresh/debounce and unapplied-parameter notices.
- [ ] Preserve org theme library versus per-authenticated-user active theme/display maps, Light/Dark, custom roles/logo/AI accent and all native display presets.
- [ ] Preserve permitted View As, full multi-object search, waffle, notification/task bell, avatar/admin/Setup/Data Cloud Setup and existing explorers.
- [ ] Pass WA19–WA21 across persona, theme, display, responsive and keyboard matrices. Beneficiary/member/estate discovery remains unsupported until an actual contract is approved.

## P5 — authenticated acceptance and reversible release

- [ ] Re-audit the complete Wealth floor against the exact implementation commit; record all unavailable sources and source defects, not completion percentages.
- [ ] Run relevant app/shared/Apex tests and production builds; obtain authenticated ordinary/restricted-user acceptance evidence for every WA gate.
- [ ] Review deployment/rollback against the existing runbook; use correct App-Domain/basePath and manifest-based handling for the non-deployed shared library.
- [ ] Obtain the separately required release authorization, deploy only then, capture deploy JSON and smoke the actual deployed version. Keep rollback/layout reversal concrete and tested.

All boxes intentionally remain unchecked. No fixture or mock session passes production acceptance.
