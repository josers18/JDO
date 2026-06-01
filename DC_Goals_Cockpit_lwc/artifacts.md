# Artifacts inventory

**Project:** `DC_Goals_Cockpit_lwc` (see `sfdx-project.json`). **Git:** under `JDO/DC_Goals_Cockpit_lwc/` in the JDO monorepo.

Source of truth: `force-app/main/default/`. This file describes each deployable artifact and how it fits together.

**Naming:** App Builder shows **FSC Journey Cockpit**; bundle folder `lwc/fscJourneyCockpit/`; Apex `FscJourneyCockpitController` (+ test); permission set `DC_Goals_Cockpit_User`.

---

### Documentation

| Doc | Topic |
|---|---|
| [README.md](README.md) | Overview, quick start, FlexiPage placement, mermaid architecture |
| [docs/SETUP_GUIDE.md](docs/SETUP_GUIDE.md) | Step-by-step admin runbook with SOQL sanity queries + troubleshooting |
| [AGENTS.md](AGENTS.md) | AI-coding-agent context: architecture, conventions, traps, testing patterns |
| [CHANGELOG.md](CHANGELOG.md) | Keep-a-Changelog format; v1.0 → v1.1 history |
| [artifacts.md](artifacts.md) | This file — deployable artifact inventory |
| [design/fsc-cockpit.html](design/fsc-cockpit.html) | Approved design mock (visual SoT) |

---

## Apex

| Artifact | File(s) | Role |
|---|---|---|
| **FscJourneyCockpitController** | `classes/FscJourneyCockpitController.cls` (+ `-meta.xml`) | `getCockpit(Id recordId, String goalBinding, String lifeEventBinding)`: single `@AuraEnabled(cacheable=true)` entry. Branches on `Account.IsPersonAccount`, dispatches to managed/standard binding loaders, computes KPIs server-side, mints `recordUrl` per row, groups same-`(label, date)` events while retaining un-grouped `members` list for hover popovers. Inner classes: `CockpitView` (wire shape), `JourneyItem` (with `members`), `JourneyMember`, `Kpi`, `PanelCard`. Helpers `loadGoalCards`, `loadOpportunityCards`, `loadPersonJourney`, `loadBusinessJourney`, `computeFundedPct`, `computeGoalKpis`, `computeOpportunityKpis` are `@TestVisible private static`. All SOQL uses `WITH USER_MODE`. `buildAuraException(safe)` helper sets both ctor arg AND `setMessage()` so the LWC toast surfaces the message. |
| **FscJourneyCockpitControllerTest** | `classes/FscJourneyCockpitControllerTest.cls` (+ `-meta.xml`) | 19 tests covering: `computeFundedPct` null/zero/clamp/decimal-trap; managed-Goal status→chip-variant mapping + funded-% sort; opportunity branch (KPI math, IsClosed filtering, empty-state); journey-rail completion derivation (past vs future vs null dates); KPI math direct (avg funded, next deadline, empty card list); standard-binding paths via `FinancialGoalParty` (with picklist API value awareness — `IN_PROGRESS`, `HIGH`); standard-binding `PersonLifeEvent` via `Contact.AccountId`; binding normalization (default fallback to `standard`); error paths (null recordId, unknown account). Uses `findExistingPersonAccountId()` helper to dodge FSC record-type quirks at insert. |

**Sharing:** `with sharing` on the controller — required for LWC-callable code combined with `WITH USER_MODE` SOQL.

---

## Permission set

| Artifact | File | Role |
|---|---|---|
| **DC Goals Cockpit User** | `permissionsets/DC_Goals_Cockpit_User.permissionset-meta.xml` | Apex access: `FscJourneyCockpitController`. Object Read on **9 source objects** so admins can flip `goalBinding` / `lifeEventBinding` in App Builder without re-permissioning: `Account`, `Opportunity`, `BusinessMilestone`, `Contact`, `FinancialGoal`, `FinancialGoalParty`, `FinServ__FinancialGoal__c`, `FinServ__LifeEvent__c`, `PersonLifeEvent`. All Read-only — the LWC writes nothing. |

Assign with: `sf org assign permset --target-org <alias> --name DC_Goals_Cockpit_User --on-behalf-of <username>`.

---

## Lightning Web Component bundle

| File | Role |
|---|---|
| `lwc/fscJourneyCockpit/fscJourneyCockpit.js` | UI logic: `@api recordId / objectApiName / goalBinding / lifeEventBinding / cardColumns / maxJourneyItems / panelMode / themeMode / accentColor / warningColor / negativeColor / showThemeSwitcher`. Wire to Apex; render-side getters (`hasData`, `journeyItems`, `decoratedCards`, `kpis`, etc.); popover state machine (single `_popover` field services hover + menu); `NavigationMixin.Navigate` for record-page + create-page nav; click-outside + Esc dismissal; cmd+click new-tab passthrough; theme application via `_lastAppliedThemeKey` cache + `requestAnimationFrame`-deferred application; 8-char hex alpha-strip for `--wp-accent-bg/-border/-dim`; `iconForLabel` for journey rail icons; `addCardLabel/addJourneyLabel` for "+ New" button text per binding. |
| `lwc/fscJourneyCockpit/fscJourneyCockpit.html` | Markup: theme switcher row (off by default); KPI strip; **two-column body grid** (300px vertical rail + cards panel); rail steps with `step-icon`, title link, description line, count badge; goal/opp cards with title link, ▾ menu button, ring SVG, progress track, chip + foot text; **floating popover** rendered once at the host level for both hover preview and action menu (`<template lwc:if={popoverIsHover}>` vs `<template lwc:if={popoverIsMenu}>`). |
| `lwc/fscJourneyCockpit/fscJourneyCockpit.css` | Layout: mock tokens aliased to `--wp-*` on `:host`; KPI grid; section headers with "+ New" buttons; 300px rail with icon-circle steps; card grid (`var(--wp-card-cols, 2)`); SVG progress rings (`color` on `.ring` resolves SVG `currentColor`); chips per priority/stage; popover (hover + menu variants); `popover-members` list for grouped events; theme switcher row; reduced-motion + responsive breakpoint. |
| `lwc/fscJourneyCockpit/fscJourneyCockpit.js-meta.xml` | Exposure: **Record page only** (Account scope). 8 designer properties (binding × 2, layout × 2, panel mode, theme × 4). |
| `lwc/fscJourneyCockpit/cockpitThemes.js` | **Inlined 43-theme `BASE_THEMES` palette** (parity with `DC_Multiclass_Prediction_LWC/predictionThemes.js` and `DC_Prediction_Model_LWC/predictionThemes.js`). `deriveCockpitTokens(palette)` adds `--wp-progress-good`, `--wp-progress-blue`, `--wp-rail-pending` per theme. `isDarkPalette()` Rec.709 luminance check picks dark-vs-light variants. |
| `lwc/fscJourneyCockpit/__tests__/fscJourneyCockpit.test.js` | 30 jest tests using `createApexTestWireAdapter` for `@wire` provisioning. Custom `NavigationMixin` mock (Symbol attached to mixin function for the `this[NavigationMixin.Navigate]` pattern). Coverage: record-type branching, card rendering, KPI strip, journey rail, wire pass-through, click-through links (with cmd+click new-tab path), theme switcher, "+ New" buttons (per-binding routing), action menu (View/Edit/Clone/Delete + Esc dismiss), error rendering. |

---

## Design mock

| File | Role |
|---|---|
| `design/fsc-cockpit.html` | The approved visual source of truth — open in any browser to see exact KPI / card / ring / chip / rail anatomy the LWC is matched to. Copy of `~/Downloads/fsc-cockpit.html` from the original brief. |

---

## Project configuration (non-deployed tooling)

| Path | Role |
|---|---|
| `sfdx-project.json` | `packageDirectories: [{ path: 'force-app', default: true }]`, `sourceApiVersion: 66.0`, `name: DC_Goals_Cockpit_lwc` |
| `package.json` | `@salesforce/sfdx-lwc-jest`, eslint configs, prettier, `@salesforce/eslint-config-lwc` (recommended). NPM scripts: `test`, `test:unit`, `test:unit:watch`, `test:unit:coverage`, `lint`, `prettier`, `prettier:verify` |
| `package-lock.json` | npm lockfile |
| `jest.config.js` | Wraps `@salesforce/sfdx-lwc-jest/config.jestConfig`; ignores `.localdevserver` |
| `.forceignore` | Standard SFDX ignore: `**/jsconfig.json`, `**/.eslintrc.json`, `**/__tests__/**`, `package.xml` |
| `.gitignore` | `node_modules/`, `coverage/`, `.localdevserver/`, `.sfdx/`, `.sf/`, `.vscode/`, `*.log`, `.DS_Store` |
| `force-app/main/default/lwc/.eslintrc.json` | Extends `@salesforce/eslint-config-lwc/recommended` |

---

## Deploy snapshot (jdo-uqj0jr, 2026-06-01)

| Component | Deploy state | Notes |
|---|---|---|
| `FscJourneyCockpitController` | ✅ Deployed | Score 145/150 (1 false-positive linter warning re: missing-sharing-declaration on the comment block). 19/19 tests pass. **83%** code coverage (12 lines short of 85% — `goalIconFor` keyword branches not exercised). |
| `FscJourneyCockpitControllerTest` | ✅ Deployed | 19/19 passing. Person-account-required tests gracefully `return;` when no person account exists. |
| `fscJourneyCockpit` LWC bundle | ✅ Deployed | SLDS 2 validator 165/165 across all 5 files. 30/30 jest passing. |
| `DC_Goals_Cockpit_User` permission set | ✅ Deployed + assigned | 53 users assigned (31 System Administrators + 22 Standard Users). Bulk Job Id `750am00000gPOwfAAG` (53/53 successful). |

**Latest deploy:** `0Afam00002UuGW1CAN` — adds description line on rail steps.

---

## Not in this repository

These are **required in the org** but are not versioned here:

| Artifact | Purpose |
|---|---|
| **FSC managed package** | Required if `goalBinding=managed` or `lifeEventBinding=managed` is configured on the FlexiPage. Provides `FinServ__FinancialGoal__c` and `FinServ__LifeEvent__c`. |
| **Standard FinancialGoal + FinancialGoalParty data** | Required for the default `goalBinding=standard` path. Junction table populated via FSC Wealth Management features. |
| **Standard PersonLifeEvent data** | Required for the default `lifeEventBinding=standard` path. Auto-populated for Person Accounts in FSC orgs. |
| **FlexiPage placement** | Admins must drop the cockpit onto Account record pages and configure binding attributes. |
