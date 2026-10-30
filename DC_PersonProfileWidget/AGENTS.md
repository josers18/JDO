# AGENTS.md — DC_PersonProfileWidget

Context for AI coding agents working on the **Person Profile Widget** Lightning card. This is one of the largest LWCs in the JDO monorepo and (alongside `DC_BusinessProfileWidget`) one of **the two origin projects of the `--wp-*` theme token system** that the prediction-model siblings later adopted.

# Naming caveat

**The bundle is named `customerProfileWidget` (NOT `personProfileWidget`).** Project folder is `DC_PersonProfileWidget`; the LWC bundle inside is `customerProfileWidget`. This naming divergence is historical — agents searching by folder name won't find the bundle. Same divergence exists in the controller (`CustomerProfileWidgetController.cls`).

# Product context

A record-page LWC for **Person Account / Contact** that renders a comprehensive person profile: name + photo header, KPI tiles, tabbed body (Overview / Health / Financial / Structure / Location / Insight / Signals), Agentforce-generated narrative summary, three optional signal-gauge Flows (drives the cross-sell / churn / LTV style gauges), and an optional Unified Relationships table. Drives most demos involving the FSI customer-360 flow on the person side.

Sibling project `DC_BusinessProfileWidget` covers the **business/account** side using the same theme system but a different field set. Both are **theme-system co-origins** — they share the `--wp-*` token contract and the inline 42-theme `THEMES` map; the prediction-model siblings (`DC_Prediction_Model_LWC`, `DC_Multiclass_Prediction_LWC`) copied from these two later (and chose to extract the map to a separate `predictionThemes.js` module). See "Theme system" below.

# Tech stack

- **Apex** — `with sharing` controller; Flow runner via `Flow.Interview` for assembly + signal-gauge Flows; `ConnectApi.EinsteinLLM.generateMessagesForPromptTemplate` for the AI summary; isolated `private without sharing class EinsteinOverviewConnectBridge` (deliberately; grep the class name — line numbers drift) for one specific Connect invocation
- **LWC** — single bundle `customerProfileWidget` with one helper module `profileInsightRows.js`. Inline `THEMES` map (42 entries; intentionally inline rather than extracted, see CSS conventions)
- **`NavigationMixin`** for record-page navigation
- **Salesforce DX** — `sourceApiVersion: 66.0`, `sf` CLI v2 (NOT `sfdx`)
- **Tooling** — Jest via `sfdx-lwc-jest`, Prettier with the XML plugin, `prettier-plugin-apex`

# Project structure

```
DC_PersonProfileWidget/
├── force-app/main/default/
│   ├── classes/
│   │   ├── CustomerProfileWidgetController.cls       ← ~3,900-line controller
│   │   └── CustomerProfileWidgetControllerTest.cls   ← 28 tests incl. HttpCalloutMock + runAs FLS
│   ├── objects/Profile_Widget_Allowed_Action__mdt/   ← flow / invocable allowlist (CMDT)
│   ├── customMetadata/                               ← allowlist seed rows (5)
│   ├── cachePartitions/CustomerProfileWidget…        ← org cache for geocode results
│   └── lwc/customerProfileWidget/                    ← bundle name diverges from folder
│       ├── customerProfileWidget.js                  ← ~3,450-line main bundle (THEMES inline at top)
│       ├── customerProfileWidget.html                ← 877-line template
│       ├── customerProfileWidget.css                 ← 1,754-line CSS (consumes --wp-* tokens)
│       ├── customerProfileWidget.js-meta.xml         ← THREE targetConfig blocks; 148 RecordPage / 108 AppPage / 108 HomePage
│       └── profileInsightRows.js                     ← buildProcessedRecommendationRows helper
├── docs/                                             ← INDEX.md is the entry point
├── README.md
└── sfdx-project.json
```

# Commands

```bash
# Deploy (single project, scoped — must run from the project root)
sf project deploy start --source-dir force-app/main/default --wait 10 --concise

# Validate-only deploy with tests
sf project deploy validate --source-dir force-app \
  --test-level RunSpecifiedTests \
  --tests CustomerProfileWidgetControllerTest --wait 30

# Run Apex tests against an org
sf apex run test --tests CustomerProfileWidgetControllerTest \
  --result-format human --code-coverage --wait 10

# Local LWC unit tests (Jest)
npm install
npm run test:unit
```

**IMPORTANT:** Use `sf` (CLI v2). The `sfdx` commands are deprecated and the JDO repo guardrail will flag them.

# Architecture

## Data contract

```
Person Account / Contact record page
   ├─ App Builder properties (148 on RecordPage):
   │     ├─ field mappings (fieldFullName, fieldEmail, fieldCity, ..., dozens of paths)
   │     ├─ Flow API names + variable mappings (assembly Flow, Agentforce Flow,
   │     │                                       up to 3 signal-gauge Flows)
   │     ├─ tab visibility toggles (showOverviewTab, showHealthTab, showFinancialTab,
   │     │                          showStructureTab, showLocationTab, showInsightTab,
   │     │                          showSignalsTab)
   │     ├─ Agentforce config (promptTemplateId, autoGenerateSummary, ...)
   │     └─ theme controls (themeMode, accentColor, accentColorSecondary, textScale,
   │                        textColorPrimaryOverride, textColorSecondaryOverride,
   │                        textColorTertiaryOverride, ...)
   │
   └─ recordId
        │
        ▼
LWC customerProfileWidget
   ├─ loadProfile() → CustomerProfileWidgetController.getProfileData(recordId, mappingsJson, ...)
   │     └─ resolves field paths via SOQL OR an admin-configured assembly Flow
   ├─ loadAgentforceOverviewEinsteinIfNeeded() → getAgentforceOverviewSummary
   ├─ loadUnifiedRelationshipsIfNeeded() → getUnifiedRelationshipsQueryJson
   ├─ refreshSignalGaugeFlows() → up to 3 parallel signal-gauge Flow executions
   └─ loadSummary() (optional) → generateSummary via Einstein Prompt Template
        │
        ▼
   profileInsightRows.buildProcessedRecommendationRows() processes any insight rows
        │
        ▼
   Render: header → KPI strip → tab body → Agentforce summary card → relationships table
```

## Theme system (`--wp-*` tokens)

This project (alongside `DC_BusinessProfileWidget`) **defines** the `--wp-*` token system used across the FSI demo widget family. Tokens cover shell background, panel background, surface, border, text colors (primary / secondary / tertiary), accent + secondary accent (with derived `--wp-accent-bg` / `--wp-accent-border` / `--wp-accent-dim` from `#XX14` / `#XX40` / `#XX99` alpha derivation), warning / negative / positive semantic colors, KPI background, track background.

The 42 named themes are inline at the top of `customerProfileWidget.js` (line 11). Each `--wp-*` key has a value per theme; switching themes via the App Builder `themeMode` property re-applies all tokens at once via `applyTheme()`.

The prediction-model siblings (`DC_Prediction_Model_LWC`, `DC_Multiclass_Prediction_LWC`) extracted their copy of this map to a separate `predictionThemes.js` module so their bundle files stay readable. **This project intentionally keeps `THEMES` inline** — it's a theme-system origin, the prediction siblings copied *from* here. Do NOT extract `THEMES` to a separate module without a product-level decision.

## Theme-parity contract with `DC_BusinessProfileWidget`

The 42 theme keys in this project's inline `THEMES` map are **byte-identical in cardinality** with the business widget's. Both have the same 42 named themes (`obsidian`, `midnight`, `dusk`, `slate`, ..., `union`). When this contract is healthy, both widgets render visually consistently when placed side-by-side on the same flexipage.

**If you change a `--wp-*` token here:**
1. Run `diff` against the business widget's `THEMES` map to confirm no drift.
2. Apply the same change there in the same commit (or document why the projects need to diverge).
3. Update both projects' AGENTS.md if the convention itself changed.

The 42-vs-43 cardinality difference vs the prediction siblings is intentional: the predictions have an extra `default` theme (a light card baseline for backwards-compat with their pre-revamp behavior). This project starts from `obsidian` as its baseline (the `applyTheme` mode-resolution falls back to `obsidian` when `themeMode` is unset).

## meta-xml asymmetry (RecordPage 148 vs AppPage/HomePage 108)

40 properties are present in RecordPage but missing from AppPage/HomePage. Categories (verified from the live meta-xml):
- ~20 theme-related (accent colors, background colors, text overrides, scale, header gradient)
- ~13 tab/section visibility toggles (`showOverviewTab`, `showSignalsTab`, ...)
- ~6 unified-relationships subsection (`unifiedRelationshipsFlowApiName`, ...)
- ~5 agentforce-summary subsection (`agentforceSummaryPromptTemplateId`, ...)

Smaller asymmetry than `DC_BusinessProfileWidget` (122 missing). Some of these are arguably record-context-dependent (tab visibility, unified-relationships, agentforce config) and correctly RecordPage-only; others (theme-related) might benefit from being on AppPage/HomePage too. **When adding a new `@api`**:
- Theme / branding / cosmetic property → all three blocks
- Field mapping / Flow integration / record-data-dependent property → RecordPage only

# Conventions

## Apex
- `with sharing` on the public controller. Never `without sharing` for `@AuraEnabled` code.
- The `private without sharing class EinsteinOverviewConnectBridge` (grep the name) is **deliberate** — same pattern as the business widget. Documented inline; isolates a Connect invocation that interacts oddly with sharing on the parent class. Don't unify it back into the main class.
- Public methods callable from LWC must be `@AuraEnabled`.
- All DTO fields must be `@AuraEnabled` (the controller mostly returns `String` via `JSON.serialize`, so this rarely bites).
- **Reserved keyword `in`** — Apex parses it as the SOQL IN operator. Never use it as a local variable name.
- **`Decimal.valueOf(Double)` produces binary-float artifacts.** `Decimal.valueOf(0.7)` becomes `0.6999...`. Always route Doubles through `Decimal.valueOf(String.valueOf((Double) o))`. The numeric coercion path in this controller is the canonical entry point for Flow-sourced numeric data — keep it correct.
- **`AuraHandledException` requires both the constructor argument AND `setMessage()`** to surface a custom message to the LWC layer. Without `setMessage()` the JS toast falls back to a generic "Script-thrown exception" string. Use the `buildAuraException(safeMsg)` private static helper at the bottom of the controller — same pattern as the four sibling `DC_*_LWC` controllers and `DC_BusinessProfileWidget`.
- Catch by exception subclass where the message is known to be safe (e.g., `ConnectApi.ConnectApiException` is Salesforce-curated and safe to surface verbatim). Log full detail via `System.debug(LoggingLevel.ERROR, ...)` before sanitizing for the user.
- **`@TestVisible private static`** seams exist for `decVal`, `validateAccountFieldPath`, `applyGeocodeIfNeeded`, `geocodeCacheKey`, `isActionAllowed` (+ the `allowedActionsOverride` test seam), and `buildFallbackFromSoql`. Continue the pattern when adding new helpers.
- **FLS on dynamic SOQL.** Field paths come from App Builder JSON (client-supplied). `validateAccountFieldPath` / `validateContactFieldPath` reject any hop the running user can't read, the profile row is queried with `Database.queryWithBinds(..., AccessLevel.USER_MODE)`, and reads go through `populatedValue()` (never `row.get` / `getSObject` on a field that may have been dropped from the SELECT — that throws `SObjectException`).
- **Action allowlist.** Flow and invocable-Apex API names also come from the client. `assertActionAllowed()` checks `Profile_Widget_Allowed_Action__mdt` before every `Flow.Interview.createInterview` / `Invocable.Action.createCustomAction`. **No rows = allow all** (back-compat); once any row exists, add a row for every flow/class a page uses or that card fails with an "allowlist" error.
- **Geocoding is bounded.** At most `MAX_GEOCODE_CALLOUTS` (3) callouts at 6 s each; a `CalloutException` aborts the rest. Hits (48 h) and misses (24 h) are cached in the `local.CustomerProfileWidget` org partition; a zero-capacity or missing partition silently means "no cache".
- **Don't surface non-Connect exception text** in `agentforceSummaryPromptHint` or the Einstein diagnostic — only `ConnectApi.ConnectApiException` messages; everything else is logged and replaced with a generic hint.

## LWC
- **LWC1503 — Boolean `@api` defaults must be `false`.** Compiler rejects `@api foo = true;`. The codebase uses two workarounds: invert to a `hideX` toggle, or leave the JS field undeclared and set `default="true"` in `js-meta.xml`, reading via `this.foo !== false`.
- **Three `targetConfig` blocks**: see "meta-xml asymmetry" above for the rule.
- **`setTimeout` in user-action paths** (loadProfile + handleTabClick) was wrapped in `eslint-disable @lwc/lwc/no-async-operation` historically — replaced with the `_animationPending` flag + `requestAnimationFrame` in `renderedCallback` pattern (commit landing this AGENTS.md, mirroring `DC_BusinessProfileWidget` commit `bf87df7`). Don't reintroduce `setTimeout` for animation timing — let the LWC re-render lifecycle drive it.
- **`@api` setter for `recordId` must guard against re-entry.** Identity check + `_isConnected` flag set in `connectedCallback`, `disconnectedCallback` flips it back. See the four `DC_*_LWC` siblings + `DC_BusinessProfileWidget` for the canonical pattern.
- Reactivity uses plain class fields (no `@track`). This file already follows the modern pattern — keep it that way.
- **Theme apply lifecycle**: `connectedCallback` triple-applies (sync + RAF + nested RAF) to defend against flexipage paint races. `renderedCallback` reschedules via `scheduleApplyTheme()`. The `_lastAppliedThemeKey` cache makes the duplicate applies into true no-ops.
- **8-char `#RRGGBBAA` accent**: the alpha is stripped before deriving `--wp-accent-bg/border/dim`. Both 6-char and 8-char hex are accepted.
- **`_lastAppliedThemeKey` must include every `@api` input `applyTheme()` reads** (incl. `fieldKeyColor`, `aiSummaryTextColor`) — a missing input means App Builder edits to it don't repaint.
- **Async loads are sequence-guarded.** `loadProfile()` bumps `_loadSeq`; every follow-on load (Agentforce summary, unified relationships, gauges, AI summary) takes the `seq` and bails via `isCurrentLoad(seq)` after each `await`. The profile renders as soon as `getProfileData` returns — the follow-ons fill in afterwards and must never re-gate the spinner.
- **RAFs go through `queueFrame()`** so `disconnectedCallback` can cancel them.

## CSS
- This project (alongside `DC_BusinessProfileWidget`) **defines** the `--wp-*` token system. The CSS file (`customerProfileWidget.css`) consumes the tokens; the inline `THEMES` map in the JS is the canonical reference for what values each theme assigns.
- **If you rename or remove a `--wp-*` token here, audit `DC_BusinessProfileWidget`, `DC_Prediction_Model_LWC`, and `DC_Multiclass_Prediction_LWC`** for breakage.
- Component-private tokens that don't belong in the family-wide `--wp-*` namespace use `--lwc-cp-*` (or per-section subnamespaces).
- Do NOT use SLDS internal token names (e.g. `--lwc-brandPrimary`) — the LWC compiler rejects them.

## Documentation
- README is the entry point; `docs/INDEX.md` is the table of contents.
- `docs/COMPONENT_REFERENCE.md` documents every App Builder property — keep it in sync when adding properties.
- `../docs/THEME_CATALOG.md` (at the monorepo root) catalogs all 42 themes visually.

# Testing

```bash
# Apex (org-side)
sf apex run test --tests CustomerProfileWidgetControllerTest \
  --result-format human --code-coverage --wait 10

# LWC Jest (no harness for customerProfileWidget currently — manual smoke tests on a record page)
npm run test:unit
```

28 Apex test methods covering happy paths through `getProfileData` (legacy SOQL, explicit Account-field path, contact fallback, assembly-flow path, last-used-channel coerce), `generateSummary` guards, signal-gauge flow guards, the `getByPath` list-index parser, `buildFallbackFromSoql` invalid-id paths, `decVal` Double round-trip (`0.7`), geocoding via `HttpCalloutMock` (hit / timeout abort / callout budget), FLS via `System.runAs` a Minimum Access user, and the action allowlist. Prefer `@TestVisible private static` + a focused test for new helpers. CMDT fields aren't writable in Apex — build allowlist rows with `JSON.deserialize` (and don't name a variable `json`: Apex is case-insensitive, so it shadows `JSON`).

For numeric coercion specifically, the canonical reference test is `MulticlassPredictionLwcControllerTest.coerceToDecimal_handlesDoubleWithoutBinaryNoise` — it asserts `0.7` survives the round-trip without binary-float drift.

# Common mistakes

- **Searching for the bundle by folder name.** The folder is `DC_PersonProfileWidget`; the bundle is `customerProfileWidget`. Search by bundle name when you need to find the LWC artifacts.
- **Adding `@api` properties to RecordPage AND back-filling them to AppPage/HomePage** when they require record context — clutter App Builder for those targets. See "meta-xml asymmetry" above for the rule.
- **`Decimal.valueOf(Double)`** in the numeric coercion path — produces binary-float noise. Route through `String.valueOf`.
- **`AuraHandledException` without `setMessage()`** — toast falls back to "Script-thrown exception". Use the `buildAuraException(msg)` helper.
- **`recordId` setter without `_isConnected` gate** — causes double `loadProfile()` invocation on first mount and on every parent re-render. See the prediction-model siblings' fix as the reference pattern.
- **`Decimal in = ...;`** — Apex compile error; rename to `inVal`/`input`.
- **Boolean `@api foo = true;`** — fails with LWC1503.
- **Renaming a `--wp-*` token here without auditing the business widget AND the two prediction siblings** — breaks theme parity across the family.
- **Drifting the `THEMES` map between this project and `DC_BusinessProfileWidget`.** They must keep the same 42 keys with semantically-equivalent values. Run `diff` between the two `THEMES` maps when in doubt.
- **Extracting `THEMES` to a separate module** — current convention is inline (matching the business widget). The prediction siblings extracted later for their own readability; mirroring that decision here would require a coordinated change with the business widget.
- **Modifying the `private without sharing class EinsteinOverviewConnectBridge`** without re-reading its inline comment — the asymmetric sharing context is intentional.
- **`setTimeout` for animation timing** — replaced with `_animationPending` + `requestAnimationFrame` in `renderedCallback`. Don't reintroduce.
- **`Database.query` on client-supplied paths** — runs in system mode and leaks fields the user can't see. Use the USER_MODE + `accessibleSelectPaths` + `populatedValue` trio.
- **Adding a flow/invocable to a page without an allowlist row** — once `Profile_Widget_Allowed_Action__mdt` has any rows, unlisted actions are rejected.
- **Awaiting follow-on loads inside `loadProfile()` before clearing `loading`** — blanks every tab behind the spinner until the slowest Einstein call returns.

# Related docs

- @docs/INDEX.md — full table of contents
- @docs/ARCHITECTURE.md — sequence + data flow diagrams
- @docs/COMPONENT_REFERENCE.md — every App Builder property, with defaults
- @docs/APEX_REFERENCE.md — Apex method signatures
- @docs/FLOW_GUIDE.md — Assembly Flow + Agentforce Flow + Signal-Gauge Flow contracts
- @docs/PROMPT_TEMPLATE.md — Einstein prompt template JSON shape
- @docs/HOW_TO.md — common recipes
- @docs/SETUP.md — admin install path
- @docs/TROUBLESHOOTING.md — common issues + fixes
- @docs/DEPLOY.md — deploy commands and tests
- @docs/GIT.md — clone path
- @../docs/THEME_CATALOG.md — visual catalog of all 42 themes (monorepo-level)
- @../DC_BusinessProfileWidget/AGENTS.md — sibling theme-system co-origin; the cross-sibling parity contract for `THEMES` and `--wp-*` tokens lives here too
- @../DC_AgentForce_Output_LWC/AGENTS.md — sibling project; reference for `buildAuraException` helper pattern
- @../DC_Prediction_Model_LWC/AGENTS.md — sibling project that adopted the `--wp-*` system from this project (and the business widget)
