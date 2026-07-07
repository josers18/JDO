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
  - `uiBundles/ReactCommercial/` — Commercial relationship command
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

Retail runs on live GraphQL + Data Cloud data; Wealth and Commercial currently render on mock fixtures.

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
│   ├── permissionsets/                  # <App>_Access (applicationVisibilities)
│   └── classes/                         # DcBridgeRest — Apex REST → Data Cloud bridge
├── docs/                                # DEPLOYMENT_GUIDE.md, customer-360 inventory, plans
├── AGENTS.md                            # project-context primer
├── CHANGELOG.md
└── README.md
```
