# Wealth Atlas migration contract

November 13, 2026. This is a **future production contract**. The current implementation is a standalone captured-data mock. No ReactWealth bundle, Apex, CRM record, deployment or authenticated production interaction has been changed by this work.

Use the current-source functionality inventory and the checked-out Wealth/shared implementation as the preservation floor. [Action mapping](WEALTH_ACTION_CONTRACT.md), [acceptance](WEALTH_PRODUCTION_ACCEPTANCE.md) and the [future implementation plan](../../superpowers/plans/2026-11-13-wealth-atlas-production-migration.md) govern the next phase. Retail remains held; the Wealth advisor desk is not a Retail layout transplant.

## Runtime identity, routing and private state

Keep stable org ID, authenticated actor, effective read-book owner, source assignee and exact record targets separate. Current whoami exposes user identity/orgName but lacks a stable orgId; add a backward-compatible field before using it as a tenant key. A View As label is a read-scope preview, not Salesforce impersonation, permission or write assignment. Capture verification under the connected admin does not prove an ordinary advisor's permission matrix.

Continue using the native SDK/session and `SFDC_ENV.basePath` router basename. Keep existing routes, Current/Cockpit layouts and explorers available behind an opt-in Atlas mode until parity is accepted. Abort/drop prior-owner results, caches, selections and AI context on actor/org/View As changes. An empty advisor source must stay empty; the current native org fallback is prohibited in the Atlas adapter. Missing runtime identity shows unavailable rather than a fixture or widened org book.

The mock stores lens/product/selected-household/month/search/source-workbench state under a fixed verified-owner key and restores an owner-tagged URL view on Back/reload. The final runtime route must validate persona/owner/Account/product/source key, case/Lead/activity identity, workbench subview/day, query/filters and safe returnTo. Back must restore view selection, focus and useful scroll. Directory search must use real cursor-based/full-book retrieval; the captured73-household subset is not that implementation. Equal display names never merge.

Private runtime material needs stable org+actor+effective-owner+persona+Account namespacing and source/record keys where applicable. The mock's session-storage drafts are persona-scoped legacy material and must not be imported or replayed automatically. Mock folios are fixed-persona owner+Account-keyed; that is not a claim of production actor/org isolation.

## Data/source preservation

CRM data remains `executeGraphQL` through the platform SDK; parse GraphQL errors even on HTTP200, keep mandatory `first`/cursor handling, FLS-optional fields and scalar-vs-Id shape. External/warehouse and reconstructed calculations stay in Data360 through the Apex bridge. Do not move source calculations into Apex/new snapshot objects or reproduce them as cosmetic UI scores.

Adapt independent source envelopes with scope, effective owner, period, completion, row count/cap, metadata/units, loading/error/retry and last-good freshness. Successful0, successful-empty, unavailable, missing field and truncated samples are distinct. Source collections may fail independently; a failed aggregate cannot hide an otherwise usable customer page or launch hidden legacy org-fallback queries. Resolve Account names in chunks≤50 and never guess unresolved permission-denied names by display text.

Preserve native Wealth source semantics: nine raw Who-to-Call rows become eight with concentration reservation; native driver weights, source due inheritance, exact-identity dedupe and eligible liquidity reservation; Active/Stale plan population and<70/<50, due30 and12-month staleness; investable held-away Brokerage/Robo scope versus broader all-asset/digital slices; holding-based20% concentration with source fund exclusions; seven native product groups/up-to12 rows/three eligible holder slots, Managed/Roth round-robin, actual six-month history and native score/EV movers; separate grid open/Won30 outcomes; qualifying business-owner/Claritas/graph/marketing/AML/Gong/liquidity windows; confirmed USD Monday-week trade pulse and net sellers. Native net flow is weekly credits−debits, not a balance or execution total.

Julie/Anika are coherent examples, not hardcoded runtime routes. Fetch the selected customer's actual financials, transactions with cents, executions, CRM plans/goals, provider plan, interactions, notes, campaigns, cases and activities by ID. Preserve property ownership gating; renters get no property value/equity/HELOC assertion. Draft provider plan, absent CRM plan/goals and successful-empty notes/campaigns/cases remain separate states. Financial-account balances can contain loans and must not become AUM. No source contract currently supplies verified beneficiaries/family/estate-role coverage; leave that discovery unsupported until actual read/write/permission contracts exist.

## Execution, AI, shell and configuration

Implement [the action contract](WEALTH_ACTION_CONTRACT.md) with source-specific payloads, reviewed target/assignee, validated receipts, duplicate suppression, uncertain-outcome reconciliation and post-success refetch. Task/Event Who/What/owner remain separate. Source activity operations do not create appointments; provider dates and local proposals never imply bookings. Native cross-sell's explicit View As assignment is an exception, not a rule for ordinary creates. Atlas Opportunity Amount is reviewed independently from EV.

Preserve live ACC's actual configured agents and teardown→animation-frame→re-embed switching, one active client, graceful loading/error and an explicit supported record handoff. `contextLabel` is display chrome, not record grounding. Composed/model/unavailable AI states remain clear and editable. Preserve real AI configuration/model catalog/refresh/debounce; temperature/max-token parameters are currently stored/clamped but not applied by the present Apex binding.

Preserve full brand-theme library, logo/palette/AI accent, Light/Dark and per-authenticated-user active theme/display presets. Previewed banker is not the preference owner. Carry all [shared shell preservation](ATLAS_SHELL_PARITY.md): permitted View As, multi-object search, waffle launcher, task/notification bell, avatar, app admin, Salesforce Setup and Data Cloud Setup. Mock shell routing/menus do not establish authenticated setup authorization.

## Source issues and release boundary

Explicitly settle inherited org fallback; synthesized source health/drop/default fields; native name-based queue dedupe; null-prior AML descriptions versus explicit New/Changed; grid name-prefix existing-opportunity heuristic; EV-seeded Amount; current create/update Event field differences; current email send-result/idempotency gaps; source-grain/period differences; and Data360 exact-Account row access, which is not established by CRM GraphQL sharing alone.

Run the Wealth acceptance register under ordinary/restricted users and changed View As before release. Keep production implementation and deployment unstarted until separately authorized. Build/test/manifest/deployment/App-Domain validation and reversible rollout must use the existing repository runbook; `_shared` remains a source library rather than a deployable bundle.
