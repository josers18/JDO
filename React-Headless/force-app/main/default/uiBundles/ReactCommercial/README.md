# React Commercial — Commercial Banking Relationship Command

The **Commercial Banking** persona of the React-Headless cockpit suite: a commercial banker's relationship command center + customer 360, built as a Salesforce Multi-Framework **UI Bundle** (React 19 + Vite 7 + TypeScript + Tailwind v4 / shadcn/ui). Styled with the **Cumulus Aurora** design language on a **copper** accent (`#d97706`), tagline *Relationship Command*.

Runs on **live data** — GraphQL for CRM records, the `DcBridgeRest` Apex bridge for Data Cloud, prompt-flow / Einstein for AI summaries — with a per-domain mock fallback via `src/data/dataSource.ts`.

Shared plumbing (Aurora Glass theme, data clients, component primitives, home-action modals, the Configuration page) is inlined from the sibling `_shared/` library via the `@shared` alias. Keep persona content bespoke here; add shared primitives to `_shared`.

## What's inside

- **Home** (`/`) — the relationship-command dashboard, a schedule table (Tasks + Events bucketed Overdue / Today / Upcoming), and a book-level **Delinquency Watch** panel (`Loan_Delinquencies__dlm` aggregate — book-level rather than per-client because the data isn't customer-joinable in this org). AI briefs turn into one-click actions (draft with Einstein via `AiGenerateRest`; create tasks / meetings / emails / cases via `CrmWriteRest`), refetching in place with no spinner.
- **Customer 360** — includes a **Company Intel** tab fusing four corporate signals for business accounts: ZoomInfo firmographics, BoardEx board/governance intel, MSCI ESG profile, and SEC filings (via the DC bridge; null-safe with a graceful empty state for non-business accounts). Plus CoreLogic Property + MoneyGuidePro plan cards.
- **Configuration** (`/config`) — org-level admin page to pick which Agentforce model runs each generative action, from a self-updating catalog (`CommandCenterConfigRest` → `/config/*`). See the project README for the catalog mechanism.
- Native-style Salesforce chrome (app-launcher waffle, global search, user menu, notifications) and real Agentforce chat embedded via the Conversation Client.

## Run (development)

From this bundle directory (`force-app/main/default/uiBundles/ReactCommercial`):

```bash
npm install
npm run dev            # Vite dev server (~http://localhost:5173); dev:design for design mode
```

## Build

```bash
npm install
npm run build          # tsc -b && vite build -> dist/
```

The production build is written to `dist/` in this folder. **A UIBundle deploys `dist/`, not `src/`** — always rebuild before deploying or committing, or the shipped app won't contain your source changes. (This bit the Company Intel feature once: a `src/`-only commit shipped an invisible feature until `dist/` was rebuilt.)

## Deploy

From the **SFDX project root** (the directory that contains `force-app/`), deploy the bundle, its `CustomApplication`, and its access permission set **together** (deploying the app before the bundle exists fails). Target org `jdo-oe0sdd`:

```bash
sf project deploy start \
  --source-dir force-app/main/default/uiBundles/ReactCommercial \
  --source-dir force-app/main/default/applications/ReactCommercial.app-meta.xml \
  --source-dir force-app/main/default/permissionsets/ReactCommercial_Access.permissionset-meta.xml \
  -o jdo-oe0sdd --json
```

Always capture `--json` and read `status` / `numberComponentErrors`. The app renders at the **Salesforce App Domain** (`https://storm-16a17dc388fbe6--c.demo.my.salesforce.app/app/c__ReactCommercial`), **not** `/lightning/app/<name>`. See the project [DEPLOYMENT_GUIDE.md](../../../../../docs/DEPLOYMENT_GUIDE.md) for the App Launcher tile bridge and the beta delete-and-redeploy migration.

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
