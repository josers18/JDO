# Changelog

All notable changes to **JDO** (Jose's Demo Org) — Salesforce DX packages, LWCs, Apex, and demo data utilities.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions are grouped by calendar month since this repo is a rolling demo org rather than a released library. Newest entries appear first.

<div align="center">

[![Salesforce DX](https://img.shields.io/badge/Salesforce-DX-00A1E0?style=for-the-badge&logo=salesforce&logoColor=white)](https://developer.salesforce.com/developer-centers/salesforce-dx)
[![Updated](https://img.shields.io/badge/Updated-May_15_2026-2EA44F?style=for-the-badge)](https://github.com/josers18/JDO/commits/main)
[![Packages](https://img.shields.io/badge/DX_Packages-9-0176D3?style=for-the-badge)](README.md#projects)
[![Commits](https://img.shields.io/badge/Commits-60%2B-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/josers18/JDO/commits/main)

</div>

---

## What's new this month

> **May 2026** — Shipped the **FSC Audit Utilities** project (13 phases of automated demo-org cleanup and seed data), added the **JDO_Login_Portal** design spec for self-service org provisioning + telemetry, the **sf-tableau-next** skill for Tableau Next REST APIs, a new **Financial_KPI_Widget** DX project, and the **Web_Engagements_RT_Timeline** project (LWC + Apex) that renders Data Cloud `RT_Web_Engagementsv2` Data Graph results live on Account/Contact record pages. Customer Profile widget now leads with **Deposits** as the prominent KPI tile.

Jump to: [May 2026](#may-2026) · [April 2026](#april-2026) · [March 2026](#march-2026)

---

## [May 2026] — 2026-05-11 → 2026-05-15

**Theme:** FSC master demo org audit and remediation. Thirteen phases (A–H, B1–B13) of automated parity, backfill, and seed work delivered as one unified `FSC_Audit_Utilities` DX project. Plus new packages and skills.

### Added
- **`Web_Engagements_RT_Timeline/`** — New DX project: `webEngagementData` LWC + `DataCloudWebEngagementController` Apex. Renders the `RT_Web_Engagementsv2` Data Graph as an SLDS expandable timeline on Account/Contact record pages; resolves Salesforce ID → Data Cloud Unified ID via `UnifiedLinkssotAccountAcc__dlm` and live-fetches the graph through `callout:Data_Cloud_API`.
- **`JDO_Login_Portal/`** — Design spec for a self-service login portal with provisioning + telemetry. ([`94ad8a9`](https://github.com/josers18/JDO/commit/94ad8a9))
- **`sf-tableau-next/`** — Skill for Tableau Next + Tableau Semantics REST APIs. ([`069e9d1`](https://github.com/josers18/JDO/commit/069e9d1))
- **`Financial_KPI_Widget/`** — New DX project. ([`e0cea1f`](https://github.com/josers18/JDO/commit/e0cea1f))
- **`FSC_Audit_Utilities/`** — Master FSC demo-org audit project; ships 5 architecture decisions, 13 execution phases, and reusable Apex utilities. ([`ef2c55a`](https://github.com/josers18/JDO/commit/ef2c55a))
  - **Phase A8–A12** — Five-step FSC legacy/standard parity batch. ([`16e47d5`](https://github.com/josers18/JDO/commit/16e47d5))
  - **Phase A13** — Loan Financial Account rebalance: 101 loans repriced from $34B total / $337M avg → $251M total / $2.5M avg, with `IsRebalanced__c` idempotency gate. ([`e23b34e`](https://github.com/josers18/JDO/commit/e23b34e), [`0efb387`](https://github.com/josers18/JDO/commit/0efb387), [`bc7e739`](https://github.com/josers18/JDO/commit/bc7e739))
  - **Phase B1** — `FscEngagementSeed`: 1,200 demo-engagement records. ([`ab387f7`](https://github.com/josers18/JDO/commit/ab387f7))
  - **Phase B3** — `FscHoldingsBackfill`: filled 35 empty Investment FAs. ([`6eaa35f`](https://github.com/josers18/JDO/commit/6eaa35f))
  - **Phase B4** — Placed 7 unhoused Person Accounts into solo households. ([`dd58c82`](https://github.com/josers18/JDO/commit/dd58c82))
  - **Phase B5** — `FscIsEnrichAndExpand`: 500 advisor-authored Interaction Summaries. ([`343064f`](https://github.com/josers18/JDO/commit/343064f))
  - **Phase B6** — `FscContactPointSeed` (closes Data Cloud identity gap C6). ([`f36c72b`](https://github.com/josers18/JDO/commit/f36c72b))
  - **Phase B9 + B10** — PersonHomePhone backfill; Banking story closed. ([`e77c357`](https://github.com/josers18/JDO/commit/e77c357))
  - **Phase B12** — `FscInsuranceSeed`. ([`54e6b6b`](https://github.com/josers18/JDO/commit/54e6b6b))
  - **Phase B13** — `FscGoalMigrate`: forward-created 184 records from non-personal goals. ([`e8b0972`](https://github.com/josers18/JDO/commit/e8b0972))
- **A7 Cumulus inventory** — Installed-package inventory with deferred uninstall plan. ([`5f650d6`](https://github.com/josers18/JDO/commit/5f650d6))

### Changed
- **`customerProfileWidget`** — Promoted **Deposits** to a prominent KPI tile; demoted Annual Revenue to a field row. ([`c0bc244`](https://github.com/josers18/JDO/commit/c0bc244))
- **Phase B7** — Verified household rollups; uncovered finding C9 (deferred). ([`6b631fa`](https://github.com/josers18/JDO/commit/6b631fa))
- **Phase B11** — Authored `FSC_Audit_Utilities/CLAUDE.md` documenting the architectural rule. ([`0cadd5f`](https://github.com/josers18/JDO/commit/0cadd5f))
- **`.gitignore`** — Excludes `.vscode/` editor settings. ([`8acad43`](https://github.com/josers18/JDO/commit/8acad43))

### Closed (by acceptance / structural blocker)
- **Phase A** — A2 + A4 (96%) + A6 closed; findings H11 and B13 captured. ([`4909b57`](https://github.com/josers18/JDO/commit/4909b57))
- **A3** — Person Account RT consolidation deferred; FSC `AccountTrigger` constraint documented (no demo impact). ([`283c198`](https://github.com/josers18/JDO/commit/283c198))
- **A4 part 2 + H12** — Reopen criteria documented. ([`210ca69`](https://github.com/josers18/JDO/commit/210ca69))
- **A7** — Closed fully: 1 package uninstalled, 6 deferred to UI, 4 reclassified as in-use. ([`9c283d1`](https://github.com/josers18/JDO/commit/9c283d1), [`953cacf`](https://github.com/josers18/JDO/commit/953cacf))
- **B2** — Transaction story now lives in Data Cloud, not CRM. ([`f942989`](https://github.com/josers18/JDO/commit/f942989))
- **B8** — Reframed and closed via Phase B12. ([`54e6b6b`](https://github.com/josers18/JDO/commit/54e6b6b))
- **C9** — Programmatic Household backfill structurally blocked by FSC. ([`d8a7c8b`](https://github.com/josers18/JDO/commit/d8a7c8b))
- **H11** — Cancelled 36 stale Flow orchestrations; unblocked 5 of 11 deferred A4 deletes. ([`0cef1bd`](https://github.com/josers18/JDO/commit/0cef1bd))

---

## [April 2026] — 2026-04-03 → 2026-04-25

**Theme:** Demo-data generation systems and a documentation overhaul. The Business Profile Widget gained Einstein overviews and configurable pipeline; new "narrative" packages (Cumulus Products, CSAT/NPS, Financial Trades) joined the monorepo; every existing DX package got plain-language guides aimed at semi-technical readers.

### Added
- **`Cumulus_Products/`** — 55 fictitious bank product brochures. ([`378665c`](https://github.com/josers18/JDO/commit/378665c))
- **`Snowflake_CSAT_NPS/`** — End-to-end CSAT/NPS score generation system with full documentation. ([`022f97b`](https://github.com/josers18/JDO/commit/022f97b))
- **`Financial_Trades_Generation/`** — New demo-data system: `.gitignore`, full documentation, shield badges. ([`596de2f`](https://github.com/josers18/JDO/commit/596de2f), [`584a80c`](https://github.com/josers18/JDO/commit/584a80c), [`e6681fb`](https://github.com/josers18/JDO/commit/e6681fb), [`ac99415`](https://github.com/josers18/JDO/commit/ac99415))
- **Theme catalog PDF** — Shared 42-theme visual reference; copied into each widget package; unified INDEX/README links. ([`4d0ae69`](https://github.com/josers18/JDO/commit/4d0ae69), [`08d6a8b`](https://github.com/josers18/JDO/commit/08d6a8b))
- **Plain-language docs** — `INDEX.md` / `DEPLOY.md` / `HOW_TO.md` for **every** DX package, written for semi-technical readers. ([`b907f2c`](https://github.com/josers18/JDO/commit/b907f2c), [`9070626`](https://github.com/josers18/JDO/commit/9070626), [`82e08b1`](https://github.com/josers18/JDO/commit/82e08b1))
- **Customer profile** — Flow/SOQL field mapping reference; full Business profile docs; monorepo index. ([`1761a40`](https://github.com/josers18/JDO/commit/1761a40))

### Changed
- **`DC_BusinessProfileWidget`**
  - Einstein overview path, styling refinements, expanded documentation. ([`872e1b0`](https://github.com/josers18/JDO/commit/872e1b0))
  - Assembly Flow hints + interest-expense flow mapping. ([`627dcff`](https://github.com/josers18/JDO/commit/627dcff))
  - Configurable Pipeline opportunity limit. ([`d596a48`](https://github.com/josers18/JDO/commit/d596a48))
  - Business Pipeline tab + icons; shared prediction themes. ([`4d0ae69`](https://github.com/josers18/JDO/commit/4d0ae69))

### Fixed
- **`DC_Multiclass_Prediction_LWC`** — Resolved Dependabot findings in npm dependencies. ([`abc7367`](https://github.com/josers18/JDO/commit/abc7367))

---

## [March 2026] — 2026-03-26 → 2026-03-31

**Theme:** Repo genesis. The first six DX packages went online, shared theme tokens were standardized across widgets, and the D360 External Credential setup was nailed down for the Person Profile Agentforce overview path.

### Added
- **Initial monorepo** — `README.md` clarifies JDO as "Jose's Demo Org"; tech-stack badges, centered tagline, repo purpose. ([`b40bf95`](https://github.com/josers18/JDO/commit/b40bf95), [`56598c6`](https://github.com/josers18/JDO/commit/56598c6))
- **`DC_Prediction_Model_LWC`** — Percent gauge or big-number metric panel + drivers + optional summary; profile-aligned themes (`predictionThemes.js`). Renamed from Classification Model LWC. ([`489be3a`](https://github.com/josers18/JDO/commit/489be3a), [`700f38b`](https://github.com/josers18/JDO/commit/700f38b), [`f4eaa38`](https://github.com/josers18/JDO/commit/f4eaa38))
- **`DC_Multiclass_Prediction_LWC`** — Multiclass text prediction with diverging bars; cloned from Prediction Model and themed in parallel. ([`a6c9964`](https://github.com/josers18/JDO/commit/a6c9964), [`fb1cd80`](https://github.com/josers18/JDO/commit/fb1cd80), [`c5aed4c`](https://github.com/josers18/JDO/commit/c5aed4c))
- **`DC_AgentForce_Output_LWC`** — Agent output card showing Flow-generated text/HTML/Markdown; copy, print, optional thumbs. ([`07b6cb8`](https://github.com/josers18/JDO/commit/07b6cb8))
- **`DC_Query_to_Table_LWC`** — Data Cloud SQL → `lightning-datatable`; App Builder–driven SQL, auto-run option, custom header (icon + title color), SLDS-style configuration panel, sortable columns with typed compare. ([`baaffdc`](https://github.com/josers18/JDO/commit/baaffdc), [`b3dd3ff`](https://github.com/josers18/JDO/commit/b3dd3ff), [`8bb7e81`](https://github.com/josers18/JDO/commit/8bb7e81), [`e3164d2`](https://github.com/josers18/JDO/commit/e3164d2), [`05c7a10`](https://github.com/josers18/JDO/commit/05c7a10), [`cd95f9e`](https://github.com/josers18/JDO/commit/cd95f9e), [`2b76a07`](https://github.com/josers18/JDO/commit/2b76a07), [`184a63e`](https://github.com/josers18/JDO/commit/184a63e))
- **`DC_PersonProfileWidget`** — Customer profile card (Account + Contact); seven tabs incl. Structure; SOQL + `flow:`/`flows:`; Insight (Einstein) and Overview (Agentforce) optional overlays; rollups (open cases / open opp amount). ([`46ff867`](https://github.com/josers18/JDO/commit/46ff867))
- **Permission sets** — `DC_Prediction_Model_User` for Apex access; standard-user permission sets for all JDO LWCs; Person Profile permission sets for Apex + D360 External Credential. ([`be0222b`](https://github.com/josers18/JDO/commit/be0222b), [`e3f090a`](https://github.com/josers18/JDO/commit/e3f090a), [`54a7b32`](https://github.com/josers18/JDO/commit/54a7b32), [`75ad445`](https://github.com/josers18/JDO/commit/75ad445))
- **Documentation hub** — `docs/INDEX.md`, `MONOREPO_OVERVIEW`, `COMPONENT_GUIDE`, `DEPLOYMENT_GUIDE`, `MOBILE_AND_FORM_FACTORS`, `DIAGRAMS`, `ARCHITECTURE`, `ARTIFACTS`, `THEME_CATALOG`. ([`e2fad43`](https://github.com/josers18/JDO/commit/e2fad43), [`6adb1b4`](https://github.com/josers18/JDO/commit/6adb1b4), [`bf026e8`](https://github.com/josers18/JDO/commit/bf026e8))

### Changed
- **Prediction widgets** — Full-width metric panel for non-percent predictions; all guides synced to new prediction formats and metric panel UI. ([`f4eaa38`](https://github.com/josers18/JDO/commit/f4eaa38), [`99c7b52`](https://github.com/josers18/JDO/commit/99c7b52))

### Fixed
- **D360 External Credential** — OAuth token URL pointed to My Domain (resolved `invalid_grant`); removed `Scope` parameter (resolved "scope parameter not supported"). ([`1186fa2`](https://github.com/josers18/JDO/commit/1186fa2), [`8c4c8d9`](https://github.com/josers18/JDO/commit/8c4c8d9))
- **`DC_Query_to_Table_LWC`** — Apex JSON variable shadow; sort logic; LWC tokens; empty-results handling (JSON key casing, LIMIT, grid UX). ([`17980e8`](https://github.com/josers18/JDO/commit/17980e8), [`febce93`](https://github.com/josers18/JDO/commit/febce93))
- **`ARCHITECTURE.md`** — Mermaid sequence diagram parse error. ([`fb49cf2`](https://github.com/josers18/JDO/commit/fb49cf2))

### Removed
- **`DC_Carousel_LWC`** — Added then removed in the same week (SLDS carousel; slot + JSON slides). Monorepo references cleaned up. ([`4ed96d7`](https://github.com/josers18/JDO/commit/4ed96d7), [`8be510a`](https://github.com/josers18/JDO/commit/8be510a))

---

## How to read this changelog

- **Versions** are calendar months because JDO is a rolling demo, not a released library.
- **Categories** follow Keep a Changelog: `Added` / `Changed` / `Fixed` / `Removed` (plus `Closed` for FSC audit phases that ended by acceptance rather than code).
- **Commit hashes** in parentheses link to the GitHub commit so anyone in `#jdo` can jump straight to the diff.
- **For the full commit log:** [github.com/josers18/JDO/commits/main](https://github.com/josers18/JDO/commits/main).

---

<div align="center">

**Maintained by [@josers18](https://github.com/josers18)** · Questions? Drop them in the `#jdo` Slack channel.

</div>
