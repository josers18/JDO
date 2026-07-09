# Changelog

All notable changes to **React-Headless** — the Salesforce DX project that ships the three-persona React banking cockpit suite (Retail / Wealth / Commercial) on the Salesforce Multi-Framework UI Bundle feature, plus the `_shared` design + data library and the `DcBridgeRest` Apex bridge.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions are grouped by date since the project is delivered as rolling demo metadata rather than a released library. Newest entries appear first.

<div align="center">

[![Salesforce DX](https://img.shields.io/badge/Salesforce-DX-00A1E0?style=for-the-badge&logo=salesforce&logoColor=white)](https://developer.salesforce.com/developer-centers/salesforce-dx)
[![API v67.0](https://img.shields.io/badge/API-v67.0-1589F0?style=for-the-badge)](sfdx-project.json)
[![Updated](https://img.shields.io/badge/Updated-Jul_9_2026-2EA44F?style=for-the-badge)](https://github.com/josers18/JDO/commits/main)
[![Monorepo CHANGELOG](https://img.shields.io/badge/Monorepo-CHANGELOG-181717?style=for-the-badge&logo=github&logoColor=white)](../CHANGELOG.md)

</div>

---

## [July 2026]

### 2026-07-09 — Agentforce agent switcher: correct switch mechanism

#### Fixed

- **Agent switching now genuinely re-initializes the conversation.** The in-panel agent picker switches between the org's four employee agents by **re-embedding** the Agentforce Conversation Client (teardown + re-mount, keyed on the active agent id), with one `requestAnimationFrame` between teardown and re-embed so Lightning Out's global component registry settles. Verified live: switching Cumulus Assistant → Data Cloud Agent flips both the panel header AND the greeting ("Hi, I'm Agentforce!…" → "Welcome to Data Cloud Agent!…"), and the choice persists across a refresh.
- **Reverted the in-place `configuration` prop-swap regression** (shipped intra-day): reassigning the mounted frame's `configuration` only relabels the chrome — ACC's inner LWC reads `configuration` once at mount, so the running conversation never switched. The "already registered to another App" console error during re-embed is non-fatal; the fresh session loads regardless.

#### Changed

- Agent-picker chip **docks to the chat panel's top-right edge** when the panel is open (no overlap with the conversation body) and collapses to a small accent dot by the FAB when closed.

### 2026-07-08 — Cumulus Aurora redesign + native chrome + real Agentforce chat

#### Added

- **Cumulus Aurora design language** across all four bundles — a light-mode `:root` token baseline (Fraunces display + Hanken Grotesk body typography), and a set of shared primitives: `ScoreRing`, `StatTile`, `Panel`, `Meter`, `EntityRow`, `HeroBand`, `Eyebrow`, `Pill`, plus a lucide `iconMap` + `Icon` helper. All three cockpits (Retail / Wealth / Commercial) recomposed on the new system.
- **Native Salesforce chrome baked into the React shell** — `AppLauncher` (33-icon waffle), `GlobalSearch` (multi-object), `UserMenu` (Setup / Data Cloud links), and `NotificationBell` (Cases / Opps) as `_shared` components, so each cockpit reads like a first-class in-org app.
- **Real Agentforce chat via the Agentforce Conversation Client (ACC)** on Retail / Wealth / Commercial / Headless — embedded through `@salesforce/agentforce-conversation-client` (Lightning Out 2.0), themed to the Aurora pink AI accent, with a roomier floating panel. Reuses the app's authenticated Salesforce session (no Connected App / OAuth dance).

#### Fixed

- **Waffle nav tiles opened the wrong app.** App Launcher tiles now link by `AppDefinition.DurableId` (the LEX router id), not `DeveloperName`, fixing the "invalid or inaccessible" redirect.
- **Readability on white surfaces** — made light the `:root` token baseline (nothing falls back to dark) and darkened the muted/faint text tokens for WCAG-adequate contrast.

### 2026-07-07 — App Launcher tiles + Dependabot cleanup

#### Added

- **App Launcher tiles for all three apps** (`pages/` + `tabs/`). A UIBundle `CustomApplication` tile can't open the app directly — it lands on `one:noNavItems` because the app renders only at the Salesforce App Domain, which can't be iframed (`frame-ancestors 'self'`) and blocks scripted top-nav out of the LEX tab. Each app now has a Visualforce "launch card" (`<App>Launcher.page`) exposed as a `CustomTab` (`<App>App`); its `target="_top"` button navigates the top window to the App Domain URL — the one browser-sanctioned launch path. Permsets gained matching `pageAccesses` + `tabSettings`.

#### Security

- **Cleared all 60 open Dependabot npm advisories (8 critical, 20 high, 24 medium, 8 low)** via `overrides` across 8 projects. All were transitive: `protobufjs → ^7.6.3` and `esbuild → ^0.28.1` in the four React bundles (protobufjs pulled by the `o11y` telemetry SDK; 2 critical + 5 high); `@babel/core → ^7.29.6` and a scoped `@istanbuljs/load-nyc-config` → `js-yaml ^3.15.0` in the four sibling LWC projects. Runtime `dist/` unaffected — telemetry/build/test deps only; bundles rebuild to identical output hashes.

### 2026-07-07 — live data across all three cockpits + Commercial Company Intel

#### Added

- **Full Customer-360 wired to real org data across all three apps** — the §3b content contract (`full360DataReal.ts`) now fetches accounts / transactions / trades / interactions / cases / CSAT-NPS / opportunities / campaigns / notes from GraphQL + the Data Cloud bridge. All three apps default `core` / `dataCloud` / `agentforce` to real, with per-domain mock fallback via `dataSource.ts`.
- **Live Einstein/Agentforce summaries** — per-section AI briefs via a prompt-flow bridge (`promptClient`), replacing static mock text.
- **CoreLogic Property + MoneyGuidePro plan** on the Commercial 360 (§2 gap closure) — property value / equity / HELOC propensity / risk, and a MoneyGuidePro financial-plan card.
- **Company Intel tab on the Commercial 360** — one tab fusing four corporate signals for business accounts: ZoomInfo firmographics, BoardEx board/governance intel, MSCI ESG profile, and SEC filings. Null-safe with a graceful empty state for non-business accounts. Wired to `CumulusZoomInfoFirmographics__dlm`, `CumulusBoardExExecIntel__dlm`, `CumulusMSCIESG__dlm`, and `SEC_Filings__dlm` via the DC bridge.
- **Book-level Delinquency Watch panel** on the Commercial home dashboard — a `Loan_Delinquencies__dlm` aggregate (delinquent balance + status breakdown). Book-level rather than per-client because the data is not customer-joinable in this org.
- **Design spec + implementation plan** under `docs/superpowers/` for the Commercial Company Intel + Delinquency Watch work.

#### Fixed

- **Stale deployed bundle.** The Company Intel feature commits changed `src/` only; since a UIBundle deploys `dist/` (not `src/`), the committed `ReactCommercial` bundle did not contain the feature. Rebuilt `dist/` so the deployed artifact actually renders Company Intel + Delinquency Watch.

#### Changed

- **`docs/customer-360-inventory-and-gaps.md`** corrected: MSCI ESG is a Commercial corporate-entity signal (not per-holding Wealth); loan delinquency is book-level (not customer-joinable). ZoomInfo / BoardEx / SEC / MSCI / delinquency gaps marked shipped.

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
