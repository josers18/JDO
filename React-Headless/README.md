# React-Headless

A JDO subproject for building **React-on-Salesforce** apps using the Salesforce Multi-Framework UI Bundle feature.

Scaffolded from the `reactbasic` UI bundle template (React 19 + Vite 7 + TypeScript + Tailwind v4/shadcn). Unlike the `Multiframework_Recipes` port (a verbatim reference copy), this is a clean greenfield workspace to build JDO-native headless React experiences on the Agentforce 360 Platform.

It now hosts a three-persona banking cockpit suite — **React Retail**, **React Wealth**, and **React Commercial** — plus a `ReactHeadless` review harness, all sharing a single `_shared` source library (Aurora Glass design system, data clients, component primitives).

## Status

- **Created:** 2026-06-25
- **Target org:** `jdo-1lrnov` (Cumulus Financial Services, Enterprise Edition — same org as the former `jdo-0pz8au` alias / `storm-16a17dc388fbe6`)
- **API version:** 67.0 (see "Critical: API version" below)
- **Bundles:**
  - `uiBundles/ReactRetail/` — Retail banker home + customer 360 (live GraphQL + Data Cloud data)
  - `uiBundles/ReactWealth/` — Wealth advisory desk
  - `uiBundles/ReactCommercial/` — Commercial relationship command (Company Intel 360 tab + book-level Delinquency Watch)
  - `uiBundles/ReactHeadless/` — review harness (all personas as routes)
  - `uiBundles/_shared/` — non-deployed source library, inlined into each bundle via the `@shared` alias
- **In-org:** all three persona apps are deployed as `CustomApplication`s and render at the Salesforce App Domain (see [Deployed apps](#deployed-apps)).

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | v22+ | |
| npm | latest | |
| Salesforce CLI | v2.130.7+ | includes the `ui-bundle-dev` plugin (`sf template generate ui-bundle`) |

## Verified facts (the hard-won ones)

Confirmed against `jdo-0pz8au` on 2026-06-25 — these override stale public docs:

1. **UIBundle deploys to Enterprise Edition PRODUCTION**, not just scratch/sandbox. The April 2026 beta docs ("scratch/sandbox only") are stale for Summer '26 orgs.
2. **Critical: the real gate is API version, NOT org edition.** The `UIBundle` metadata type is not exposed below a recent API version. At `sourceApiVersion 64.0` every component fails with *"Not available for deploy for this API version."* At **67.0** (the org's version) it deploys clean. Keep `sourceApiVersion` aligned to the org.
3. **There is no Setup toggle to enable.** The `AgentforceVibesInReact` Setup page (Setup → "React Development with Agentforce Vibes and Salesforce Multi-Framework") is informational only. Its absence of an "Enable Domain" button means the Salesforce App Domain is already enabled.
4. **`graphql:schema` introspection is NOT required to build/deploy.** Generated GraphQL types live in the source tree once committed. Only re-run introspection after adding new GraphQL operations — and note it can hang for minutes against a full production-org schema.
5. **A UIBundle DOES become a Lightning app** — pair it with a `CustomApplication` that has `<uiType>Lightning</uiType>` and `<uiBundle>c__<Name></uiBundle>`, and add `<target>CustomApplication</target>` to the `.uibundle-meta.xml`. Two gotchas: (a) the app renders at the **Salesforce App Domain** (`https://<myDomain>--c.<...>.my.salesforce.app/app/c__<Name>`), **not** at `/lightning/app/<name>` (that path shows "invalid or inaccessible" and redirects to the org default). (b) A bundle deployed during the beta carries a stale AppMenuItem — a plain redeploy won't fix it; you must **delete + redeploy** (see [DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md)).
6. **Never deploy with `--ignore-conflicts` blindly** — it masked a hard failure as exit code 0. Always capture `--json` and read `status` / `numberComponentErrors`.
7. **The App Launcher (waffle) tile can't open a UIBundle app directly.** Clicking the raw `CustomApplication` tile lands on `one:noNavItems`. The app renders only at the App Domain, which sends `frame-ancestors 'self'` (can't be iframed) and blocks scripted top-nav out of the LEX tab (no user gesture). The working bridge is a per-app **Visualforce "launch card"** (`<App>Launcher.page`) exposed as a **CustomTab** (`<App>App`), whose `target="_top"` button navigates to the App Domain URL — a user click is the one browser-sanctioned path. VF gotcha: a `.page` source may **not** contain `<!DOCTYPE html>` ("A DOCTYPE is not allowed in content").

## Build

Each bundle builds independently (substitute `ReactRetail` / `ReactWealth` / `ReactCommercial` / `ReactHeadless`):

```bash
cd force-app/main/default/uiBundles/ReactRetail
npm install
npm run build      # tsc -b && vite build -> dist/
```

## Deploy

The `.uibundle-meta.xml`, `CustomApplication`, and access permission set must deploy **together** (deploying the app before the bundle exists fails):

```bash
# from project root, with target-org = jdo-1lrnov
sf project deploy start \
  --source-dir force-app/main/default/uiBundles/ReactRetail \
  --source-dir force-app/main/default/applications/ReactRetail.app-meta.xml \
  --source-dir force-app/main/default/permissionsets/ReactRetail_Access.permissionset-meta.xml \
  -o jdo-1lrnov --json
```

For a bundle first deployed during the beta, a plain redeploy leaves a stale AppMenuItem — follow the delete-and-redeploy migration in [DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md).

Verify it landed:

```bash
sf data query --use-tooling-api \
  -q "SELECT Id, DeveloperName, MasterLabel FROM UIBundle WHERE DeveloperName='ReactRetail' WITH USER_MODE" \
  -o jdo-1lrnov
```

## Deployed apps

All three render in-org at the Salesforce App Domain (org `jdo-1lrnov` / `storm-16a17dc388fbe6`):

| App | Serving URL |
|-----|-------------|
| React Retail | `https://storm-16a17dc388fbe6--c.demo.my.salesforce.app/app/c__ReactRetail` |
| React Wealth | `https://storm-16a17dc388fbe6--c.demo.my.salesforce.app/app/c__ReactWealth` |
| React Commercial | `https://storm-16a17dc388fbe6--c.demo.my.salesforce.app/app/c__ReactCommercial` |

All three apps default to live data (GraphQL for CRM, the `DcBridgeRest` Apex bridge for Data Cloud, and prompt-flow-backed Einstein/Agentforce summaries), with a per-domain mock fallback via `dataSource.ts`. Commercial adds a Company Intel 360 tab (ZoomInfo firmographics, BoardEx governance, MSCI ESG, SEC filings) and a book-level Delinquency Watch home panel.

Each cockpit is styled with the **Cumulus Aurora** design language (Fraunces + Hanken Grotesk typography, light-mode Aurora Glass) and renders native-style Salesforce chrome inside the React shell — an app-launcher waffle, multi-object global search, user menu, and notifications. Every persona also embeds **real Agentforce chat** via the Agentforce Conversation Client (a floating AI assistant), with an in-panel switcher across four employee agents (Cumulus Assistant, Financial Advisor, Data Cloud Agent, Analytics & Visualization).

The banker home turns AI briefs into **one-click actions**: generate/draft with Einstein (`AiGenerateRest` → `/ai/generate`, composed-first with a graceful fallback), and create records — tasks, meetings, emails, cases, follow-ups — through `CrmWriteRest` (`/crm/*`). Writes **refetch in place** (no spinner), so a task or meeting created from the page shows up immediately in its Overdue / Today / Upcoming bucket; the email recipient auto-fills from the client's Account record.

Each cockpit also carries an in-app **Configuration** page (`/config`) where an admin picks which Agentforce model runs each generative action — from a **self-updating catalog** discovered by probing the org's live foundation models (there is no listing API) and cached on a `CommandCenterConfig__c` singleton via `CommandCenterConfigRest` (`/config/*`). Settings are org-level and shared; a "Refresh models" button forces a fresh discovery probe.

The banker home ships **two layouts** behind a top-bar toggle: the original **Current** stacked list and a **Cockpit** command center (compact AI brief, sparkline KPI vitals, side-by-side Priority Queue + Recommended Actions, a tabbed customer-360 workspace panel that master-details off any row you click, and a supporting band whose cells drill into search/filter/table explorers). The **Priority Queue** is blended and dated — it merges each persona's signature risk signal (CSAT / credit / held-away) with open-opportunity and overdue-task items, each with a real due date, so it sorts into a genuinely mixed, ranked worklist.

## Layout

```
React-Headless/
├── sfdx-project.json                    # sourceApiVersion 67.0, package "ReactHeadless"
├── force-app/main/default/
│   ├── uiBundles/
│   │   ├── _shared/                     # non-deployed source library (@shared alias)
│   │   ├── ReactRetail/                 # Retail cockpit (live data)
│   │   ├── ReactWealth/                 # Wealth cockpit
│   │   ├── ReactCommercial/             # Commercial cockpit
│   │   └── ReactHeadless/               # review harness
│   ├── applications/                    # CustomApplication per persona (uiBundle binding)
│   ├── objects/                         # CommandCenterConfig__c — org-level AI config singleton
│   ├── pages/                           # <App>Launcher VF pages — App Launcher bridge to the App Domain
│   ├── tabs/                            # <App>App CustomTabs — the waffle-menu tiles
│   ├── permissionsets/                  # <App>_Access (app/tab/page access) + CommandCenterConfigAdmin (config FLS)
│   └── classes/                         # Apex REST bridges: DcBridgeRest (/dc/query), DcPromptRest (/dc/prompt), AiGenerateRest (/ai/generate), CrmWriteRest (/crm/*), CommandCenterConfigRest (/config/*) + ModelCatalogProbe
├── docs/                                # DEPLOYMENT_GUIDE.md, customer-360 inventory, plans
├── AGENTS.md                            # project-context primer
├── CHANGELOG.md
└── README.md
```
