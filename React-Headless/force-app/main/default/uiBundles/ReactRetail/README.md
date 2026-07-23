# React Retail — Retail Banking Daily Book

The **Retail Banking** persona of the React-Headless cockpit suite: a retail banker's morning home + customer 360, built as a Salesforce Multi-Framework **UI Bundle** (React 19 + Vite 7 + TypeScript + Tailwind v4 / shadcn/ui). Styled with the **Cumulus Aurora** design language on a **teal** accent (`#14b8a6`), tagline *Daily Book*.

Runs on **live data** — GraphQL for CRM records, the `DcBridgeRest` Apex bridge for Data Cloud, prompt-flow / Einstein for AI summaries — with a per-domain mock fallback via `src/data/dataSource.ts`.

Shared plumbing (Aurora Glass theme, data clients, component primitives, home-action modals, the Configuration page) is inlined from the sibling `_shared/` library via the `@shared` alias. Keep persona content bespoke here; add shared primitives to `_shared`.

## What's inside

- **Home** (`/`) — pipeline / open opportunities / open cases, a schedule table (Tasks + Events bucketed Overdue / Today / Upcoming), goals, leads, and a CSAT-ranked "who to call" list. AI briefs turn into one-click actions (draft with Einstein via `AiGenerateRest`; create tasks / meetings / emails / cases via `CrmWriteRest`), refetching in place with no spinner.
- **Configuration** (`/config`) — org-level admin page to pick which Agentforce model runs each generative action, from a self-updating catalog (`CommandCenterConfigRest` → `/config/*`). See the project README for the catalog mechanism.
- Native-style Salesforce chrome (app-launcher waffle, global search, user menu, notifications) and real Agentforce chat embedded via the Conversation Client.

## Run (development)

From this bundle directory (`force-app/main/default/uiBundles/ReactRetail`):

```bash
npm install
npm run dev            # Vite dev server (~http://localhost:5173); dev:design for design mode
```

## Build

```bash
npm install
npm run build          # tsc -b && vite build -> dist/
```

The production build is written to `dist/` in this folder. **A UIBundle deploys `dist/`, not `src/`** — always rebuild before deploying or committing, or the shipped app won't contain your source changes.

## Deploy

From the **SFDX project root** (the directory that contains `force-app/`), deploy the bundle, its `CustomApplication`, and its access permission set **together** (deploying the app before the bundle exists fails). Target org `jdo-oe0sdd`:

```bash
sf project deploy start \
  --source-dir force-app/main/default/uiBundles/ReactRetail \
  --source-dir force-app/main/default/applications/ReactRetail.app-meta.xml \
  --source-dir force-app/main/default/permissionsets/ReactRetail_Access.permissionset-meta.xml \
  -o jdo-oe0sdd --json
```

Always capture `--json` and read `status` / `numberComponentErrors`. The app renders at the **Salesforce App Domain** (`https://storm-16a17dc388fbe6--c.demo.my.salesforce.app/app/c__ReactRetail`), **not** `/lightning/app/<name>`. See the project [DEPLOYMENT_GUIDE.md](../../../../../docs/DEPLOYMENT_GUIDE.md) for the App Launcher tile bridge and the beta delete-and-redeploy migration.

## Test

```bash
npm run test -- run    # single Vitest pass (CI mode)
npm run lint
npm run build:e2e      # build with E2E asset rewrites, then run Playwright
```

## Related

- [Project README](../../../../../README.md) — quick start, deployed-app URLs, verified deploy facts.
- [AGENTS.md](../../../../../AGENTS.md) — project-context primer (architecture, conventions, common mistakes).
- [CHANGELOG.md](../../../../../CHANGELOG.md) — rolling change history for the whole suite.
