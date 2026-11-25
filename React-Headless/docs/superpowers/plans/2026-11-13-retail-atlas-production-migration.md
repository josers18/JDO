# Retail Atlas Production Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the reviewed Retail Atlas workflows over the existing live ReactRetail/shared contracts while preserving the working Current/Cockpit surfaces, then demonstrate production acceptance before separately authorized deployment.

**Architecture:** Introduce a Retail-owned Atlas presentation module and route/state/controller adapters. Keep shared SDK, GraphQL/Data Cloud clients, source query functions, action bridge, AI/chat, configuration and theme machinery; add backward-compatible scope/source metadata only where the current contracts lose necessary information. Incrementally gate Atlas so shared changes cannot silently replace Wealth/Commercial or the retained Retail layouts.

**Tech Stack:** Existing React 19, TypeScript, React Router, Vite, Tailwind/theme tokens, Vitest, Playwright, Salesforce SDK and existing Apex bridges. No new framework, server draft object or package upgrade is required by this plan.

**Spec:** [Retail migration contract](../../design-studies/2026-11-12-directions/RETAIL_MIGRATION_CONTRACT.md), [action mapping](../../design-studies/2026-11-12-directions/RETAIL_ACTION_CONTRACT.md), and [pending acceptance register](../../design-studies/2026-11-12-directions/RETAIL_PRODUCTION_ACCEPTANCE.md).

## Scope and execution status

This plan is **not started**. Completing the standalone [gap-closure plan](2026-11-12-retail-atlas-gap-closure.md) produced design/source captures and this migration specification, not production parity. The present authorization covers planning and mock work. Production implementation and target-org deployment are subsequent scope; deployment, merges and external sends are not performed by writing this plan.

Within this plan, `Retail/` = `force-app/main/default/uiBundles/ReactRetail/src/`, `Shared/` = `force-app/main/default/uiBundles/_shared/src/`, `Apex/` = `force-app/main/default/classes/`. These aliases refer to actual existing roots. Proposed files below do not exist yet unless explicitly described as existing.

## Global constraints

- Atlas only; Retail content stays persona-specific. Share plumbing/primitives, not a generic banker dashboard.
- Preserve `Retail/app.tsx` platform basename, App Domain launch and current routes. Current/Cockpit remain reachable and reversible until release acceptance explicitly settles retirement.
- Preserve origin-based data access, exact IDs/associations, book/org scope labels, independent aggregates, genuine source dates and FLS/error behavior. Do not ship study owner IDs/fixtures as live defaults.
- View As changes read-book scope, not session actor or permissions. Preserve the explicit cross-sell Opportunity owner exception and validate assignment.
- GraphQL `Id` is plain; other scalar fields are wrapped; read fields use `@optional`, roots have `first:`, and account-name lookups batch at 50.
- Goals link through FinancialPlan; life events through Contact; Task/Event WhoId/WhatId and actual assignee remain distinct. External references never become CRM IDs.
- Route/filter/Back state, drafts, notes and pins use org + actor + persona + effective-book boundaries. No sensitive authored text in URLs and no auto-execution of migrated mock drafts.
- Zero/empty/unavailable/stale/error are distinct. Atlas is strict-book by default; do not silently change legacy org-fallback behavior across all personas.
- Reuse existing CRM/AI/config/theme clients and known handler field limits. No silently ignored editable fields, fabricated sent/scheduled/saved receipts, or blind retry of an uncertain write.
- Build source-derived visuals over theme tokens. Preserve full brand tools, fixed Light/Dark and 100/110/125/140% display size, OS-native font/CSP behavior and accessibility.
- Restrict commits to the feature scope; preserve unrelated workspace changes. No force push or automatic merge. Use the existing deployment runbook only after authorization and acceptance.

## Review focus

- A late old-book response, duplicate name or corrupted route must not paint another customer's record or execute a stale proposal: T1/T2/T4.
- Sparse/FLS-denied/failed sources must stay unavailable; totals cannot be inferred from a top-N list or failure-default zero: T2/T3.
- View As, source assignee and cross-sell owner behavior must remain distinct; a shape-valid ID is not proof of access: T1/T4.
- A timeout after server success must not cause duplicate tasks, opportunities or email: T4/T7.
- Theme/scale/narrow-screen and internal horizontal scrollers must remain usable; page-overflow absence alone is insufficient: T3/T5/T6/T7.

## Interfaces and file boundaries

| Proposed unit | Ownership / interface |
|---|---|
| `Retail/atlas/RetailAtlasEntry.tsx`, `Retail/atlas/RetailAtlasLayout.tsx` | Opt-in Retail renderer within the existing shell/providers. Do not mount duplicate AppShell/ACC instances or pass an unsupported Atlas mode into old HomePage. Coordinate mode-aware page/rail provider policy rather than leaving Atlas behind the legacy aggregate gate. |
| `Retail/atlas/state/retailAtlasRoute.ts` | Pure parse/serialize/validate of Atlas query context and same-app returnTo; typed route context independent of fixture indices. |
| `Retail/atlas/state/RetailAtlasWorkspace.tsx` | Actor/org/read-owner transition coordinator, selection/history and scope invalidation. |
| `Retail/atlas/state/retailDraftStore.ts` | Versioned private per-tab proposal/notes store; author and read-book separate. Storage failures return explicit status. |
| `Retail/atlas/data/retailAtlasData.ts` | Adapter over existing home/customer/shared fetchers; no copied static studies as live data. |
| `Retail/atlas/data/retailSourceState.ts` | Typed source-result and scope/period/bounded metadata; preserve failure information before existing zero fallbacks erase it. |
| `Retail/atlas/actions/retailActionPlan.ts` | `prepareRetailAction(proposal, actorScope, resolvedRecords)` returns validated supported `CrmWriteInput` plus refresh targets, or explicit errors/unsupported state. No arbitrary draft spreading. |
| `Retail/atlas/actions/RetailActionReview.tsx`, `useRetailAction.ts` | Reuse current modals/useCrmAction semantics; submitting/confirmed/uncertain/refresh-failed receipts are distinct. |
| `Retail/atlas/pages/*` | Separate Today, Relationships, Pipeline, LifeGoals, Prospecting, Growth, Intelligence, Health and Workbench modules; existing ConfigPage/Customer360 tools are integrated, not replaced by previews. |

`ActorScope` contains orgId, actorUserId, persona=`retail`, effectiveOwnerId. `RetailProposal` is a discriminated union by action/object with exact source IDs, optional source date/reference, local schema version and owner/author context. `RefreshTarget` identifies CRM lists/aggregates, exact customers and grid outcomes. Source result types carry status/scope/period/warnings/limit metadata plus last-good data where appropriate. Define types before adding page bodies.

## T0 — baseline and source contract checkpoint

**Files:** current Retail/shared source tests; this plan; add `docs/retail-atlas-release-evidence.md` when implementation starts.

- [ ] Record current branch/HEAD, dependencies and dirty scope; retain source/runtime evidence levels from the acceptance register. Create an implementation branch/worktree from the reviewed revision without overwriting other work.
- [ ] Run baseline Retail tests/build/lint; record results without treating pre-existing failures as passing. If shared source will change, baseline Wealth/Commercial tests/builds too. Do not rely on historic test counts in AGENTS.md.
- [ ] Inventory existing route/shell/explorer/write entry points and preserve their mapping against the contract; record all B01–B15 blocker dispositions. Resolve target-env test-data/actor setup before any authenticated mutation test.
- [ ] Checkpoint the baseline and evidence index. No product behavior change in this task.

## T1 — opt-in shell, exact identity, routes and private workspace

**Files:** create `Retail/atlas/{RetailAtlasEntry,RetailAtlasLayout}.tsx`, `state/retailAtlasRoute.ts`, `state/RetailAtlasWorkspace.tsx`, `state/retailDraftStore.ts`; extend `Shared/data/crmWriteClient.ts` and `Apex/CrmWriteRest.cls`/`CrmWriteRestTest.cls` for read identity; modify existing `Retail/routes.tsx`, `Retail/home/{HomeLayout.tsx,homeDataContext.ts}`, `Shared/components/home/HomeView.tsx`, `Shared/components/home/WorkspaceSelection.tsx` only as needed. Add colocated `*.test.ts(x)`.

- [ ] Write failing parser/history/store tests: invalid tab/ID, duplicate names, malicious/foreign returnTo, direct product/customer link, Back/restored cohort and Workbench day, corrupt storage, actor/org/read-owner switch and blocked storage.
- [ ] Extend the existing whoami response/client with stable orgId compatibly (current response only has orgName/user identity); add a strict runtime-identity adapter before tenant-scoped hydration. Do not require ViewAsUser entries to masquerade as authenticated org identity. Test absent orgId and same orgName across different orgs.
- [ ] Implement validated target routes and dual actor/read-book context. Use `fetchCurrentUser`, `fetchEffectiveUser`, `useViewAs` and existing shell; identity failure shows unavailable, not a fixture user or org-wide data.
- [ ] Extend HomeView with an Atlas value and per-persona allowed choices, retaining defaults and existing Current/Cockpit rendering. Expose Atlas only for Retail. Reject stale/invalid persisted values. New route bodies must not mount another assistant or duplicate shell.
- [ ] Split/co-ordinate the HomeLayout data gate/controller by active renderer: retained Current/Cockpit keep their existing provider behavior; Atlas routes/pages and rail use strict scoped adapters and independent source loading. Do not leave the legacy HomeDataProvider running org-fallback queries underneath Atlas or gate all Atlas Outlets on legacy aggregate success. Derive the policy from the actual renderer/route, not only the stored home preference. Use separate components for mode-specific hook lifecycles.
- [ ] Implement exact-ID selection/pins and the versioned private namespace. Discard/quarantine legacy unscoped mock drafts; no automatic execution/import. Changing book invalidates in-flight results and hides other-book private state; changing actor/org clears old memory before paint.
- [ ] Run T1 tests and a shell browser smoke covering both retained layouts and safe Atlas route/Back transitions. Confirm no data appears under the wrong identity. Commit the independently working shell/state increment.

## T2 — source scope and lifecycle adapters

**Files:** create `Retail/atlas/data/{retailAtlasData,retailSourceState}.ts`; extend existing `Retail/home/{homeTypes,homeDataReal}.ts`, customer adapters and `Shared/data/dataCloudClient.ts` / source fetchers compatibly; fix `Shared/hooks/useAsyncData.ts` recovery lifecycle. Add colocated tests for every changed contract.

- [ ] Write failing tests for empty-book versus org fallback, identity unavailable, source rejection/permission failure, 200 GraphQL errors, real zero, partial/late source results, truncated samples and successful retry after an error. Assert page plus rail/header scope and verify Atlas independent pages remain usable when one source/legacy aggregate fails.
- [ ] Add explicit optional scope-policy plumbing (`strict book` versus retained legacy fallback) to shared query/fetch contracts without changing current callers' defaults. Atlas rejects a missing/invalid owner before any local-org predicate is used. ServiceNow remains strict.
- [ ] Preserve source failure metadata in `homeDataReal` while retaining backward-compatible value fields; a wrapper after `.catch(()=>0)` cannot recover the original error. Carry warnings, returned scope, period and boundedness into Atlas adapters.
- [ ] Fix/use generation guards for actor/book/customer changes and clear prior errors on successful retries. Keep same-scope last-good data visible with stale/error feedback; do not display old-book data under a new label.
- [ ] Preserve aggregate-vs-list and CRM-vs-Data-360 trend semantics. Reuse native query builders and fetchers; no source calculations moved into Apex or fake per-customer histories.
- [ ] Run adapter/hook tests, existing source-contract tests and affected persona regressions. Commit only after strict Atlas behavior and unchanged legacy fallback behavior are both demonstrated.

## T3 — Retail working pages and full customer continuity

**Files:** create `Retail/atlas/pages/{Today,Relationships,Pipeline,LifeGoals,Prospecting,Growth,Intelligence,Health,Workbench}.tsx` plus focused subcomponents; modify `Retail/personas/customer/{Customer360Page,Full360Tabs}.tsx` and adapters to expose route-controlled leaf context while preserving existing full views. Add page/selector tests and Playwright journeys under `ReactRetail/tests/atlas/`.

- [ ] Write failing exact-record integration tests for Growth→customer→same product, Lead/introduction/source→customer, source Event→Workbench, rich/sparse customer and missing source. Include duplicate names and a book exceeding 300 test customers.
- [ ] Port Retail compositions as React components over T2 adapters: Today hero/pulse/native priorities; pipeline near the top; searchable relationships; calendar + goals; primary Prospecting; native holder/mover/needs Growth; source inbox + visitors; property/engagement/service Health; distinct recorded/planned execution workbench.
- [ ] Preserve original full 360/tearsheet/explorers and all leaf data, not only the captured Mark example. Use live exact-ID fetches independent of page/cohort filters. Do not import hardcoded fixture account IDs into render logic.
- [ ] Preserve native first-move/blender/reserved-slot rules, holder/mover thresholds and book outcomes. Address B06 unsupported “observed” health/drop claims by source correction or honest omission/labeling in Atlas; do not invent replacement data.
- [ ] Implement real scoped search/cursors and independent totals; no page-after-page customer-card discovery or horizontal customer carousel. Plot only known coordinates; provide accessible list equivalents and source/unavailable states.
- [ ] Run page/browser journeys for all main pages and customer tabs at 1512/1024/768/390; check internal scrolling and keyboard behavior, not just document overflow. Commit in functional page groups with the shared exact-record journey passing at every checkpoint.

## T4 — validated actions, receipts and private proposal execution

**Files:** create `Retail/atlas/actions/{retailActionPlan,useRetailAction}.ts(x)`, `RetailActionReview.tsx`; reuse/extend existing `Shared/components/home/` modals, `useCrmAction.ts`, `Shared/data/{crmWriteClient,accountLookup,lookupSearch}.ts`, `Apex/CrmWriteRest.cls` and `CrmWriteRestTest.cls` only where a reviewed blocker requires it; read-authorization enforcement may also require reviewed `Apex/DcBridgeRest.cls`/`DcBridgeRestTest.cls` changes. Add mapper/component/Apex tests.

- [ ] Write failing table-driven payload tests for every CRM row in RETAIL_ACTION_CONTRACT.md and every unsupported profile/stage/Case-update/goal-delete action. Include zero/blank, wrong object type, source ID as CRM ID, mixed Who/What, stale plan/Contact/source provenance and reassigned target text.
- [ ] Implement proposal normalization to allowlisted payloads and actual lookup/metadata validation. Preserve FinancialPlan/Contact immutability and external case boundaries. Seed the proposed cross-sell amount from the native model estimate as an editable labeled proposal, preserving the documented View As owner exception.
- [ ] Resolve B01 create/update field mismatches: constrain unsupported controls or extend the same handlers/client/tests explicitly. Require an explicit reviewed meeting start/timezone rather than let an unlabeled now+1h default become an appointment claim. Define clear-field/date-only behavior; do not rewrite historical records silently.
- [ ] Resolve backend authorization with restricted-user/object/field/assignment tests and appropriate enforcement. Independently validate exact-Account external reads and enforce an appropriate Data Cloud access policy (native row permissions or a typed/allowlisted server contract), not merely a client-side scope predicate. Current full-360 external reads run in parallel with CRM lookup; authorization must not be inferred from an Apex with-sharing declaration. A regex-valid record ID and a client-side owner filter are not enough. Changes must preserve existing permitted workflows.
- [ ] Resolve B02/B03: inspect actual email send results, validate CRM receipts (insert expected object, update/delete exact requested target ID, email confirmed result), block duplicate clicks, and implement tested idempotency/reconciliation or an explicit uncertain-outcome flow. No blind automatic retry after timeout or email ambiguity.
- [ ] Preserve failure drafts and success-only callbacks. After confirmed write, refresh the exact lists/customers, independent aggregates and grid outcomes once. Show saved-but-refresh-failed distinctly from failed write; never execute again just to recover a read.
- [ ] Before authenticated checks of modified handlers (including earlier identity/source changes), obtain/verify isolated test-org deployment authorization, deploy the exact test build/metadata and record successful deploy JSON plus commit/version. This is a test-environment checkpoint, not T7 production release or activation. Never validate local changes against an older deployed class.
- [ ] Run mapper/component tests and authorized sandbox Apex/record tests, including negative permissions and duplicate/ambiguous outcomes. Commit only actions whose create/update/delete/send semantics are proved; keep other proposed controls local or on the verified existing surface.

## T5 — live AI, shell utilities, settings and token-based styling

**Files:** reuse `Shared/components/{AgentforceChat,GlobalSearch,AppLauncher,NotificationBell,UserMenu}.tsx`, `Shared/components/config/`, `Shared/data/{aiGenerateClient,promptClient,configClient,configCache,brandThemeClient}.ts`, `Shared/theme/`; adapt Retail Atlas layout and style tokens only where needed. Preserve existing Apex AI/config clients/classes and their tests.

- [ ] Write integration tests for composed/model/unavailable/transport-error generation results, editable output and no automatic CRM action. Use the four actual action keys and existing configured model selection.
- [ ] Reuse ACC's authenticated embed and switcher; test teardown + animation-frame + new embed and a single active client. Prove any supported explicit record handoff; contextLabel chrome alone does not establish grounding. Do not replace real chat with the mock transcript.
- [ ] Preserve real ConfigPage, model catalog fallback/probe/refresh/debounce and generation-parameter limitation. Test per-center org settings versus authenticated-user display/theme identity during View As.
- [ ] Retain full brand-library/logo/palette/role/AI-accent and fixed Light/Dark; consume tokens in all new compositions. Check 100/110/125/140% presets across all Atlas pages; do not globally apply the study's fixed colors/fonts.
- [ ] Preserve multi-object global search and all launcher/notification/user/rail/explorer entry points. Run keyboard and source-context tests plus authenticated configuration/chat checks in the permitted environment. Commit after the real utilities/settings remain reachable from all relevant layouts.

## T6 — complete acceptance and capability re-audit

**Files:** update `docs/design-studies/2026-11-12-directions/RETAIL_PRODUCTION_ACCEPTANCE.md`, `RETAIL_GAP_ANALYSIS_ROUND_2.md`, `WORKSPACE_COVERAGE.md`, `docs/retail-atlas-release-evidence.md`; tests under Retail and affected shared consumers.

- [ ] Execute RA01–RA20 on the exact migration commit. Record pass/fail/unavailable and source/environment evidence for every gate; no “pending but complete” percentage.
- [ ] Re-audit every preservation-map row and current full-360 leaf; state which layout/destination owns it. A deferred Atlas feature must keep its verified current entry reachable and be excluded from the activation claim explicitly.
- [ ] Run Retail unit/build/lint and the focused Atlas browser matrix. Re-run Wealth/Commercial tests/builds when shared code changed, using actual command outputs/counts. Check narrow screens, internal scrollers, custom themes and scale, source failure/retry, permissions and actor transitions.
- [ ] Review the entire implementation against the contract with a fresh reviewer; fix substantive findings with targeted regressions. Commit the evidence and any declared limitations before proposing activation.

## T7 — separately authorized release and rollback

**Files:** existing `docs/DEPLOYMENT_GUIDE.md`, new release-evidence record; exact deploy metadata scoped to affected bundles/classes/permissions.

- [ ] Confirm release authorization, target-org identity/alias and the accepted commit; reverify environment rather than rely on the historic alias alone. Ensure all relevant acceptance gates pass before enabling Atlas.
- [ ] Follow DEPLOYMENT_GUIDE: deploy exact affected bundle/app/permission/class paths, capture JSON and inspect status/component errors. Do not deploy `_shared` as a standalone bundle; do not source-scan delete/retrieve around its known limitation.
- [ ] Perform authenticated App Domain/basePath, retained-mode rollback and real utility/config smoke checks. Record RA21; a successful build or HTTP response alone is not deployed binding proof.
- [ ] Keep the retained renderer available until release acceptance is signed off. If activation fails, restore the prior layout/version and private state namespace compatibility; do not delete successful CRM records to “roll back” a UI release.
- [ ] Only then mark production migration complete and record remaining explicitly deferred scope. Do not merge/publish as an automatic side effect of completing earlier implementation tasks.

## Validation commands and evidence discipline

Commands run from the corresponding bundle directory, not project root:

```bash
npm run test -- run
npm run build
npm run lint
```

Use the bundle's actual test setup/Playwright command after inspecting package scripts/config; do not assume a nonexistent root test runner. Apex checks require the authorized target org and actual result logs. Local design regression scripts under `docs/design-studies/2026-11-12-directions/tests/` stay useful for fixture behavior but cannot substitute for React integration/Apex/authenticated acceptance.

An isolated test-org deployment/version checkpoint is distinct from final release activation. Test modified Apex/authenticated behavior only against the matching authorized test-org build, never assume local edits are already deployed.

No execution step in this plan is marked complete. The completed deliverable in the documentation milestone is this plan and its contracts, not these future tasks.
