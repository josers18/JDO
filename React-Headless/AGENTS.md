# AGENTS.md — React-Headless

This file orients AI coding agents working in `React-Headless`. It is the tracked project-context primer; the local-only `CLAUDE.md` mirrors it with tool-specific notes. Read this first.

# Product context

`React-Headless` builds **React-on-Salesforce** apps with the Salesforce Multi-Framework **UI Bundle** feature. It ships a three-persona banking cockpit suite for Cumulus Financial Services:

- **ReactRetail** — retail banker morning home + customer 360 (runs on live data).
- **ReactWealth** — wealth-management advisory desk.
- **ReactCommercial** — commercial-banking relationship command center; customer 360 includes a **Company Intel** tab (ZoomInfo firmographics, BoardEx governance, MSCI ESG, SEC filings) and the home dashboard carries a book-level **Delinquency Watch** panel.

Plus a `ReactHeadless` review harness (all three personas as routes for local preview) and a `_shared` source library. Each cockpit is a full-page app: navigation, KPI strips, tables, charts, AI/ML tiles, and a customer-360 drill-in, styled with the **Aurora Glass** design system (light mode, frosted glass, one blue→violet accent, per-persona accent colors).

# Tech stack

- React 19 + Vite 7 + TypeScript, Tailwind v4 (`@tailwindcss/vite`), shadcn/ui ("new-york", lucide icons).
- `@salesforce/platform-sdk` ^10.6 + `@salesforce/ui-bundle` ^10.6 — `createDataSDK()` gives `sdk.graphql` for record data and `sdk.fetch` for Apex REST.
- `@salesforce/agentforce-conversation-client` — real Agentforce chat embedded via Lightning Out 2.0 (`embedAgentforceClient`); reuses the app's authenticated session.
- React Router (`createBrowserRouter`).
- Vitest for unit tests; Playwright for e2e.
- Apex REST bridges React → the platform (all `@RestResource`): `DcBridgeRest` (`/dc/query`, Data Cloud SQL), `DcPromptRest` (`/dc/prompt`, prompt flows), `AiGenerateRest` (`/ai/generate`, Einstein text generation), `CrmWriteRest` (`/crm/*`, record writes), `CommandCenterConfigRest` (`/config/*`, per-center AI config + model catalog). Plus `ModelCatalogProbe` — a `Queueable` that discovers live foundation models by probing them (no listing API exists) and caches survivors.
- SFDX project, `sourceApiVersion` 67.0. Target org `jdo-1lrnov` (== `storm-16a17dc388fbe6`).

# Project structure

```
force-app/main/default/
├── uiBundles/
│   ├── _shared/          # NON-DEPLOYED source library, imported via the @shared alias.
│   │   └── src/{theme,data,hooks,components,charts}/   # tokens+ThemeProvider, graphqlClient,
│   │                                                   #   dataCloudClient, useAsyncData, primitives,
│   │                                                   #   components/config/ + data/{configClient,configCache},
│   │                                                   #   components/home/{WorkspacePanel,DataExplorerModal,…}
│   │                                                   #   + data/priorityQueue (queue blender)
│   ├── ReactRetail/      # src/{home,client,data}/ — live-data cockpit
│   ├── ReactWealth/      # live-data cockpit (real default, mock fallback)
│   ├── ReactCommercial/  # live-data cockpit + Company Intel tab + Delinquency Watch
│   └── ReactHeadless/    # review harness (personas as routes)
├── applications/         # <App>.app-meta.xml — CustomApplication, binds <uiBundle>c__<Name>
├── objects/              # CommandCenterConfig__c — the config singleton (per-center JSON + model cache)
├── pages/                # <App>Launcher.page — VF "launch card", App Launcher bridge to the App Domain
├── tabs/                 # <App>App.tab — CustomTab (waffle-menu tile) targeting the launcher page
├── permissionsets/       # <App>_Access + CommandCenterConfigAdmin (config-field FLS)
└── classes/              # DcBridgeRest, DcPromptRest, AiGenerateRest, CrmWriteRest, CommandCenterConfigRest,
                          #   ModelCatalogProbe (+ tests) — the only Apex
docs/                     # DEPLOYMENT_GUIDE.md, DEPENDENCY_MANAGEMENT.md, customer-360-inventory-and-gaps.md, plans/, specs/
```

`_shared` is not a deployable UIBundle — it has a `.uibundle-meta.xml` but no `dist/`, so any source-scanning `sf` command (`delete source`, `retrieve start`) errors on it. Work around with manifest-based deploys.

# Commands

All React-app commands run **from the bundle directory** (substitute the app name):

```bash
cd force-app/main/default/uiBundles/ReactRetail
npm install
npm run dev            # Vite dev server (~:5173); dev:design for design mode
npm run build          # tsc -b && vite build -> dist/
npm run test -- run    # single Vitest pass (CI mode)
npm run lint
```

Deploy the bundle + app + permset together, from the **project root**:

```bash
sf project deploy start \
  --source-dir force-app/main/default/uiBundles/ReactRetail \
  --source-dir force-app/main/default/applications/ReactRetail.app-meta.xml \
  --source-dir force-app/main/default/permissionsets/ReactRetail_Access.permissionset-meta.xml \
  -o jdo-1lrnov --json
```

Always capture `--json` and read `status` / `numberComponentErrors`. See `docs/DEPLOYMENT_GUIDE.md` for the full runbook and the beta-migration procedure.

# Architecture

- **Entry & routing** — `src/app.tsx` mounts `createBrowserRouter`; the basename comes from `globalThis.SFDC_ENV.basePath` (platform-injected), trailing slash stripped. Do not hardcode it. Routes live in `src/routes.tsx` as a `RouteObject[]` under `AppLayout`; nav auto-builds from routes carrying `handle: { showInNavigation, label }`.
- **Data-access rule** — origin decides the client: **SalesforceDotCom → GraphQL** (`executeGraphQL`), **Snowflake/Databricks → Apex bridge** (`queryDataCloud` → `DcBridgeRest` → `ConnectApi.CdpQuery.queryAnsiSqlV2`). Both are exposed from `@shared`.
- **Mock/real toggle** — `src/data/dataSource.ts` per app: `resolve(domain, mockFn, realFn)` with `modeFor` / `setDomainMode`. All three apps default to real for `core` / `dataCloud` / `agentforce`, with per-domain mock fallback. This keeps mock↔real a body-only swap behind identical fetcher signatures.
- **In-org surface** — a UIBundle becomes a Lightning app via a `CustomApplication` (`<uiType>Lightning</uiType>`, `<uiBundle>c__<Name></uiBundle>`) with `<target>CustomApplication</target>` on the bundle meta. It serves at the **Salesforce App Domain** (`…--c.<host>.my.salesforce.app/app/c__<Name>`), NOT `/lightning/app/<name>`.
- **In-app chrome & AI** — each cockpit renders native-style Salesforce chrome inside the React shell (`_shared` `AppLauncher` 33-icon waffle, `GlobalSearch` multi-object, `UserMenu`, `NotificationBell`), plus real Agentforce chat via the Conversation Client (`AgentforceChat`, floating pink FAB). `AgentforceChat` also carries a 4-agent switcher — see Common mistakes for the re-embed rule.
- **Banker AI actions & CRM writes** — the home surface turns AI briefs into one-click actions through `_shared/src/components/home/` modals (Task, Schedule, Email, Case, Prep, Why, QuickView, DraftFollowups, AiResult). Two client/bridge pairs back them: `aiGenerateClient` → `AiGenerateRest` (`/ai/generate`, Einstein text — composed-first with a graceful fallback so a model miss never blanks the UI) and `crmWriteClient` → `CrmWriteRest` (`/crm/*`, record inserts). Write modals take an `onSaved` hook (fires only after a successful `crmWrite`, before close) wired to `useAsyncData`'s `refetch()`, which bumps the fetch generation WITHOUT flipping `loading` so a newly-created task/meeting appears in place without a spinner. `accountLookup` auto-fills the email recipient straight from the client's Account record (`PersonEmail`, falling back to the primary Contact).
- **Command-center cockpit view** — the banker home has two layouts behind a top-bar `HomeViewToggle` (`HomeViewProvider`, persisted per persona): the original stacked **Current list** and a **Cockpit** command center (compact AI brief → four-KPI sparkline **vitals** → **Priority Queue + Recommended Actions** side by side → tabbed customer-360 **`WorkspacePanel`** → full-width **supporting band**). Selection is master-detail: clicking a client/task/opp/meeting anywhere drives the sticky `WorkspacePanel` (`WorkspaceSelection` context; a localStorage `WorkspaceSelectionProvider` holds pinned accounts). Supporting-band cells open a `DataExplorerModal` (search/filter/table); a row there opens a stacked read-only `DetailModal`. The Priority Queue renders through `PriorityQueueCard`, fed by the shared **`buildPriorityQueue`** blender (`_shared/src/data/priorityQueue.ts`) — it merges the persona's signature risk feed with opportunity- and overdue-task-derived items, each carrying a signal-native `dueDate` so severities interleave when sorted by due date rather than clustering by severity.
- **In-app Configuration & self-updating model catalog** — each cockpit carries a `/config` route (`ConfigPage`, `handle.label` "Configuration") where an admin picks, per generative AI action, which Agentforce Models API model runs it, plus generation params (temperature/max-tokens; *stored & clamped but not yet applied* — the Apex Models API binding exposes only a per-request model name). Settings are **org-level and shared**: one `CommandCenterConfig__c` singleton (DeveloperName `GLOBAL`), one JSON blob per center, read/written through `CommandCenterConfigRest` (`/config/*`) by `configClient`, and primed into `configCache` so the home page's next action uses them without a reload. The **model catalog is genuinely self-updating**: the org exposes no API that *lists* foundation models, so `ModelCatalogProbe` (Queueable) discovers live ones by *calling* a forward-looking candidate superset (a live model returns `Code200`, a retired one throws) and caches survivors onto `Model_Catalog_Cache__c`. `GET /config/models` serves that cache instantly and enqueues a background refresh when stale (24h TTL) or force-requested (`?refresh=1`, the "Refresh models" button), debounced 10 min so concurrent loads don't stack billable probe jobs — falling back to a curated list until the first probe lands.

# Conventions

## React / TypeScript

- Path aliases: `@`, `@api`, `@components`, `@utils`, `@styles`, `@assets` (in `vite.config.ts` + tsconfig), plus `@shared` → the `_shared` library.
- Keep persona content bespoke; share only plumbing and primitives via `@shared`.

## GraphQL (via `sdk.graphql`)

- HTTP 200 ≠ success — always parse the `errors` array (`executeGraphQL` does this and throws).
- `@optional` on every read field (FLS); `first:` mandatory on every query.
- **`Id` returns as a plain string on nodes; every other scalar is wrapped in `{ value }`.** Read `node.Id` directly; read others via `node.Field.value`.

## CSS

- Aurora Glass tokens live in `_shared/src/theme/tokens.css`; light mode IS Aurora. `ThemeProvider` only injects persona-accent overrides. Typography is **Fraunces** (display/headings) + **Hanken Grotesk** (body), imported per-bundle in each app's `src/styles/global.css`. One ambient `--wp-aurora` gradient — don't add competing gradients.

## Tests

- Vitest under each bundle's `src/`; run `npm run test -- run` for a single CI pass. Apex tests: `DcBridgeRestTest`, `DcPromptRestTest`, `AiGenerateRestTest`, `CrmWriteRestTest`, `CommandCenterConfigRestTest`.

# Common mistakes

- **Deploying to `/lightning/app/<name>` and concluding it's broken.** That path always redirects to the org default; the real URL is the App Domain (`…my.salesforce.app/app/c__<Name>`).
- **Expecting the App Launcher (waffle) tile to open the app.** The raw `CustomApplication` tile lands on `one:noNavItems` — the App Domain can't be iframed (`frame-ancestors 'self'`) and scripted top-nav out of the LEX tab is blocked. Bridge via a VF launch-card `CustomTab` with a `target="_top"` button (see `pages/<App>Launcher.page`). A `.page` source must not contain `<!DOCTYPE html>`.
- **Dependabot alerts are transitive** — they won't clear from a direct bump or range-widen. Fix via `overrides` in the bundle `package.json` + regen lockfile; use a *scoped* override when only a nested copy is vulnerable (see `docs/DEPENDENCY_MANAGEMENT.md`).
- **Plain-redeploying a beta bundle** and expecting the binding to take — the stale AppMenuItem survives. Delete + redeploy.
- **Reading `CustomApplication.Metadata` to check the `uiBundle` binding** — Tooling doesn't surface that field; it looks dropped even when correct. Verify in the browser.
- **`sf project delete source` on this repo** — errors on the non-deployable `_shared` bundle. Use a destructiveChanges manifest from a throwaway DX project.
- **Treating `Id` as `{ value }`-wrapped** — it isn't; you'll get empty strings.
- **Assuming `PERSONAL_PRODUCT_RECOMMENDATION__dlm` exists** — only the `_INPU` feature-input DMO does; next-best-product must be derived. `Bank_Churner__dlm` keys on email/Id, not Account — use `CSAT_Snowflake__dlm` (account-joinable) for per-client signals.
- **Switching Agentforce agents by mutating the mounted frame's `configuration`** — it only relabels the chrome. ACC's inner LWC reads `configuration` once at mount, so the running conversation stays on the original agent. Switch by **re-embedding** (`embedAgentforceClient` teardown + re-mount keyed on the agent id) with one `requestAnimationFrame` between teardown and re-embed so Lightning Out's global registry settles. The "already registered to another App" console error during re-embed is **non-fatal** — the fresh session loads regardless; don't "fix" it by abandoning re-embed.

# Related docs

- `README.md` — quick start, deployed-app URLs, layout.
- `docs/DEPLOYMENT_GUIDE.md` — full deploy runbook + beta migration + App Launcher tile bridge.
- `docs/DEPENDENCY_MANAGEMENT.md` — npm advisory handling via `overrides` (transitive-dep fix pattern + scoped-override rule).
- `docs/customer-360-inventory-and-gaps.md` — the live-page parity floor + Data Cloud gap analysis + settled content contract.
- `docs/superpowers/plans/` — the foundation + persona implementation plans.
- `docs/superpowers/specs/` — design specs (Aurora redesign, Company Intel, home AI actions, schedule modal, command-center configuration).
- Sibling JDO projects (`DC_*_LWC`, `Cumulus_Assistant`, etc.) are reference context only.
