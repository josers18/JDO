# Retail Atlas — migration contract

Reviewed November 13, 2026. This is the Milestone 6 specification for migrating the Retail Atlas design onto the current application. **No production implementation or deployment is performed by this document.**

The [preservation map](../2026-11-11-cockpits/FUNCTIONALITY_MAP.md) remains the floor. The [production implementation plan](../../superpowers/plans/2026-11-13-retail-atlas-production-migration.md) implements this contract; the [acceptance register](RETAIL_PRODUCTION_ACCEPTANCE.md) defines its release evidence. Wealth and Commercial need their own content and acceptance plans, not copied Retail screens.

## Evidence and completion boundary

The current ReactRetail/shared source and the standalone mock were inspected. Milestones 1–5 have captured-data/local-draft browser and selector checks, recorded in their milestone logs. Those checks do not establish authenticated GraphQL writes, permission behavior, live refresh, Agentforce record grounding, deployment, or full-book completeness. No fresh authenticated production-browser or org session was used for this document review.

The implementation source of truth is under `force-app/main/default/uiBundles/`; Apex is under `force-app/main/default/classes/`. Within this document, `Retail/` means `ReactRetail/src/`, and `Shared/` means `_shared/src/`. Paths below are source references, not claims that the deployed org has this exact revision.

## Identity and book ownership

Keep these identities separate in every request, state key and receipt:

| Identity | Source | Contract |
|---|---|---|
| Authenticated actor / stable org | Current `fetchCurrentUser()` / `/crm/whoami` returns user identity and orgName, **not orgId**. Target adds a backward-compatible orgId field to this existing bridge/client and a strict runtime-identity adapter. | Use actual actor and stable org ID. OrgName is display text, never a tenant key. Missing stable identity leaves scoped/private views unavailable; never substitute a fixture or viewed banker. |
| Effective read-book owner | `Shared/data/viewAs.ts` → `fetchEffectiveUser()`, `useViewAs()`, `ownerScopedQuery()` | View As changes read scope, not Salesforce authentication or permissions. Show both actor and previewed book. |
| Source record assignee | Recorded Task/Event `OwnerId` | Preserve on updates unless explicitly reassigned to an authorized user. Account ownership does not overwrite the activity's owner. |
| Write owner | Actual action/handler | Task/Event/Lead creates currently default to the running user. Cross-sell Opportunity creation explicitly supports the viewed banker owner; preserve that exception and validate assignment permission. Updates preserve source owner unless changed. |
| Customer / other records | Exact typed IDs | Account for relationship/Case/Opportunity; Contact or Lead for activity WhoId; separate WhatId; FinancialPlan for a goal; Contact for PersonLifeEvent; source-specific external references as metadata only. |

`viewAs.ts` scopes customer goals through the `CustomerGoal` alias to FinancialPlan.Account.OwnerId, life events through PrimaryPerson.Account.OwnerId, and CRM cases through Account.OwnerId. Other home roots use their own OwnerId. Retain these aliases/paths; FinancialGoal has no direct Account/Owner field to substitute casually. CRM GraphQL reads by exact Account run under the authenticated actor's sharing, including permitted Accounts outside the current book; those visits must not count an Account into the book or expose it through an unscoped directory query. This does **not** establish equivalent CRM row-sharing enforcement for external Data Cloud SQL. Current full360DataReal starts CRM and external queries in parallel. Target must validate customer access before revealing enrichment, and independently establish an enforceable server/native Data Cloud access policy; a client-side Account lookup or Apex with-sharing declaration alone is not that proof.

Current `queryDataCloudForBook()` can widen an empty/missing book to local-org scope. Target Atlas defaults to **strict book scope**, with successful-empty results preserved. Implement an explicit opt-in scope policy without silently changing other personas' existing fallback behavior. If an org-scope comparison is deliberately retained, label it and exclude it from “my book” totals and automatic priorities. ServiceNow must never widen. Missing or invalid identity must be rejected before `bookAccountFilter()` could produce a local-org predicate.

Do not hardcode Kim or any fixture owner into production. Read-book changes invalidate all in-flight view results, account lists, totals, selections and source caches keyed to the old book. Tenant/session identity changes clear the prior identity's in-memory state before rendering another customer's data. Existing keys (`cumulus.viewAs`, persona-only pins, `home-view-*`) are implementation evidence, not already-complete identity isolation.

## Routes and return context

Keep the platform-injected `SFDC_ENV.basePath` normalization in `Retail/app.tsx` and the App Domain launch path. The current routes in `Retail/routes.tsx` are `/`, `/growth`, `/health`, `/config`, and `/client/:id`. Existing direct links keep working.

The following are **target routes**, not current routes. Keep Current and Cockpit available; add Atlas as a reversible layout option. Do not silently replace a user's stored preference or retire a working route.

| Atlas destination | Target route / owned context | Existing entry to preserve |
|---|---|---|
| Today | `/`, layout preference = atlas | Existing home and both existing layouts |
| Relationships | `/relationships?q=&cohort=&pinned=&sort=` | Workspace selection/pins; full `/client/:id` remains reachable |
| Customer | `/client/:id?tab=&offer=&signal=&returnTo=` | Existing Customer360Page and all leaf tabs; missing query means original default |
| Pipeline | `/pipeline?stage=&view=&q=` | Existing pipeline-movement/opportunity explorer and totals |
| Life & goals | `/journey?mode=&month=&event=&goal=` | Life-event/goal explorers and grid calendar |
| Prospecting | `/prospecting?mode=leads\|introductions&source=&status=&q=&lead=&intro=` | Existing Lead modal/explorer and warm-introduction flow |
| Growth | `/growth?view=needs\|coverage\|movers\|planning&cohort=&product=&offer=&direction=&page=` | Existing Growth route, grid, source outcomes and mover queries |
| Intelligence | `/intelligence?view=inbox\|browsing&family=&q=&signal=&page=` | Current signal and browsing destinations |
| Relationship health | `/health?view=pulse\|property\|engagement\|service&cohort=&case=` | Current Health route, stress and deposit views |
| Workbench | `/work?view=desk\|tasks\|meetings\|cases\|drafts&date=&draft=&record=` | Current task/agenda/case explorers; source activity and planned proposals remain distinct |
| Configuration | `/config?section=` | Existing ConfigPage; never replace with mock text fields |

`offer` is an exact Account + product key, `intro` is a directed referrer/target/source-date key, `signal` is family + Account + source date/reference, and `record` includes object kind + record ID. Never use display names or visible row indices as persistent keys. Query values validate against an allowlist and source results. Unknown IDs produce an explicit unavailable/not-permitted state; a missing selected row never silently opens a different person.

Push history for intentional destination/record/cohort/view changes; replace for debounced search, page normalization and equivalent-state cleanup. Back/Forward restores selected prospect/cohort/product/source, page, visible selection, calendar day and return scroll/focus. A direct customer link does not require visiting Growth first. Store transient scroll/focus and dialog return state in router history; opening a modal must leave a usable return target. URL parsing must run on Back, not only mount. `returnTo` accepts same-app relative allowlisted routes only and carries no credentials or note body.

Sensitive note bodies, AI prompts, email recipients/bodies and draft content never go into URLs. Search/route context is tenant/user/persona/effective-book scoped in session fallback storage; query parameters win over fallback state. Existing mock state is mostly local JS/session storage and does **not** satisfy this target persistence contract. Source customers outside the book remain exact-record visits, not automatic directory additions.

## Data contracts and source lifecycle

Reuse `Retail/home/homeData.ts`, `homeDataReal.ts`, `personas/customer/customerData.ts`, `customerDataReal.ts`, `full360Data.ts` and `full360DataReal.ts`. Keep exported fetcher names/signatures compatible; add presentation adapters and optional source metadata rather than import study fixtures into live mode.

- Salesforce-origin records → `Shared/data/graphqlClient.ts` / `executeGraphQL`. Keep `first:`, read-field `@optional`, GraphQL error-array handling, plain-string Id versus wrapped other scalars, and account-name lookup chunks of 50.
- External/enrichment sources → `Shared/data/dataCloudClient.ts` / `queryDataCloud` → `/dc/query` → `DcBridgeRest`. Do source calculations in Data 360 where supported. Preserve warnings and scope metadata; a SQL LIMIT/request cap is not a total.
- `Shared/hooks/useAsyncData.ts` remains the lifecycle basis. Use generation/cancellation and full scope keys to reject late results from another owner/customer. Retain prior data during same-scope refetch, visibly mark stale data after failure, and clear old error state on a successful retry. Never retain the old book's visible data while presenting a new book identity.
- Add a backward-compatible `SourceResult<T>` envelope at Retail adapter boundaries: source ID, request scope, returned scope, status (`loading|ready|empty|unavailable|error`), period/captured time, warning, bounded/complete flag, data and optional last-good data. “Stale” describes dated/last-good evidence separately from a transport status. Zero is valid only after successful aggregate evidence, not a failed request converted to defaults.
- Current `Retail/home/HomeLayout.tsx` always starts legacy HomeDataProvider, derives rail counts from that data and gates the Outlet on aggregate loading/data. Strict adapters only inside Atlas pages are insufficient. Target uses a mode-aware provider/controller policy for both rail and page: unchanged legacy loading/fallback for retained layouts, strict scope and per-source partial loading for the actual Atlas renderer/routes. Avoid duplicate legacy fetches during Atlas operation and a monolithic legacy gate that hides otherwise usable Atlas pages.
- Current `homeDataReal.ts` catches many source failures as empty/zero results. Retain failure metadata before those defaults can erase the distinction. Do not claim that wrapping a silently-defaulted result later can recover the lost error.
- Per-source retries refresh only that source; transient errors have bounded retries, validation/permission/schema failures have explicit error states. No auto-retry for writes or email. A successful-empty book is not an error to fix with an org-wide query.
- Keep live CRM KPI values separate from Data 360 history and comparisons. Never produce an ingestion-lag delta by comparing CRM current value to mirrored history. Weekly net flow is credits minus debits, not account balance. Stage histories describe current-open cohorts, not observed stage transitions.
- Preserve current query definitions, source periods/cadence, strict external-vs-CRM case separation, owner/renter gates, native AML Changed/New rules and marketing-source distinctions. Missing coordinates do not become plotted zeros; record dates do not establish connector synchronization, consent or intent.

Bounded card feeds are not complete directories. Use live owner-scoped search with page cursors for large customer/Lead/opportunity lists; preserve independent aggregate counts. Source lookup failure must not remove the source row and imply that the customer or risk vanished—show an unresolved exact ID/limited action state until an authorized lookup succeeds.

## Action contract

Detailed payload and unsupported-field boundaries are in [Retail action mapping](RETAIL_ACTION_CONTRACT.md). Keep `crmWriteClient.ts` → `/services/apexrest/crm/write` → `CrmWriteRest`; use `useCrmAction`, existing modals/detail editors and explicit `onSaved` refetch callbacks. No direct generic REST write, @AuraEnabled workaround, or UI mutation masquerading as an executed action.

Proposed lifecycle: **working → reviewed locally → submitting → confirmed by server → refreshed**; failure stays editable with its context intact. “Ready” is organization of a draft, not confirmation, a scheduled appointment, an accepted transfer or a sent message. Execute only after a deliberate action button. Pending submissions disable duplicate clicks. A success receipt records returned record ID (email currently has none), actual actor, intended owner, operation and time. Audit technical details can live in review/receipt, not the main banking workflow.

No blind replay after an ambiguous transport timeout: the current bridge has no idempotency key. Reconcile the intended record or surface uncertain outcome before resubmission. Email needs a confirmed server send result, not merely HTTP 200 or a local draft. Successful server writes refetch affected live lists and independent counts; delayed Data Cloud mirroring is labeled separately. A successful write followed by failed refresh must remain “saved, refresh failed,” never offer to execute again as though no write happened.

Profile proposals, review packets, private notes/checklists, snoozes and pipeline planning-board movements have no generic bank-write permission merely because they exist in the mock. Keep them local or bind only to a specifically supported existing flow; do not turn them into arbitrary Account/Opportunity updates. Trades are read-only source executions; no order-placement functionality is introduced.

## Private drafts, notes and pins

The mock uses browser-session keys such as `cumulus.complete.drafts`; this is design evidence, not production storage/access control. Target default is per-tab memory with optional session storage when permitted by the app's existing storage policy. No new server object, org-wide draft library or cross-device promise is implied.

Use a versioned namespace containing **org ID + authenticated user ID + persona + effective read-book ID**. Each draft retains its author separately from its viewed book and target record. For proposals use typed object IDs, original operation, plan/contact/account links, source references/periods and a draft schema version. Do not serialize session tokens, SDK credentials or full source payloads that the proposal does not need.

Switching user/org clears the prior identity's memory and untrusted persisted keys; switching book hides prior-book drafts and invalidates hydrated selections rather than reassigning them. Preserve a user's draft only within its original authorized namespace. Before execution, revalidate access, supported fields, current target identity, assignee, eligibility and source changes. Migration must discard or explicitly import legacy unscoped mock drafts; never execute them automatically. Account reassignment invalidates related offer/introduction/signal metadata and requires the authored context to be reviewed for the new customer. A goal edit cannot reassign its recorded FinancialPlan; a life-event edit cannot reassign its Contact/type.

Use the same ownership discipline for private preparation and pins. Existing persona-only localStorage pin keys are not user/org isolation. Storage denied/corrupt/quota failures leave the page usable and show whether work is only in memory. Private notes do not become CRM interaction records on save. Tab/session restoration can restore browser storage; tab close alone is not a guaranteed secure deletion mechanism. Retention beyond the session needs an explicit product/storage decision before implementation.

## AI, configuration and application shell

- Keep actual `AgentforceChat.tsx` and the four configured agents. Switching tears down and re-embeds after one animation frame; changing only the mounted configuration is insufficient. The source's `contextLabel` affects visible chrome only—it does not silently give ACC the selected record. Do not promise automatic record grounding without an explicit supported handoff implementation and authenticated proof.
- Keep `aiGenerateClient.ts` tasks `queue_rationale`, `pipeline_summary`, `followups`, `freeform`, configured model lookup/cache and the composed/model/unavailable distinction. Preserve `promptClient.ts` / `runPromptFlow` and existing record-specific flows. Generated text is editable; generation never implies CRM execution.
- Keep `ConfigPage`, `configClient.ts`, `configCache.ts`, `CommandCenterConfigRest`, `ModelCatalogProbe`. Config is org-shared per center; active theme and display size are per authenticated user, never the viewed banker. Catalog source/fallback/refreshing states, 24-hour TTL and ten-minute probe debounce stay visible/functional. A catalog refresh can call models; avoid automatic repeat probes.
- Temperature/max-token settings currently round-trip but are not applied by the Apex model binding. Preserve this limitation in the UI; do not label changed values as effective generation behavior.
- Keep `brandThemeClient.ts`, the shared brand library, create/edit/delete/activate, logo/palette/role mapping, optional AI accent, fixed Light/Dark and existing 100/110/125/140% display presets. Atlas must consume tokens instead of hardcoded mock colors. OS-native font/CSP behavior stays intact.
- Retain GlobalSearch multi-object results, AppLauncher, NotificationBell, UserMenu and current navigation/section-to-explorer bridges. A relationship-only mock search is not a global-search replacement. Large customer lists need exact-ID-aware live lookup, not pages of eight mock cards.

## Known source/design issues that gate live migration

| ID | Evidence and implication | Required disposition |
|---|---|---|
| B01 | Task/Event create handlers write fewer fields than update handlers; Event update ignores duration and WhoId. | Constrain Atlas controls to actual supported payloads or extend client/Apex/tests explicitly. No silently ignored editable fields. |
| B02 | `CrmWriteRest.handleEmail` calls `Messaging.sendEmail` without inspecting its result and returns success with null ID. | Validate send results and test failures before live email acceptance. Email is never an automatic recommendation replay. |
| B03 | No idempotency key/reconciliation contract exists in `CrmWriteInput`/handlers. | Add a tested deduplication/reconciliation design or block automatic retry after uncertain outcomes. Pending-button protection alone is insufficient. |
| B04 | Many Retail source errors become zeros/empty arrays; empty-book helpers can widen to org scope. | Add source-result metadata and strict Atlas scope policy before presenting live “my book” results. |
| B05 | `useAsyncData.refetch()` preserves previous error; a successful retry does not explicitly clear it in the current hook. | Regression-test failed → successful retry and fix error lifecycle without hiding last-good data. |
| B06 | `HomePage.tsx` `healthFor`/`healthDropFor` synthesize display scores/drops from severity and rank; Who-to-Call stress counts previously exceeded the stated six-month window. | Do not present fabricated drops or unbounded counts as observed health history. Verify/fix the source window with fixture tests or show honestly labeled observations without the unsupported claim. |
| B07 | Cross-sell production helper seeds Opportunity.Amount from modeled estValue; the mock leaves amount for banker entry. | Target decision: preserve the native estimate as an editable, explicitly model-seeded proposed amount in Atlas review. It is not booked/annual revenue. Keep classic behavior available; test outcome totals only after confirmed writes. |
| B08 | View As/session ownership differs by action; cross-sell explicitly passes a viewed-owner assignment. | Preserve explicit exception, validate assignment permission and show actor/owner clearly. Do not reuse the read owner as an automatic write owner elsewhere. |
| B09 | `CrmWriteRest` is with-sharing; inspected handlers do not show explicit CRUD/FLS checks or user-mode DML. Record-type validation is present. | Validate org security behavior with restricted-user tests; add required enforcement before enabling new write entry points. This source review is not a permission audit. |
| B10 | Blank strings in update handlers generally mean “leave unchanged”; life-event DateTime uses session-local midnight. | Define clear-field semantics and cross-timezone date-only behavior with Apex/client tests. Do not silently clear fields or rewrite historical dates. |
| B11 | Study sessions/pins/routes do not isolate all user/org/book state; ACC record label is not grounding. | Implement target isolation/history and supported AI handoff before claiming parity. |
| B12 | Native one-off grid open-match uses Account + Opportunity name prefix; model history and current source dates can differ. | Preserve/document the heuristic while testing duplicate names/renamed opportunities; do not invent a unique backend offer relationship or current-run date. |
| B13 | Current whoami/CurrentUser has userId and orgName, but no stable orgId. | Add orgId to the existing read identity response/client compatibly and verify it before initializing tenant-keyed private state. Never key by orgName or the View As user. |
| B14 | External customer SQL starts in parallel with CRM lookup; CRM sharing does not by itself prove Data Cloud row access. | Test unauthorized exact-Account/enrichment requests under restricted actors; choose and enforce an appropriate native/server source-access policy. Client-side where filters are not an authorization boundary. No claim is made that the deployed org was permission-audited here. |
| B15 | Client receipt validation currently rejects success:false but can accept other HTTP-200 shapes; update/delete return an existing target ID. | Require confirmed response shape; insert ID must be the expected object, update/delete ID must equal the requested recordId, and email needs a confirmed send result. Unexpected response or timeout stays uncertain until reconciled. |

These are tracked implementation limits, not statements that every live deployment is broken. Resolve each relevant blocker with code evidence and tests or keep the affected function on the verified current surface. Production activation is a separate release decision.

## Capability re-audit

| Gap IDs | Mock/design status after Milestones 1–5 | Production status / remaining acceptance |
|---|---|---|
| R01–R02 | Captured first-move/queue/pulse/history paths exercised; new signal band supplements them. | Live reads, exact scope, per-source retry and source-window verification still required. |
| R03–R04 | Directed introductions, Lead source/AnnualRevenue and exact-ID local create/edit proposals exercised. | Authenticated Lead create/update, duplicates/contact permission and failure/refetch gates remain. |
| R05–R06 | Holder/mover/outcome contracts and exact customer/product continuity exercised on bounded captures. | Live grid/default estimate/owner/create/outcome refetch and complete search remain. |
| R07, R11–R12 | Coherent Mark customer sample, goal/plan fields, private notes, historical activity and supported local operation proposals exercised. Some sources successfully empty. | Full Retail customer fetch coverage, all supported actions, true agenda and permission gates remain. |
| R08–R10 | Signal inbox, hazard/engagement/service watch and needs cohorts implemented over captured sources. | Live source binding, strict scope and full/empty/unavailable/stale distinctions remain. |
| R13–R14 | Target identity, route/history/layout contracts specified here; mock shell remains fixed-owner and state is incomplete. | **Not implemented in production by this milestone.** |
| R15–R16 | Action mapping and asynchronous/source-state contract specified. | **Integration-only:** real writes, idempotency/reconciliation, success/refetch, permissions and retry evidence outstanding. |
| R17–R18 | AI/chat/config/theming preservation contract specified. | **Integration-only:** authenticated grounding/switching, actual settings/catalog/themes and display-scale tests outstanding. |

Completion of this specification closes the *planning* tasks in Milestone 6. It does not close the production acceptance gates or authorize a deployment.
