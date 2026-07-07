# Changelog

All notable changes to **React-Headless** — the Salesforce DX project that ships the three-persona React banking cockpit suite (Retail / Wealth / Commercial) on the Salesforce Multi-Framework UI Bundle feature, plus the `_shared` design + data library and the `DcBridgeRest` Apex bridge.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions are grouped by date since the project is delivered as rolling demo metadata rather than a released library. Newest entries appear first.

<div align="center">

[![Salesforce DX](https://img.shields.io/badge/Salesforce-DX-00A1E0?style=for-the-badge&logo=salesforce&logoColor=white)](https://developer.salesforce.com/developer-centers/salesforce-dx)
[![API v67.0](https://img.shields.io/badge/API-v67.0-1589F0?style=for-the-badge)](sfdx-project.json)
[![Updated](https://img.shields.io/badge/Updated-Jul_6_2026-2EA44F?style=for-the-badge)](https://github.com/josers18/JDO/commits/main)
[![Monorepo CHANGELOG](https://img.shields.io/badge/Monorepo-CHANGELOG-181717?style=for-the-badge&logo=github&logoColor=white)](../CHANGELOG.md)

</div>

---

## [July 2026]

### 2026-07-06 — three cockpits live in-org

#### Added

- **Three deployable UI bundles** — `ReactRetail`, `ReactWealth`, `ReactCommercial` — each a standalone Vite build with its own `CustomApplication`, access permission set, and Aurora Glass persona theme (Retail teal, Wealth gold, Commercial copper).
- **`_shared` source library** (non-deployed, inlined via the `@shared` alias): Aurora Glass light-mode theme tokens + `ThemeProvider`, the `executeGraphQL` GraphQL client and `queryDataCloud` Data Cloud client, `useAsyncData`, and the component/chart primitives.
- **`DcBridgeRest` Apex bridge** (`@RestResource /services/apexrest/dc/query`, + test class, 5/5 passing) — runs read-only ANSI SQL against Data Cloud via `ConnectApi.CdpQuery.queryAnsiSqlV2`, since `@AuraEnabled` is uncallable from React.
- **Real-data wiring for ReactRetail's banker home** (`homeDataReal.ts`): live pipeline / open opportunities / open cases (GraphQL), today's schedule (Task + Event), goals (`FinancialGoal`), leads, and a CSAT-ranked "who to call" list (`CSAT_Snowflake__dlm` via the DC bridge, joined to `Account.Name`).
- **`docs/DEPLOYMENT_GUIDE.md`** — runbook for the UIBundle → CustomApplication Lightning-app binding, the App Domain serving URL, and the beta delete-and-redeploy migration.
- **`AGENTS.md`** — project-context primer for AI agents.

#### Fixed

- **In-org rendering blocker.** Apps appeared in the App Launcher but opened blank and redirected to the org default. Root cause: a stale beta-era AppMenuItem plus a missing `<target>CustomApplication</target>` on the bundle metadata. Fix: add the target, keep the `c__` binding, and **delete + redeploy** (a plain redeploy does not clear the stale AppMenuItem). All three now render at `https://storm-16a17dc388fbe6--c.demo.my.salesforce.app/app/c__<Name>`.
- **Home page showing raw account IDs.** GraphQL returns `Id` as a plain string (not `{ value }`-wrapped like every other field); the name-lookup helper keyed on an empty string. Reading `.Id` directly restored real client names.

#### Changed

- Target org re-aliased `jdo-0pz8au` → `jdo-1lrnov` (same org, `storm-16a17dc388fbe6`).
- `README.md` and `CLAUDE.md` refreshed to the multi-bundle reality and the corrected deploy facts.
