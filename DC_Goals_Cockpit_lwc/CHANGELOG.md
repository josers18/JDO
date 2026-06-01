# Changelog

All notable changes to **DC_Goals_Cockpit_lwc** — the Salesforce DX project that ships the FSC Journey Cockpit LWC, supporting Apex, design metadata, and a permission set.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions are grouped by date since the project is delivered as rolling demo metadata rather than a released library. Newest entries appear first.

<div align="center">

[![Salesforce DX](https://img.shields.io/badge/Salesforce-DX-00A1E0?style=for-the-badge&logo=salesforce&logoColor=white)](https://developer.salesforce.com/developer-centers/salesforce-dx)
[![API v66.0](https://img.shields.io/badge/API-v66.0-1589F0?style=for-the-badge)](sfdx-project.json)
[![Updated](https://img.shields.io/badge/Updated-Jun_1_2026-2EA44F?style=for-the-badge)](https://github.com/josers18/JDO/commits/main)
[![Monorepo CHANGELOG](https://img.shields.io/badge/Monorepo-CHANGELOG-181717?style=for-the-badge&logo=github&logoColor=white)](../CHANGELOG.md)

</div>

---

## [2026-06-01] — v1.1.0

### Added

- **Click-through links** on every goal card title, opportunity card title, and journey-rail step. `<a href={recordUrl}>` honors cmd+click for new-tab; plain click routes through `NavigationMixin.Navigate({ type: 'standard__recordPage', actionName: 'view' })`. The controller mints `recordUrl` per binding (so standard goals → `/lightning/r/FinancialGoal/...`, managed goals → `/lightning/r/FinServ__FinancialGoal__c/...`).
- **Hover preview popover** appears 180ms after mouseenter on any rail step or card. Renders eyebrow (Person Life Event / Business Milestone / Financial Goal / Opportunity) + title + key fields (type, date, amount, status / stage / close date) + `+ New` button + `Open record` link. Disappears 200ms after mouseleave; canceled if the popover itself is hovered.
- **Grouped-event hover** — when a rail step shows `x2` / `x3` from same-date events, hovering lists every member event with its own click-through link, scrollable up to 220px. Apex now emits a `members: List<JourneyMember>` per `JourneyItem` (always populated; size 1 for ungrouped rows) so the LWC can choose between summary view vs list view.
- **Per-card ▾ action menu** — `View` / `Edit` / `Clone` / `Delete` actions on goal and opportunity cards, all routing through `NavigationMixin.Navigate` to the standard record page. Esc closes; click-outside closes; chevron toggles open/closed for keyboard users.
- **+ New buttons** in section headers — `+ New Event` / `+ New Goal` (person), `+ New Milestone` / `+ New Opportunity` (business). Routes to `standard__objectPage` create for the right object per binding (`FinServ__LifeEvent__c` vs `PersonLifeEvent`, `FinServ__FinancialGoal__c` vs `FinancialGoal`).
- **Description line** on every rail step — between the title (event type) and the date. Shows the underlying record's `Name` (e.g. "Appointed CEO Morris Roasters" when the EventType is "Job"). Suppressed when redundant (Name == EventType). 2-line clamp with ellipsis + tooltip showing full text.
- **Esc key handler** at window level returns focus to the popover trigger element on close — full SLDS focus-management score (10/10 in validator).
- **Permission set** `DC_Goals_Cockpit_User` — Apex access to `FscJourneyCockpitController` + Read on Account, Opportunity, BusinessMilestone, Contact, FinancialGoal, **FinancialGoalParty**, FinServ__FinancialGoal__c, FinServ__LifeEvent__c, PersonLifeEvent. Both binding modes fully covered.

### Changed

- **`goalBinding` default flipped from `managed` to `standard`** — matches the FSC native FinancialGoals component, which reads via the `FinancialGoalParty` junction. The legacy `WHERE FinancialPlan.AccountId = :rid` join was returning ~92% empty results because most goals have null `FinancialPlanId`.
- **`lifeEventBinding` default flipped from `managed` to `standard`** — `PersonLifeEvent` is the modern API surface and what FSC native widgets surface.
- **`loadStandardGoals` rewritten** to use `WHERE Id IN (SELECT FinancialGoalId FROM FinancialGoalParty WHERE AccountId = :recordId)`. This is what gets the cockpit to a 1:1 match with the FSC native widget for accounts like Julie E Morris (6 goals, including Charitable Giving).
- **Priority chip mapping for standard goals** — `FinancialGoal.Priority` API values are `HIGH` / `MEDIUM` / `LOW` (uppercase), not the `High` / `Medium` / `Low` labels the describe API surfaces. Controller now translates so the chip CSS classes (`.chip.High`, `.chip.Medium`, `.chip.Low`) resolve correctly.
- **Goal card icons** — expanded keyword mapping in `goalIconFor()`: Wedding→ribbon, College→education, Estate→knowledge_base, Vacation→world, Retirement→moneybag, Charitable→heart, Emergency→shield, Investment→trending, Healthcare→advanced_function, Auto→travel_and_places. Default fallback now `utility:goals` (was `utility:target`).
- **Inverse icons on dark backgrounds** — completed rail nodes now use `lightning-icon variant="inverse"` for white icons on the blue circle. Replaces fragile `--sds-c-icon-color-foreground-default` CSS variable injection.
- **Colored progress rings** — `.ring { color: var(--gold) }`, `.ring.full { color: var(--green) }`, `.ring.blue { color: var(--blue) }` on the container so the SVG `stroke="currentColor"` resolves to the right hue. Previous CSS only colored the inner `.pc` text label, not the arc.
- **`cockpitThemes.js`** — inlined the 43-theme `BASE_THEMES` dict. Previously imported from `c/predictionThemes`, which prevented standalone deployment. Palette stays in sync with `DC_Multiclass_Prediction_LWC` by convention.

### Fixed

- **`Decimal.compareTo()` is not visible** in this org's Apex compiler at v66 — replaced all calls with direct `<` / `>` operators (Apex auto-coerces).
- **`PersonAccount` is not a valid `<targetConfig><objects>` value** in FlexiPage meta — removed; `Account` scope already covers Person Accounts via `IsPersonAccount=true` filtering inside the LWC.
- **`BusinessMilestone` requires `Name`, `MilestoneType`, AND `MilestoneDate`** at insert (all `nillable=false`). Tests updated.
- **`PermissionSet.description` has a 255-char cap** enforced only at deploy time. Trimmed from 524 → 196 chars.
- **Popover field iteration** — `<template lwc:if={pf.label} key={pf.label}>` was malformed (LWC1071). Replaced with `<div key={pf.label} class="popover-field">` wrapper.
- **`buildAuraException` fallback "Operation failed."** — controller now uses this helper consistently for every thrown error so the LWC toast surfaces the safe message instead of "Script-thrown exception".

### Documentation

- **README.md** — full rewrite with badges, mermaid architecture diagram, FlexiPage attribute table, FinancialGoalParty join story, caveats section.
- **AGENTS.md** — full rewrite with v1.1 architecture, conventions, traps section (picklist label-vs-value, BusinessMilestone required fields, PersonAccount FlexiPage trap, PermissionSet description cap, bulk API CRLF requirement).
- **CHANGELOG.md** (this file) — created.
- **artifacts.md** — created; matches sibling LWC convention.

---

## [2026-06-01] — v1.0.0 — Initial release

### Added

- **`fscJourneyCockpit` LWC** — single record-page card that replaces FSC stock Goals + Life Events sections.
  - 4-tile KPI strip (record-type-specific math)
  - 300px vertical journey rail (Life Events / Business Milestones)
  - Adaptive right panel (Goals for person, Opportunities for business)
  - 8 FlexiPage design attributes: `goalBinding`, `lifeEventBinding`, `cardColumns`, `maxJourneyItems`, `panelMode`, `themeMode`, `accentColor`, `showThemeSwitcher`
- **`FscJourneyCockpitController.cls`** — single `@AuraEnabled(cacheable=true) getCockpit(recordId, goalBinding, lifeEventBinding)` entry. Inner DTOs: `CockpitView`, `JourneyItem`, `Kpi`, `PanelCard`. All SOQL uses `WITH USER_MODE`; KPI math computed server-side; `buildAuraException` helper on all error paths.
- **43-theme palette** — `cockpitThemes.js` aliases the mock's `--gold` / `--ink` / `--paper` / `--line` tokens onto the family `--wp-*` tokens, so flipping `themeMode` on a FlexiPage retheme this LWC alongside `multiclassPredictionLwc`, `customerProfileWidget`, `businessProfileWidget`. Three cockpit-specific tokens layered per theme: `--wp-progress-good`, `--wp-progress-blue`, `--wp-rail-pending`.
- **JDO LWC lifecycle canon** — `_isConnected` re-entry guard, `_animationPending` + `requestAnimationFrame` in `renderedCallback`, `_lastAppliedThemeKey` cache, 8-char hex alpha-strip for accent-derived chrome.
- **Apex test class** — 14 tests covering managed-binding goals/journey, opportunity branch (filtering, KPI math), error paths, fixture-driven KPI helpers.
- **Jest test suite** — 18 tests using `createApexTestWireAdapter` from `@salesforce/wire-service-jest-util` for proper `@wire` provisioning; record-type branching, card decoration, KPI translation, theme switcher, wire param pass-through, error rendering.
- **Design mock** — `design/fsc-cockpit.html` is the approved visual source of truth.
