# AGENTS.md — DC_BusinessProfileWidget

Context for AI coding agents working on the **Business Profile Widget** Lightning card. This is one of the largest LWCs in the JDO monorepo and the **origin of the `--wp-*` theme token system** that the prediction-model siblings adopted.

# Product context

A record-page LWC for **Account** that renders a comprehensive business profile: company header (name + photo + KPI tiles), tabbed body (Overview / Health / Credit / Structure / Pipeline / Insights), Agentforce-generated narrative summary, and an optional Unified Relationships table. Drives most demos involving the FSI account-360 flow.

Sibling project `DC_PersonProfileWidget` covers the **person/contact** side using the same theme system but a different field set. Both intentionally diverge in cardinality and meta-xml shape from the prediction-model siblings (`DC_Prediction_Model_LWC`, `DC_Multiclass_Prediction_LWC`) — they share the `--wp-*` theme tokens but not the `predictionThemes.js` extraction pattern (see Conventions / CSS below).

# Tech stack

- **Apex** — `with sharing` controller; `Flow.Interview` for prompt execution; `ConnectApi.EinsteinLLM.generateMessagesForPromptTemplate` for the AI summary; an isolated `private without sharing class EinsteinOverviewConnectBridge` (deliberately) for one specific Connect invocation
- **LWC** — single bundle `businessProfileWidget` with one helper module `profileInsightRows.js`. Inline `THEMES` map (~42 entries; intentionally inline rather than extracted, see CSS conventions)
- **`NavigationMixin`** for record-page navigation
- **Salesforce DX** — `sourceApiVersion: 62.0`, `sf` CLI v2 (NOT `sfdx`)
- **Tooling** — Jest via `sfdx-lwc-jest`, Prettier with the XML plugin, `prettier-plugin-apex`

# Project structure

```
DC_BusinessProfileWidget/
├── force-app/main/default/
│   ├── classes/
│   │   ├── BusinessProfileWidgetController.cls       ← 2,692-line controller
│   │   └── BusinessProfileWidgetControllerTest.cls   ← 13 tests
│   └── lwc/businessProfileWidget/
│       ├── businessProfileWidget.js                  ← 3,448-line main bundle (THEMES inline at top)
│       ├── businessProfileWidget.html                ← 682-line template
│       ├── businessProfileWidget.css                 ← 1,831-line CSS (--wp-* tokens defined here)
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

The 42-vs-43 cardinality difference vs the prediction siblings is intentional: the predictions have an extra `default` theme (a light card baseline for backwards-compat with their pre-revamp behavior). This project starts from `obsidian` as its baseline (see `applyTheme` line 2086: `mode || 'obsidian'`).

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
- **`Decimal.valueOf(Double)` produces binary-float artifacts.** `Decimal.valueOf(0.7)` becomes `0.6999...`. Always route Doubles through `Decimal.valueOf(String.valueOf((Double) o))`. The `decVal` helper at line ~1607 is the canonical numeric-coercion entry point — keep it correct.
- **`AuraHandledException` requires both the constructor argument AND `setMessage()`** to surface a custom message to the LWC layer. Without `setMessage()` the JS toast falls back to a generic "Script-thrown exception" string. Use the `buildAuraException(safeMsg)` private static helper at the bottom of the controller — same pattern as the four sibling `DC_*_LWC` controllers.
- Catch by exception subclass where the message is known to be safe. Log full detail via `System.debug(LoggingLevel.ERROR, ...)` before sanitizing for the user.
- **`@TestVisible private static`** on helpers is currently **NOT used** in this controller — every test goes through the public surface. This is a known gap; when adding a new helper, prefer `@TestVisible private static` and write a direct unit test, especially for any numeric-coercion or field-mapping logic.

## LWC
- **LWC1503 — Boolean `@api` defaults must be `false`.** Compiler rejects `@api foo = true;`. The codebase uses two workarounds: invert to a `hideX` toggle, or leave the JS field undeclared and set `default="true"` in `js-meta.xml`, reading via `this.foo !== false`.
- **Three `targetConfig` blocks must stay in sync — but only for properties that apply to all three target types.** See "meta-xml asymmetry" above for the full rule.
- **`setTimeout` outside `connectedCallback` is acceptable** when wired to user-action paths (e.g., `handleTabClick` → `setTimeout(() => animateBars())`). The lint rule `@lwc/lwc/no-async-operation` will still flag it; prefer `requestAnimationFrame` + an `_animationPending` flag consumed in `renderedCallback` once a refactor lands.
- **`@api` setter for `recordId` must guard against re-entry.** The setter currently calls `loadProfile()` whenever the value flips truthy, AND `connectedCallback` calls it conditionally. Follow the four `DC_*_LWC` siblings' pattern: identity check + `_isConnected` flag set in `connectedCallback`, `disconnectedCallback` flips it back.
- Reactivity uses plain class fields (no `@track`); reassignment triggers re-render. Modern LWC reactivity is automatic — do NOT add `@track` even though one historical use exists in this file.
- **Theme apply lifecycle**: `connectedCallback` triple-applies (synchronously + RAF + nested RAF) to defend against flexipage paint races. `renderedCallback` reschedules via `scheduleApplyTheme()`. Both rely on the assumption that re-applies are cheap; in practice they touch ~10-15 CSS custom properties per pass. Future improvement: add a `_lastAppliedThemeKey` cache derived from inputs (mode + accent + warning + negative + positive + text overrides + scale + lighten + targets.length) so duplicate applies become true no-ops.
- **8-char `#RRGGBBAA` accent** is silently dropped from the derived `--wp-accent-bg/border/dim` tokens — the `applyTheme` accent-derivation only fires when length is 7. Strip alpha first via `accent.slice(0, 7)` if length is 9.

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

13 Apex test methods covering happy paths through `getProfileData` (legacy-SOQL path, explicit-Account-field path, blank-mappings path, contact-fallback). The internal coercion / field-mapping helpers are NOT directly unit-tested today (no `@TestVisible` seam) — coverage is end-to-end through the public surface.

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
- **Adding `@track`** to a new field — modern LWC reactivity is automatic on plain class fields. The one remaining `@track` in this file is a historical leftover.
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
