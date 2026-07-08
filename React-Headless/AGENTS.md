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
- `@salesforce/sdk-data` ^10.6 — `sdk.graphql` for record data, `sdk.fetch` for Apex REST.
- React Router (`createBrowserRouter`).
- Vitest for unit tests; Playwright for e2e.
- Apex: `DcBridgeRest` (`@RestResource`) bridges React → Data Cloud.
- SFDX project, `sourceApiVersion` 67.0. Target org `jdo-1lrnov` (== `storm-16a17dc388fbe6`).

# Project structure

```
force-app/main/default/
├── uiBundles/
│   ├── _shared/          # NON-DEPLOYED source library, imported via the @shared alias.
│   │   └── src/{theme,data,hooks,components,charts}/   # tokens+ThemeProvider, graphqlClient,
│   │                                                   #   dataCloudClient, useAsyncData, primitives
│   ├── ReactRetail/      # src/{home,client,data}/ — live-data cockpit
│   ├── ReactWealth/      # live-data cockpit (real default, mock fallback)
│   ├── ReactCommercial/  # live-data cockpit + Company Intel tab + Delinquency Watch
│   └── ReactHeadless/    # review harness (personas as routes)
├── applications/         # <App>.app-meta.xml — CustomApplication, binds <uiBundle>c__<Name>
├── permissionsets/       # <App>_Access — applicationVisibilities
└── classes/              # DcBridgeRest.cls (+ test) — the only Apex
docs/                     # DEPLOYMENT_GUIDE.md, customer-360-inventory-and-gaps.md, plans/
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

# Conventions

## React / TypeScript

- Path aliases: `@`, `@api`, `@components`, `@utils`, `@styles`, `@assets` (in `vite.config.ts` + tsconfig), plus `@shared` → the `_shared` library.
- Keep persona content bespoke; share only plumbing and primitives via `@shared`.

## GraphQL (via `sdk.graphql`)

- HTTP 200 ≠ success — always parse the `errors` array (`executeGraphQL` does this and throws).
- `@optional` on every read field (FLS); `first:` mandatory on every query.
- **`Id` returns as a plain string on nodes; every other scalar is wrapped in `{ value }`.** Read `node.Id` directly; read others via `node.Field.value`.

## CSS

- Aurora Glass tokens live in `_shared/src/theme/tokens.css`; light mode IS Aurora. `ThemeProvider` only injects persona-accent overrides. Inter font. One ambient `--wp-aurora` gradient — don't add competing gradients.

## Tests

- Vitest under each bundle's `src/`; run `npm run test -- run` for a single CI pass. Apex: `DcBridgeRestTest` (5 tests).

# Common mistakes

- **Deploying to `/lightning/app/<name>` and concluding it's broken.** That path always redirects to the org default; the real URL is the App Domain (`…my.salesforce.app/app/c__<Name>`).
- **Plain-redeploying a beta bundle** and expecting the binding to take — the stale AppMenuItem survives. Delete + redeploy.
- **Reading `CustomApplication.Metadata` to check the `uiBundle` binding** — Tooling doesn't surface that field; it looks dropped even when correct. Verify in the browser.
- **`sf project delete source` on this repo** — errors on the non-deployable `_shared` bundle. Use a destructiveChanges manifest from a throwaway DX project.
- **Treating `Id` as `{ value }`-wrapped** — it isn't; you'll get empty strings.
- **Assuming `PERSONAL_PRODUCT_RECOMMENDATION__dlm` exists** — only the `_INPU` feature-input DMO does; next-best-product must be derived. `Bank_Churner__dlm` keys on email/Id, not Account — use `CSAT_Snowflake__dlm` (account-joinable) for per-client signals.

# Related docs

- `README.md` — quick start, deployed-app URLs, layout.
- `docs/DEPLOYMENT_GUIDE.md` — full deploy runbook + beta migration.
- `docs/customer-360-inventory-and-gaps.md` — the live-page parity floor + Data Cloud gap analysis + settled content contract.
- `docs/superpowers/plans/` — the foundation + persona implementation plans.
- Sibling JDO projects (`DC_*_LWC`, `Cumulus_Assistant`, etc.) are reference context only.
