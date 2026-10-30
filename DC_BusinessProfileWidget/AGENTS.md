# AGENTS.md — DC_BusinessProfileWidget

Context for AI coding agents working on the **Business Profile Widget** Lightning card. This is one of the largest LWCs in the JDO monorepo and the **origin of the `--wp-*` theme token system** that the prediction-model siblings adopted.

# Product context

A record-page LWC for **Account** that renders a comprehensive business profile: company header (name + photo + KPI tiles), tabbed body (Overview / Health / Credit / Structure / Pipeline / Insights), Agentforce-generated narrative summary, and an optional Unified Relationships table. Drives most demos involving the FSI account-360 flow.

Sibling project `DC_PersonProfileWidget` covers the **person/contact** side using the same theme system but a different field set. Both intentionally diverge in cardinality and meta-xml shape from the prediction-model siblings (`DC_Prediction_Model_LWC`, `DC_Multiclass_Prediction_LWC`) — they share the `--wp-*` theme tokens but not the `predictionThemes.js` extraction pattern (see Conventions / CSS below).

# Tech stack

- **Apex** — `with sharing` controller; `Flow.Interview` for prompt execution; `ConnectApi.EinsteinLLM.generateMessagesForPromptTemplate` for the AI summary; an isolated `private without sharing class EinsteinOverviewConnectBridge` (deliberately) for one specific Connect invocation
- **LWC** — single bundle `businessProfileWidget` with one helper module `profileInsightRows.js`. Inline `THEMES` map (~42 entries; intentionally inline rather than extracted, see CSS conventions)
- **`NavigationMixin`** for record-page navigation
- **Salesforce DX** — `sourceApiVersion: 66.0`, `sf` CLI v2 (NOT `sfdx`)
- **Tooling** — Jest via `sfdx-lwc-jest`, Prettier with the XML plugin, `prettier-plugin-apex`

# Project structure

```
DC_BusinessProfileWidget/
├── force-app/main/default/
│   ├── classes/
│   │   ├── BusinessProfileWidgetController.cls       ← ~2,960-line controller
│   │   └── BusinessProfileWidgetControllerTest.cls   ← 22 tests
│   └── lwc/businessProfileWidget/
│       ├── businessProfileWidget.js                  ← ~3,620-line main bundle (THEMES inline at top)
│       ├── businessProfileWidget.html                ← ~670-line template
│       ├── businessProfileWidget.css                 ← ~1,860-line CSS (--wp-* tokens defined here)
│       ├── businessProfileWidget.js-meta.xml         ← THREE targetConfig blocks; 122 RecordPage / 13 AppPage / 13 HomePage (see meta-xml asymmetry below)
│       └── profileInsightRows.js                     ← buildProcessedRecommendationRows helper
├── docs/                                             ← INDEX.md is the entry point
├── README.md
└── sfdx-project.json
```

# Commands

```bash
# Deploy (single project, scoped)
sf project deploy start --source-dir force-app/main/default --wait 10 --concise

# Validate-only deploy with tests
sf project deploy validate --source-dir force-app \
  --test-level RunSpecifiedTests \
  --tests BusinessProfileWidgetControllerTest --wait 30

# Run Apex tests against an org
sf apex run test --tests BusinessProfileWidgetControllerTest \
  --result-format human --code-coverage --wait 10

# Local LWC unit tests (Jest)
npm install
npm run test:unit
```

**IMPORTANT:** Use `sf` (CLI v2). The `sfdx` commands are deprecated and the JDO repo guardrail will flag them.

# Architecture

## Data contract

```
Account record page
   ├─ App Builder properties (135 on RecordPage):
   │     ├─ field mappings (fieldCompanyName, fieldCity, ..., dozens of field paths)
   │     ├─ Flow API names + variable mappings (assembly Flow, Agentforce Flow)
   │     ├─ tab visibility toggles (showOverviewTab, showHealthTab, ...)
   │     ├─ Agentforce config (promptTemplateId, autoGenerateSummary, ...)
   │     └─ theme controls (themeMode, accentColor, textScale, ...)
   │
   └─ recordId
        │
        ▼
LWC businessProfileWidget
   ├─ loadProfile() → BusinessProfileWidgetController.getProfileData(recordId, fieldMappingsJson, ...)
   │     └─ resolves field paths via SOQL OR an admin-configured assembly Flow
   ├─ loadAgentforceOverviewEinsteinIfNeeded() → getAgentforceOverviewSummary
   ├─ loadUnifiedRelationshipsIfNeeded() → getUnifiedRelationshipsQueryJson
   └─ loadSummary() (optional) → generateSummary via Einstein Prompt Template
        │
        ▼
   profileInsightRows.buildProcessedRecommendationRows() processes any insight rows
        │
        ▼
   Render: header → KPI strip → tab body → Agentforce summary card → relationships table
```

## Theme system (`--wp-*` tokens)

This project **defines** the `--wp-*` token system used across the FSI demo widget family. Tokens cover shell background, panel background, surface, border, text colors (primary / secondary / tertiary), accent (with derived `--wp-accent-bg` / `--wp-accent-border` / `--wp-accent-dim` from a `#XX14` / `#XX40` / `#XX99` alpha derivation), warning / negative / positive semantic colors, KPI background, track background, contact background.

The 42 named themes are inline at the top of `businessProfileWidget.js`. Each `--wp-*` key has a value per theme; switching themes via App Builder property re-applies all tokens at once via `applyTheme()`.

The prediction-model siblings (`DC_Prediction_Model_LWC`, `DC_Multiclass_Prediction_LWC`) extracted their copy of this map to a separate `predictionThemes.js` module so their bundle files stay readable. **This project intentionally keeps `THEMES` inline** — it's the theme-system origin, the siblings copied *from* here, and the inline pattern lets contributors see the token contract without an extra file hop. Do NOT extract `THEMES` to a separate module without a product-level decision.

The 42-vs-43 cardinality difference vs the prediction siblings is intentional: the predictions have an extra `default` theme (a light card baseline for backwards-compat with their pre-revamp behavior). This project starts from `obsidian` as its baseline (see `applyTheme`: `this._themeMode || 'obsidian'`).

## meta-xml asymmetry (RecordPage 135 vs AppPage/HomePage 13)

**Intentional design.** RecordPage exposes 122 properties that AppPage / HomePage don't:
- Field mappings — irrelevant without a record context
- Flow integrations (assembly Flow, Agentforce Flow) — same reason
- Tab visibility toggles for the body sections — the AppPage / HomePage configurations don't render those bodies
- Agentforce + summary config — only meaningful with record data

AppPage / HomePage expose only the 13 properties that work without record context: theme controls, photo URL, card title, text emphasis. **Do NOT "fix" this asymmetry** by back-filling the missing 122 properties — they would clutter App Builder for AppPage/HomePage admins with controls that have no effect.

The standard family-wide rule "every `@api` must appear in all three blocks" does NOT apply to this project. When adding a new `@api`:
- Theme / branding / cosmetic property → all three blocks
- Field mapping / Flow integration / record-data-dependent property → RecordPage only

# Conventions

## Apex
- `with sharing` on the public controller. Never `without sharing` for `@AuraEnabled` code.
- The one `private without sharing class EinsteinOverviewConnectBridge` at the bottom of the controller is **deliberate** — documented inline, isolates a Connect invocation that interacts oddly with sharing on the parent. Don't unify it back into the main class.
- Public methods callable from LWC must be `@AuraEnabled`.
- All DTO fields must be `@AuraEnabled` (the controller mostly returns `String` via `JSON.serialize`, so this rarely bites — but if you add a DTO class, every field needs the annotation).
- **Reserved keyword `in`** — Apex parses it as the SOQL IN operator. Never use it as a local variable name (`inVal`, `input`, `arg`).
- **`Decimal.valueOf(Double)` produces binary-float artifacts.** `Decimal.valueOf(0.7)` becomes `0.6999...`. Always route Doubles through `Decimal.valueOf(String.valueOf((Double) o))`. The `@TestVisible` `decVal` helper is the canonical numeric-coercion entry point — keep it correct.
- **`AuraHandledException` requires both the constructor argument AND `setMessage()`** to surface a custom message to the LWC layer. Without `setMessage()` the JS toast falls back to a generic "Script-thrown exception" string. Use the `buildAuraException(safeMsg)` private static helper at the bottom of the controller — same pattern as the four sibling `DC_*_LWC` controllers.
- Catch by exception subclass where the message is known to be safe. Log full detail via `System.debug(LoggingLevel.ERROR, ...)` before sanitizing for the user.
- **`@TestVisible private static`** seams exist for `decVal`, `validateAccountFieldPath`, `geocodeCacheKey`, `applyGeocodeIfNeeded`, `isActionAllowed` and `allowedActionsOverride`. When adding a helper, follow the same pattern and write a direct unit test.
- **FLS / USER_MODE.** Field paths arrive from App Builder (i.e. the client). `validateAccountFieldPath` rejects any hop the running user can't read, the profile row is fetched with `Database.queryWithBinds(..., AccessLevel.USER_MODE)`, and values are read through `populatedValue()` (never `acc.Field` / `getSObject`) so a dropped field reads as null instead of throwing. The Opportunity pipeline and Financial Account count queries are USER_MODE too.
- **Action allowlist.** `flowApiName`, `insightFlowApiName` and the unified-relationships invocable class are checked against `Profile_Widget_Allowed_Action__mdt` (shared with `DC_PersonProfileWidget`). An empty table allows everything (back-compat); once any row exists, every action the widget runs needs a row — add one when you configure a new Flow/Apex action on a page.
- **Geocoding** is cached in Platform Cache (`local.BusinessProfileWidget`, hits 48h / misses 24h), capped at `MAX_GEOCODE_CALLOUTS = 3` with a 6s timeout, and aborts on the first `CalloutException`. A missing or zero-capacity partition degrades to "no cache".

## LWC
- **LWC1503 — Boolean `@api` defaults must be `false`.** Compiler rejects `@api foo = true;`. The codebase uses two workarounds: invert to a `hideX` toggle, or leave the JS field undeclared and set `default="true"` in `js-meta.xml`, reading via `this.foo !== false`.
- **Three `targetConfig` blocks must stay in sync — but only for properties that apply to all three target types.** See "meta-xml asymmetry" above for the full rule.
- **No `setTimeout`.** Animation timing uses an `_animationPending` flag consumed in `renderedCallback`, which schedules via `queueFrame()` (tracked RAF ids, cancelled in `disconnectedCallback`). Don't call `requestAnimationFrame` directly.
- **Stale-response guard.** `loadProfile()` bumps `_loadSeq`; every async follow-on (`loadAgentforceOverviewEinsteinIfNeeded`, `loadUnifiedRelationshipsIfNeeded`, `loadSummary`) takes the seq and checks `isCurrentLoad(seq)` before writing state. The spinner clears as soon as `getProfileData` returns; the follow-ons fill in without blocking.
- **Tabs follow the WAI-ARIA tabs pattern** — `<button role="tab">` with roving `tabindex`, `handleTabKeydown` for Arrow/Home/End, and a `role="tabpanel"` body.
- **`@api` setter for `recordId` guards against re-entry** — identity check + `_isConnected` gate (set in `connectedCallback`, cleared in `disconnectedCallback`), same as the four `DC_*_LWC` siblings. Keep it when touching the setter.
- Reactivity uses plain class fields (no `@track`); reassignment triggers re-render. Do NOT add `@track`.
- **Theme apply lifecycle**: `connectedCallback` triple-applies (synchronously + RAF + nested RAF) to defend against flexipage paint races. `renderedCallback` reschedules via `scheduleApplyTheme()`. A `_lastAppliedThemeKey` derived from every input (mode, accent, semantic colors, text overrides, `aiSummaryTextColor`, scale, lighten, target count) makes duplicate applies no-ops — **add any new theme input to that key**, or changing it at runtime won't re-apply.
- **8-char `#RRGGBBAA` accent** — `applyTheme` strips the alpha (`slice(0, 7)`) before deriving `--wp-accent-bg/border/dim`; keep that when touching the derivation.

## CSS
- This project **defines** the `--wp-*` token system. The CSS file (`businessProfileWidget.css`) is the canonical reference for what tokens exist; the inline `THEMES` map in the JS is the canonical reference for what values each theme assigns.
- The siblings (`DC_PersonProfileWidget`, `DC_Prediction_Model_LWC`, `DC_Multiclass_Prediction_LWC`) consume the same token names. **If you rename or remove a `--wp-*` token here, audit all four siblings for breakage.**
- Component-private tokens that don't belong in the family-wide `--wp-*` namespace use `--lwc-bp-*` (or per-section subnamespaces).
- Do NOT use SLDS internal token names (e.g. `--lwc-brandPrimary`) — the LWC compiler rejects them.

## Documentation
- README is the entry point; `docs/INDEX.md` is the table of contents.
- `docs/COMPONENT_REFERENCE.md` documents every App Builder property — keep it in sync when adding properties.
- `docs/THEME_CATALOG.md` (at the monorepo root) catalogs all 42 themes visually.

# Testing

```bash
# Apex (org-side)
sf apex run test --tests BusinessProfileWidgetControllerTest \
  --result-format human --code-coverage --wait 10

# LWC Jest (no harness for businessProfileWidget currently — manual smoke tests on a record page)
npm run test:unit
```

22 Apex test methods: end-to-end `getProfileData` paths (legacy SOQL, explicit Account fields, blank mappings, structure tab, pipeline, malformed mappings, bad record Id, blocked flow), the unified-relationships guards, plus direct unit tests through `@TestVisible` seams — `decVal` 0.7 round-trip, `validateAccountFieldPath`, `geocodeCacheKey`, the allowlist, and `applyGeocodeIfNeeded` with an `HttpCalloutMock` (hit short-circuits; miss stops at the callout budget). `getProfileData` skips geocoding under `Test.isRunningTest()`, so geocode tests call `applyGeocodeIfNeeded` directly.

When adding a new helper:
- Mark `@TestVisible private static` so direct unit coverage is possible.
- Write a focused test rather than extending the end-to-end test (the latter quickly becomes hard to read and slow).
- For numeric coercion specifically, the canonical reference test is `MulticlassPredictionLwcControllerTest.coerceToDecimal_handlesDoubleWithoutBinaryNoise` — it asserts `0.7` survives the round-trip without binary-float drift.

# Common mistakes

- **Adding `@api` properties to RecordPage AND back-filling them to AppPage/HomePage** when they require record context — clutter App Builder for those targets. See "meta-xml asymmetry" above for the rule.
- **`Decimal.valueOf(Double)`** in the numeric coercion path — produces binary-float noise. Route through `String.valueOf`.
- **`AuraHandledException` without `setMessage()`** — toast falls back to "Script-thrown exception". Use the `buildAuraException(msg)` helper.
- **`recordId` setter without `_isConnected` gate** — causes double `loadProfile()` invocation on first mount and on every parent re-render. See the prediction-model siblings' fix as the reference pattern.
- **`Decimal in = ...;`** — Apex compile error; rename to `inVal`/`input`.
- **Boolean `@api foo = true;`** — fails with LWC1503.
- **Renaming a `--wp-*` token here without auditing the four siblings** — breaks theme parity across the family.
- **Extracting `THEMES` to a separate module** — current convention is inline, copying the prediction siblings' extraction would make this the *follower* of a system this project *defines*. Decision needs product sign-off, not a routine refactor.
- **Adding `@track`** to a new field — modern LWC reactivity is automatic on plain class fields.
- **Configuring a new Flow / invocable on a page without an allowlist row** — once `Profile_Widget_Allowed_Action__mdt` has any rows, unlisted actions are rejected with an "is not in the Profile Widget allowlist" error.
- **Reading Account fields directly (`acc.Industry`, `getSObject`)** on the profile row — fields the user can't read are never selected, so direct access throws. Use `populatedValue()` / `getFieldValueByPath()`.
- **Modifying the `private without sharing class EinsteinOverviewConnectBridge`** without re-reading its inline comment — the asymmetric sharing context is intentional.

# Related docs

- @docs/INDEX.md — full table of contents
- @docs/ARCHITECTURE.md — sequence + data flow diagrams
- @docs/COMPONENT_REFERENCE.md — every App Builder property, with defaults
- @docs/APEX_REFERENCE.md — Apex method signatures
- @docs/FLOW_GUIDE.md — Assembly Flow + Agentforce Flow contracts
- @docs/PROMPT_TEMPLATE.md — Einstein prompt template JSON shape
- @docs/HOW_TO.md — common recipes
- @docs/SETUP.md — admin install path
- @docs/TROUBLESHOOTING.md — common issues + fixes
- @docs/DEPLOY.md — deploy commands and tests
- @docs/GIT.md — clone path
- @../docs/THEME_CATALOG.md — visual catalog of all 42 themes (monorepo-level)
- @../DC_PersonProfileWidget/README.md — sibling project; shares the `--wp-*` token system on the person/contact side
- @../DC_AgentForce_Output_LWC/AGENTS.md — sibling project; reference for `buildAuraException` helper pattern
- @../DC_Prediction_Model_LWC/AGENTS.md — sibling project that adopted the `--wp-*` system from this project
