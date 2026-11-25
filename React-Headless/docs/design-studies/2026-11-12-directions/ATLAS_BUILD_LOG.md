# Atlas Wealth and Commercial build log

November 13, 2026. Branch: `design/retail-atlas-gap-closure`.

## Scope and responsibilities

Retail implementation is on hold. Two persona workers own their respective Wealth/Commercial capture, selector, presentation, test and contract files. The coordinator owns shared dispatch, asset registration, cross-persona validation and commits/pushes. All authored actions remain local proposals; production bundles, Apex and release are outside this build.

## Shared foundation checkpoint

- Added optional Atlas-only Wealth/Commercial facade dispatch for pages, relationship panels, exact-account evidence, source-record lookup, forms and draft preparation/editing.
- Shared generic forms can be delegated through `openBaseForm` without recursive persona dispatch. Local save and edit both invoke the active persona’s provenance sanitizer.
- Source Event update/delete proposals are excluded from the new personas’ local meeting planner. A focused browser regression observed the `sourceRecordId` variant fail first and pass after correction; genuine new-meeting proposals remain visible.
- Existing Retail behavior passes all 52 selector tests and five browser suites: context, priorities, business, customer and watch. Preview server responds HTTP 200 on port 5187.
- New persona factories are optional until their modules are registered. This checkpoint alone adds no Wealth/Commercial UI.
- Focused shared-hook browser checks pass: independent page/relationship dispatch, exact-account merging, authoritative empty history, source-record lookup, delegated forms, hidden provenance and both save/edit preparation. Retail and earlier styles stay isolated.

## Decisions

- Ruling: use two independent persona implementers as explicitly requested, with shared integration and a final fresh review coordinated centrally. Each implementer works through its own plan. This overrides the inline-only executor default; the cost is additional coordination, covered by scoped file ownership and integration tests.
- Ruling: retain the authorized existing design branch rather than create another parallel branch. This preserves the milestone history requested by the user; production migration stays separate.

## Source checkpoints

- `1f0f7572a`: Wealth strict source capture and pure identity foundation; source query/scope documentation follows with the feature build.
- `c7582f7b4`: Commercial verified book/provider/offer/history capture plus SQL/SOQL evidence. Independent aggregates remain separate from bounded detail samples.
- Combined selector gate at this checkpoint: 68 passing tests (Retail 52, Wealth 8, Commercial 8). Shared integration browser gate passes including delegated editing and source Event separation. Persona UI acceptance is still in progress.

## Pending

Wealth/Commercial feature refinement, browser journeys, final review, migration-readiness contracts and final commit/push verification. Production acceptance remains pending.

## Shared Salesforce shell expansion

The user added explicit preservation of View As, all current search capabilities, the waffle, bell/tasks and avatar/admin shortcuts during the parallel build. Added isolated `atlas-shell-*` modules and source evidence; no production components or backend plumbing were edited.

- Five source-contract tests observed RED (missing core) then GREEN: token-wise Name search, exact object/record identity, native alert rules (including overdue), unsupported-book isolation and Unicode-safe Salesforce/setup URLs.
- Browser gate passes 36 launcher links/filter, four search object groups, exact Julie selection, full Salesforce search route and keyboard shortcut, 12 bounded native-criteria alerts, user/admin URLs, actual-user display persistence, uncaptured View As/My book gates and three personas at four widths. No browser errors or write requests.
- A rapid previous-dialog close could cancel the next search debounce. The failing browser journey reproduced it; ignoring stale close events after a new dialog opens makes the same journey pass. Independent QA reproduced the same issue and verified the correction.
- Actor identity capture is unavailable; the local avatar honestly uses My Account. Captured banker names are never substituted for a logged-in identity. Source alert visibility belongs to the authenticated connector capture, not a claimed live browser session.
- Native Salesforce links open a new tab in the local preview. Production `_top` link behavior, App Domain derivation, current SDK/GraphQL/Apex clients, authorization, session actor and persisted scope remain the migration contract.

## Admin and scope regression refinements

- Configuration originally retained a separate reading-size control. A browser assertion failed with zero shared preset options, then passed with all four presets and a synchronized `large` selection after avatar-change/reload. Both surfaces now use one preview store; production persistence remains unchanged.
- Reopening search while an earlier debounce was pending could place old results under a new empty input. The browser check reproduced four stale groups, then passed after canceling old panel timers and checking input identity.
- An uncaptured View As could still open the generic assistant under the original banker label, and a generic question draft could infer the default customer. Observed failing browser checks now pass: unavailable-book assistance carries no customer evidence; a draft links an Account only when an exact customer is actually selected.
- Added the live App Domain Configuration shortcut alongside the local preview configuration so the existing complete admin surface remains reachable. It uses the captured org origin and current app route; no backend/configuration write is performed by this mock.

## Independent review and final correction pass

The fresh reviewer found no critical defects and four important defects. Each was covered by an observed failing regression before correction:

| Finding | Corrected behavior / proof |
|---|---|
| Wealth plan attention used the review source for risk-only plans | Graham evidence and proposed meeting retain `planSignals_atRiskRowsSql`; two browser paths RED→GREEN. |
| Account-less original Event acquired Julie during local editing | Empty/unavailable relationships stay selectable as empty/saved links; unchanged editing retains null What and original Who. Explicit reassignment updates What, retains original activity identity and requires text review. Browser RED→GREEN. |
| Commercial introduction reassignment retained old targetAccountId | Core clears both graph endpoints and source associations, retains authored text with a review flag/warning. Pure RED→GREEN and actual warm-referral browser path pass. |
| Available Wealth screening disappeared in360 | Exact-Account native signal panels remain visible across overview/screening/engagement/finances. Hayes retains Low→High, sanctions flag, date and source inspector. Browser RED→GREEN. |

Ruling: re-grade the Commercial stage-filter mismatch as important because its follow-up actions targeted an Opportunity outside the chosen stage. Detail/actions now use a matching deal. The cost is resetting an out-of-filter selection; the targeted failing browser case now passes.

Additional reproduced source-floor regressions cover current-household goal-plan scope, source life-event editing, Task delete/shared source entry points, existing-grid stale-action protection and Commercial Profile/custom-tab keyboard transitions. Exact Contact creation, explicit activity reassignment, introduction reassignment and broad outside-asset scope are also covered. Initial ten browser failures are now green; the final focused suite has fourteen passing journeys, no errors and no writes. Four pure final-review source/identity guards pass.

The latent `acct` lookup and existing-grid guard were corrected with exact-key tests without inventing populated mover/grid captures. No live auth/write/deploy acceptance is inferred. Wealth final documentation is complete; the earlier pending child ledger was superseded by the closeout. Production plans remain entirely unstarted.

The final W03 supplement uses two read-only queries based on the existing native customer helper. Source-returned null/zero, query completion/row counts and actual distinct-institution counts are retained in the canonical83-envelope capture and SQL export. The broader customer total is visibly separate from investment-only opportunity filters.

## Final local acceptance

- 100/100 selector/source tests pass via `node --test docs/design-studies/2026-11-12-directions/tests/*.test.cjs`.
- 12 browser suites pass: Retail context/priorities/business/customer/watch; Wealth journeys; Commercial journeys/edge; shared persona integration, admin shell, cross-persona and final-review regressions.
- Cross-persona gate:108 main/customer layouts at1512/1024/768/390, persona switching and draft isolation/reload; no horizontal customer content, page errors or runtime write requests.
- Commercial extended gate:64 customer states,8 treasury modes,4 retained Profile/Tools states and9 workflow assertions. Wealth also checks1280px and exact-source goal/Lead/Event/folio journeys.
- Final review gate:14 source/context/operation regressions, including both customers' financial views at768/390. Initial ten defects were observed failing before correction; later integration cases confirm explicit linking, actual graph cleanup, exact Contact creation and broad asset distinctions.
- All five Retail browser gates remain green after shared shell/tab changes. Retail-specific page modules and production `force-app`/metadata remain unchanged.
- Asset identity advanced to `atlas-complete-16` so existing preview tabs can reload the new scripts/styles. Preview remains on port5187.

All production authentication, permission, actual write/send/refetch, ACC, model/catalog/config persistence and release gates remain pending in the separate production plans. They are not inferred from static capture/browser checks. Final source snapshots are bounded and dated. The branch checkpoint/push below records the delivered mock build.

## Delivered checkpoint

Feature build `4057c10e208303617d660b62a3783fa6388d3de3` was committed and pushed to `design/retail-atlas-gap-closure`. Local HEAD and upstream matched after push; task-owned study/plan paths were clean. The preview returned HTTP200 on port5187 after the push. This final documentation checkpoint records that verification; unrelated working-tree files were not staged. No production source, release or bank write was included.
