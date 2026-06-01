# AGENTS.md — DC_Goals_Cockpit_lwc

Context for AI coding agents working on the **FSC Journey Cockpit** Lightning card. Salesforce DX project shipping one LWC, one Apex controller (+ DTOs), test classes, design metadata, and a permission set. Replaces the stock FSC Life Events / Business Milestones + Financial Goals sections with one unified "cockpit": KPI strip + vertical journey rail + record-type-aware right panel.

# Product context

A record-page LWC for FSC accounts that shows three things in one card:

- 4 KPI tiles across the top (record-type-specific)
- a 300px **vertical** journey rail on the left (Life Events for Person Accounts, Business Milestones for Business Accounts) — every step is interactive: click → navigate, hover → details popover, grouped steps (`x2`/`x3`) → list every member event with its own link
- a card grid on the right that adapts:
  - **Person Account** → Financial **Goals** (with funded% rings, Priority/Status chip, target-date, ▾ action menu, click-through link)
  - **Business Account** → **Opportunities** (with probability rings, Stage chip, close date, action menu, link)

Plus per-section **+ New / + Goal / + Opportunity / + Event / + Milestone** buttons that route to the standard "Create" page for the right object per binding mode.

Designed to deploy alongside `DC_Multiclass_Prediction_LWC`, `DC_BusinessProfileWidget`, `DC_PersonProfileWidget`, and the rest of the JDO record-page LWC suite. Themes ride on the family `--wp-*` design tokens.

# Tech stack

- **Apex** — `with sharing` controller; one `@AuraEnabled(cacheable=true)` entry point; SOQL with `WITH USER_MODE` for FLS/CRUD enforcement
- **LWC** — `@api` properties bound from App Builder; `NavigationMixin` for record + create-page navigation; CSS aliases mock-style tokens (`--gold/--ink/--paper`) onto family `--wp-*` tokens; `requestAnimationFrame`-deferred theme application; popover state machine for hover preview AND action menu
- **Salesforce DX** — `sourceApiVersion: 66.0`, `sf` CLI v2 (NOT `sfdx`)
- **Tooling** — Jest via `sfdx-lwc-jest` with `@salesforce/wire-service-jest-util`; ESLint; Prettier with XML plugin

# Project structure

```
DC_Goals_Cockpit_lwc/
├── design/
│   └── fsc-cockpit.html                                    ← approved design mock; visual SoT
├── force-app/main/default/
│   ├── classes/
│   │   ├── FscJourneyCockpitController.cls                 ← single getCockpit entry; computes KPIs + groups journey
│   │   ├── FscJourneyCockpitController.cls-meta.xml
│   │   ├── FscJourneyCockpitControllerTest.cls             ← 19 tests; covers binding modes, KPI math, error paths
│   │   └── FscJourneyCockpitControllerTest.cls-meta.xml
│   ├── lwc/fscJourneyCockpit/
│   │   ├── fscJourneyCockpit.js                            ← @api surface, wire, theme, popover, navigation
│   │   ├── fscJourneyCockpit.html                          ← shell + KPIs + rail + adaptive panel + popover
│   │   ├── fscJourneyCockpit.css                           ← mock tokens aliased to --wp-* family
│   │   ├── fscJourneyCockpit.js-meta.xml                   ← FlexiPage design properties (8 attributes)
│   │   ├── cockpitThemes.js                                ← inlined 43-theme palette + cockpit-specific token derive
│   │   └── __tests__/
│   │       └── fscJourneyCockpit.test.js                   ← 30 jest tests; uses createApexTestWireAdapter
│   └── permissionsets/
│       └── DC_Goals_Cockpit_User.permissionset-meta.xml    ← Apex + 8 source-object Reads (both binding modes)
├── jest.config.js
├── package.json                                            ← @salesforce/sfdx-lwc-jest + eslint + prettier
├── sfdx-project.json                                       ← single packageDirectory `force-app`
├── README.md
├── AGENTS.md                                               ← this file
├── CHANGELOG.md                                            ← Keep-a-Changelog format
└── artifacts.md                                            ← Deployable artifact inventory
```

# Commands

```bash
# Deploy (single project, scoped to the default org)
sf project deploy start --source-dir force-app/main/default --wait 10 --concise

# Deploy with Apex tests
sf project deploy start --source-dir force-app \
  --test-level RunSpecifiedTests \
  --tests FscJourneyCockpitControllerTest --wait 30

# Run Apex tests against an org
sf apex run test --tests FscJourneyCockpitControllerTest \
  --result-format human --code-coverage --wait 10

# Local LWC unit tests (Jest) — 30 tests, ~0.8s
npm install
npm test
npm run test:unit:watch        # iterate
npm run test:unit:coverage     # coverage report

# Format / lint
npm run prettier
npm run lint

# Permission set assignment
sf org assign permset --target-org <alias> --name DC_Goals_Cockpit_User
sf org assign permset --target-org <alias> --name DC_Goals_Cockpit_User --on-behalf-of <username>
```

**IMPORTANT:** Use `sf` (CLI v2), not `sfdx`. The `sfdx` commands are deprecated.

# Architecture

## Data contract

```
LWC reads @api recordId, goalBinding, lifeEventBinding (admin-set in App Builder)
        │
        ▼
@wire getCockpit(recordId, goalBinding, lifeEventBinding)
        │
        ▼ FscJourneyCockpitController.getCockpit  (cacheable=true, single round-trip)
        │   ├─ loadAccount  — branches on IsPersonAccount
        │   ├─ loadGoalCards (managed | standard) / loadOpportunityCards
        │   ├─ loadPersonJourney (managed | standard) / loadBusinessJourney
        │   └─ computeGoalKpis / computeOpportunityKpis
        │
        ▼
CockpitView { recordType, journeyLabel, journey[], kpis[4], panelTitle, cards[] }
        │
        │  Each PanelCard / JourneyItem carries:
        │    recordId, recordUrl  ← server-minted /lightning/r/{obj}/{id}/view
        │    name | label, description, icon, chip*, ring*, member-list (for groups)
        ▼
LWC renders KPI strip + 300px rail + goal/opp card grid
        │
        │  Interactive surface:
        │    click title → NavigationMixin.Navigate (cmd+click → new tab)
        │    hover step/card → popover (180ms enter, 200ms leave delay)
        │    grouped step → popover lists every member with its own link
        │    ▾ menu → View / Edit / Clone / Delete (Esc closes; click-outside closes)
        │    + New header buttons → standard__objectPage create
        ▼
Real navigation
```

`CockpitView` shape is the wire contract. Component is a dumb renderer; all KPI math, priority-chip mapping, journey completion logic, group rollups, and `recordUrl` minting happens in Apex.

## Binding toggles (FSC schema variance)

In FSC orgs both managed-package and standard objects exist with non-overlapping data. Two FlexiPage design attributes let admins pick:

| Logical | `goalBinding=standard` (default ⭐) | `goalBinding=managed` |
|---|---|---|
| Object | `FinancialGoal` | `FinServ__FinancialGoal__c` |
| Account link | **`FinancialGoalParty` junction** (`SELECT FinancialGoalId FROM FinancialGoalParty WHERE AccountId = :rid`) | `FinServ__PrimaryOwner__c` OR `FinServ__Household__c = :recordId` |
| `actualAmount` | `ActualAmount` | `FinServ__ActualValue__c` |
| `targetAmount` | `TargetAmount` | `FinServ__TargetValue__c` |
| `targetDate` | `TargetDate` | `FinServ__TargetDate__c` |
| `priority` chip | native `Priority` (HIGH/MEDIUM/LOW → mapped to High/Medium/Low for chip CSS) | derived from `FinServ__Status__c` (Not Started→neutral, In Progress→Medium, Completed→green) |
| Matches FSC native widget | ✅ | ❌ |

| Logical | `lifeEventBinding=standard` (default ⭐) | `lifeEventBinding=managed` |
|---|---|---|
| Object | `PersonLifeEvent` | `FinServ__LifeEvent__c` |
| Account link | `WHERE PrimaryPerson.AccountId = :rid` | `WHERE FinServ__Client__c = :rid` |
| `eventDate` | `EventDate` (DateTime, controller `.date()`s it) | `FinServ__EventDate__c` (Date) |
| `eventType` | `EventType` | `FinServ__EventType__c` |
| Volume in jdo-uqj0jr | 25,287 PersonLifeEvent rows | 25,175 FinServ__LifeEvent__c rows |

Business Account journey always uses `BusinessMilestone` — no managed equivalent exists.
Opportunity panel always uses standard `Opportunity` — no FSC variant exists.

**Switching `lifeEventBinding`** can surface dual-write divergence: `PersonLifeEvent` and `FinServ__LifeEvent__c` were brought to parity once via the `mirror-life-events` CLI (Phase 3, ~25K rows each), but there's no trigger keeping them in sync. Events created on one stack post-backfill won't appear on the other.

## Why FinancialGoalParty (not FinancialPlan)?

Earliest design assumed standard `FinancialGoal` joined to Account via `FinancialPlan.AccountId`. That's wrong: in `jdo-uqj0jr`, ~92% of `FinancialGoal` rows have null `FinancialPlanId`. The **FSC native FinancialGoals component reads via `FinancialGoalParty`** — the junction that ties a participant Account to a goal regardless of plan membership. v1.1 corrected the Apex query and flipped the default binding to `standard` to match.

## Completion semantics for the journey rail

Neither `PersonLifeEvent` nor `BusinessMilestone` carries an `IsCompleted` field, so the controller derives it: `completed = (date != null AND date < TODAY)`. Past-dated → solid blue node. Null- or future-dated → greyed pending node.

## Group rollup with member retention

When multiple events share the same `(label, date)` (e.g. two `Job` events on `2024-03-10`), the rail shows one tile with an `x2` count badge. **Each `JourneyItem` carries a `members: List<JourneyMember>`** so the LWC hover popover can render every event in the group with its own click-through link. Single-event groups still get a 1-element `members` list — the LWC checks `members.length > 1` to decide between "summary" popover vs. "list" popover.

## Description line

Every rail step renders three lines: title (event type) → **description** (record `Name`) → date. The description is suppressed when it equals the label (e.g. record Name = "Job" same as EventType = "Job"). Tooltip on hover shows full text if truncated to 2 lines.

## Opportunity progress

The org has 94 active stages (`Prospecting`, `Qualification`, `Underwriting Review`, `Closing/Funding`, etc.) — a hand-rolled stage→% map breaks under stage churn. Controller drives the bar fill from `Opportunity.Probability` directly (auto-synced by Salesforce from each stage's configured probability). Chip shows `StageName` raw.

# Conventions

## Apex

- `with sharing` on the controller — required for LWC-callable code
- Every SOQL string uses `WITH USER_MODE` to enforce FLS/CRUD at the platform layer
- All public methods that LWC calls are `@AuraEnabled`. All DTO fields are `@AuraEnabled`
- Helpers needed by tests are `@TestVisible private static` (e.g. `loadGoalCards`, `loadOpportunityCards`, `loadPersonJourney`, `loadBusinessJourney`, `computeGoalKpis`, `computeOpportunityKpis`)
- **Reserved keyword `in`** — Apex parses `in` as the SOQL IN operator. Never use as a variable name
- `Decimal.valueOf((Double))` produces binary-float artifacts (`0.7 → 0.6999...`). For percent math, use `Decimal.divide(actual, target, 4, RoundingMode.HALF_UP) * 100` with explicit clamp at [0,100]. Never indirect through `Double`
- `Decimal.compareTo(Decimal)` is **not visible** in this org's Apex compiler at v66 — use direct `<` / `>` operators (Apex auto-coerces)
- Use `buildAuraException(safeMsg)` helper for all thrown errors. Pattern requires BOTH the constructor arg AND `setMessage()` — without `setMessage()` the LWC toast falls back to "Script-thrown exception". This is a JDO-wide pattern (see `MulticlassPredictionLwcController`, all `DC_*_LWC` controllers)

## LWC

- **LWC1503 — Boolean `@api` defaults must be `false`.** Compiler rejects `@api foo = true;`. If you want "show by default", invert to "hide" toggle
- `_isConnected` re-entry guard, `_animationPending` flag + `requestAnimationFrame` in `renderedCallback` for theme application — JDO family lifecycle canon (see DC_BusinessProfileWidget, DC_PersonProfileWidget, DC_Multiclass_Prediction_LWC for parallels). Don't reintroduce `setTimeout` for animation timing
- `_lastAppliedThemeKey` cache on `applyTheme()` — composite of mode + accent + warning + negative + target-count. Avoids spamming `style.setProperty` on every render cycle
- 8-char hex alpha-strip: when `accentColor` is `#RRGGBBAA`, slice to `#RRGGBB` then append `14` / `40` / `99` for `--wp-accent-bg/-border/-dim` derived chrome. CSS `color-mix()` would work too but the family pattern uses string concatenation; stay consistent
- Reactivity uses plain class fields (no `@track`); reassignment triggers re-render. Never mutate arrays/objects in place — replace them
- **NavigationMixin pattern**: `import { NavigationMixin } from 'lightning/navigation'`, extend `NavigationMixin(LightningElement)`, call `this[NavigationMixin.Navigate]({ type, attributes })`. The cockpit uses `standard__recordPage` (with `actionName: 'view' | 'edit' | 'clone'`) and `standard__objectPage` (with `actionName: 'new'`)
- **Cmd-click should NOT call NavigationMixin** — let the browser's native `<a href>` open the new tab. The cockpit's `handleRecordLinkClick` checks `event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1` and returns early without `preventDefault()`
- **Popover state machine**: a single `_popover` field handles both hover preview (`kind: 'hover'`) and action menu (`kind: 'menu'`). Hover popovers dismiss on mouseleave (200ms delay); menus dismiss on click-outside or Esc. Esc handler at window level (registered in `connectedCallback`, removed in `disconnectedCallback`) returns focus to the trigger element for a11y

## CSS

- **Token aliases**: this LWC uses BOTH the mock's token names (`--gold`, `--ink`, `--paper`, `--line`) AND the family `--wp-*` tokens. The mock names are aliased to `--wp-*` on `:host` (`--gold: var(--wp-accent)` etc.) so CSS reads like the design mock while resolution flows through the family theme system
- All theme palette values live in `cockpitThemes.js` — the 43-theme `BASE_THEMES` dict is inlined (NOT imported) so this LWC deploys standalone. `deriveCockpitTokens()` layers three cockpit-specific tokens per theme: `--wp-progress-good` (filled-goal green), `--wp-progress-blue` (opp probability blue), `--wp-rail-pending` (greyed step circle)
- **Palette parity**: keep `BASE_THEMES` identical to `DC_Multiclass_Prediction_LWC/.../predictionThemes.js` and `DC_Prediction_Model_LWC/.../predictionThemes.js`. If you tune a token in one, tune it in all three. The shared `--wp-*` vocabulary is what lets `themeMode` stay coherent across record-page LWCs
- Don't introduce literal hex anywhere. Either pick a token or extend `cockpitThemes.js`
- **Inverse icons on dark backgrounds**: SLDS `lightning-icon` color via `--sds-c-icon-color-foreground-default` is unreliable across runtime configs. Use the `variant="inverse"` attribute when you need white icons on a colored background (e.g. completed rail nodes on blue circles)
- **SVG ring color**: the SVG `<circle stroke="currentColor">` resolves against the parent's CSS `color`. Always set `color` on the `.ring` container (not just the inner `.pc` text label)

## Jest

- Use `createApexTestWireAdapter` (from `@salesforce/wire-service-jest-util`) — NOT plain `jest.fn()`. The component uses `@wire`; only the adapter's `.emit(data)` and `.error(body, status, statusText)` actually drive the wire. Plain `mockResolvedValue` is silent — every test will fail with "data is null"
- `jest.mock(...)` factories are hoisted before imports, so reference helpers via inline `require(...)` inside the factory closure (or use `mock`-prefixed variable names per Jest's rule). See test file header
- **NavigationMixin mock**: real module exports `NavigationMixin` as a function with a static `.Navigate` Symbol property. The cockpit's test mock builds a fresh Symbol, attaches it to the mixin function, AND uses it in the inner class — both must reference the same Symbol or the component's `this[NavigationMixin.Navigate]` is undefined. See `__tests__/fscJourneyCockpit.test.js` for the canonical recipe
- Wait for `@wire` provisioning with `await new Promise((r) => setTimeout(r, 0))` (single macrotask) before querying shadow DOM
- When renaming an `@AuraEnabled` method, update BOTH the import path AND the `jest.mock(...)` path in lockstep — silent failure otherwise (this bit Web_Engagements_RT_Timeline once)

# Testing

```bash
# Apex (org-side) — 19 tests, runs ~5s
sf apex run test --tests FscJourneyCockpitControllerTest \
  --result-format human --code-coverage --wait 10

# LWC Jest (local) — 30 tests, runs ~0.8s
npm test
```

Coverage targets: ≥85% for the Apex controller. Currently **83%** (12 lines short — `goalIconFor` keyword branches that aren't exercised by the test data factory). Acceptable for v1.1 ship; if a future change requires hitting 85%, add a single test with goal Names hitting each branch (`Wedding`, `College`, `Charit`, `Vacation`, `Retire`, `Estate`).

## Test patterns

- Apex fixture builders (`buildAccount`, `buildManagedGoal`, `buildOpp`) return UNSAVED records; tests insert in bulk lists. The project's regex linter has a `loop started line 0` false positive on sequential top-level inserts — ignore the warnings, they're not real loop bugs
- **Person-account-required tests** (`FinancialGoalParty.AccountId` is platform-restricted to person accounts): use `findExistingPersonAccountId()` helper which queries the org for any `IsPersonAccount = true` row. Returns null silently if zero person accounts exist (test then `return;`s) — works in any FSC org with at least one person account, dodges `RecordTypeInfo.isPersonType()` quirks at insert
- Jest harness uses single `buildElement(props)` + `flush()` helper. `getCockpit.emit(view)` for happy path, `getCockpit.error(...)` for failure path

# Traps and gotchas (real-world deployment lessons)

- **Picklist label vs. API value mismatch**: Apex `describe()` returns `picklistValues[].label` but DML and SOQL traffic in `picklistValues[].value`. They can differ. Examples in this org:
  - `FinancialPlan.Status` → API values `NotStarted` / `InProgress` / `Completed` (PascalCase, no spaces)
  - `FinancialGoal.Status` → API values `NOT_STARTED` / `IN_PROGRESS` / `COMPLETED` (UPPER_SNAKE)
  - `FinancialGoal.Priority` → API values `HIGH` / `MEDIUM` / `LOW` (uppercase)
  - **Reliable discovery**: `SELECT FieldName, COUNT(Id) FROM Object GROUP BY FieldName` against live data exposes the real values
- **`PersonAccount` is NOT a valid FlexiPage `<targetConfig><objects>` value.** Use `Account` only. Person Accounts are surfaced via `IsPersonAccount=true` filtering inside the LWC
- **`BusinessMilestone` requires three fields at insert** (all `nillable=false`): `Name`, `MilestoneType`, `MilestoneDate`. The describe API doesn't always surface this clearly
- **`PermissionSet.description` has a hard 255-char cap**, enforced only at deploy time. Local validators happily accept longer strings. Test deploy-side
- **`sf data import bulk` requires CRLF line endings** when no `--line-ending` flag is passed (defaults to CRLF but doesn't translate). Python's `open(newline='\r\n')` is wrong (produces `\r\r\n`); use `open(newline='')` with literal `'\r\n'` writes, or pass `--line-ending CRLF`
- **`Decimal.compareTo`** is documented but **not visible** at runtime in some Apex compiler versions — use direct comparison operators
- **The `default="standard"` in FlexiPage meta only applies to NEW placements.** Existing FlexiPage instances keep their original value baked in. Flipping defaults doesn't retroactively migrate live admin configs

# Deploy notes

- Default deploy target is `jdo-uqj0jr` (set via `sf config set target-org`). Verify with `sf org display --target-org jdo-uqj0jr` before deploying
- The Apex controller queries managed-package objects (`FinServ__FinancialGoal__c`, `FinServ__LifeEvent__c`) via `WITH USER_MODE`. The target org must have the FSC managed package installed for those code paths
- FlexiPage placement: Setup → Lightning App Builder → open an Account record page → drag "FSC Journey Cockpit" component onto the canvas. Set `goalBinding` and `lifeEventBinding` to `standard` (the new default for new placements, but verify on existing FlexiPages)
- Permission: `cacheable=true` Apex methods enforce FLS via `WITH USER_MODE`. The `DC_Goals_Cockpit_User` permission set grants Read on all 8 source objects (Account, Opportunity, BusinessMilestone, Contact, FinancialGoal, FinancialGoalParty, FinServ__FinancialGoal__c, FinServ__LifeEvent__c, PersonLifeEvent) so admins can flip bindings without re-permissioning

# Related projects

- `DC_Multiclass_Prediction_LWC` — palette twin. Its `predictionThemes.js` and our `cockpitThemes.js` carry the same 43-theme `BASE_THEMES` dict; keep them in sync if you tune any token
- `DC_BusinessProfileWidget` / `DC_PersonProfileWidget` — same `--wp-*` token vocabulary; pair on a FlexiPage for a coherent record page
- `DC_AgentForce_Output_LWC` — same JDO LWC lifecycle conventions (`_isConnected`, RAF, `_lastAppliedThemeKey`)
