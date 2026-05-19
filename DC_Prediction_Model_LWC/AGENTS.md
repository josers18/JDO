# AGENTS.md — DC_Prediction_Model_LWC

Context for AI coding agents working on the **Prediction Model** Lightning card. Salesforce DX project shipping one LWC, one Apex controller (with a test class), and a permission set.

# Product context

A record-page (and AppPage / HomePage) LWC that visualizes a single ML score from an autolaunched Flow the customer owns. Two render modes, picked by `predictionOutputFormat`:

- **`percent`** (alias `classification`) → animated semicircle gauge (0–100, SVG arc with HSL-blended bad→good color).
- **`integer | decimal | currency`** (alias `regression`) → full-width "value hero" panel using `lightning-formatted-number`.

Below the hero/gauge: two ranked lists (drivers and recommendations) parsed from JSON returned by the Flow, each with a horizontal bar and signed delta (`+12.3%` / `-4.1%`). An optional Einstein Prompt Builder card renders a natural-language summary at the bottom.

Sibling project `DC_Multiclass_Prediction_LWC` covers the **multiclass** case (predicted-class hero + per-class probability chart). Both can deploy to the same org since their LWC and Apex API names are distinct.

# Tech stack

- **Apex** — `with sharing` controller; `Flow.Interview` for the prediction; `ConnectApi.EinsteinLLM.generateMessagesForPromptTemplate` for the AI summary.
- **LWC** — `@api` properties bound from App Builder; CSS custom properties (`--wp-*`) for theming; `container-type: inline-size` + `cqw` units for responsive scaling inside flexipage columns.
- **Salesforce DX** — `sourceApiVersion: 66.0`, `sf` CLI v2 for deploys (NOT `sfdx`).
- **Tooling** — Jest via `sfdx-lwc-jest`, ESLint (`@salesforce/eslint-config-lwc`), Prettier with the XML plugin and `prettier-plugin-apex`, Husky pre-commit.
- **Mermaid** in markdown for architecture diagrams under `docs/`.

# Project structure

```
DC_Prediction_Model_LWC/
├── force-app/main/default/
│   ├── classes/
│   │   ├── ClassificationModelLwcController.cls       ← runPredictionFlow + generateAnalysisSummary
│   │   └── ClassificationModelLwcControllerTest.cls
│   ├── lwc/classificationModelLwc/
│   │   ├── classificationModelLwc.js                  ← getters, gauge/bar animation, theme apply
│   │   ├── classificationModelLwc.html                ← gauge OR value-hero + factors + recs + summary
│   │   ├── classificationModelLwc.css                 ← --wp-* tokens, container queries; ~420 lines
│   │   ├── classificationModelLwc.js-meta.xml         ← THREE targetConfig blocks (RecordPage, AppPage, HomePage) — keep all in sync
│   │   └── predictionThemes.js                        ← 43 theme presets; mirror of multiclassPredictionLwc/predictionThemes.js
│   └── permissionsets/                                ← DC Prediction Model User
├── docs/                                              ← INDEX.md is the entry point
├── README.md
└── sfdx-project.json
```

# Commands

```bash
# Deploy (single project, scoped)
sf project deploy start --source-dir force-app/main/default --wait 10 --concise

# Validate-only deploy with tests (catches LWC1503 / Apex 'in' keyword issues offline reviewers miss)
sf project deploy validate --source-dir force-app \
  --test-level RunSpecifiedTests \
  --tests ClassificationModelLwcControllerTest --wait 30

# Run Apex tests against an org
sf apex run test --tests ClassificationModelLwcControllerTest \
  --result-format human --code-coverage --wait 10

# Local LWC unit tests (Jest)
npm install
npm run test:unit

# Format / lint
npm run prettier
npm run lint
```

**IMPORTANT:** Use `sf` (CLI v2). The `sfdx` commands are deprecated and the JDO repo guardrail will flag them.

# Architecture

## Data contract

```
Autolaunched Flow (user-owned)
   ├─ output: prediction          ← Decimal — number to display (gauge percent OR raw metric)
   ├─ output: factors             ← Text/Apex — JSON array of {fields:[{name, label?, inputValue, prescribedValue?}], value: Number}
   └─ output: recommendations     ← Text/Apex — JSON array of same shape; uses prescribedValue for "target" text
        │
        ▼
ClassificationModelLwcController.runPredictionFlow(flowApiName, recordId,
                                                   recordIdVar, predictionVar,
                                                   factorsVar, recommendationsVar)   ← 6 params
        │  case-tolerant variable lookup via resolveFlowOutput (tries exact → first-upper → all-lower)
        ▼
PredictionResult { prediction: Decimal, factorsJson: String, recommendationsJson: String }
        │
        ▼
classificationModelLwc renders:
   gauge OR value-hero  →  Top predictors list  →  Suggested improvements list  →  optional AI summary
```

`prediction` coercion: the controller accepts `Decimal | Integer | other` from `Flow.Interview.getVariableValue` and routes non-Decimals through `Decimal.valueOf(String.valueOf(pred))` to avoid binary-float artifacts.

## Key LWC getters (single sources of truth)

- `predictionFormatKey` — normalizes raw input format. Handles `classification → percent` and `regression → decimal` aliases; unrecognized values fall back to `percent`.
- `showPercentGauge` — drives the gauge-vs-hero branch in the template.
- `hasData` — gates the entire render. True if prediction number OR any factor OR any recommendation exists, AND not currently loading.
- `processedFactors` / `processedRecommendations` — sorted, color-coded rows with `barScale`, `formattedPercent`, `barStyle`, `deltaClass`. Both call `applyProcessedRowColors` which is the single place that decides "positive delta = risk or good?" via `*PositiveMeansGood` toggles.
- `gaugeArcSolidColor` — interpolates from `gaugeArcBadColor` to `gaugeArcGoodColor` (with `gaugeColorLow/High` as fallbacks) by score 0–100. Blending happens in **HSL via `lerpColorHex`** so endpoint pairs like orange-red → teal don't muddy through gray-brown at t=0.5. `gaugeGradientReverse` flips the t.

## AI summary path

`generateAnalysisSummary(promptTemplateId, promptInputApiName, prediction, factorsJson, recommendationsJson, predictionOutputFormat)` packs `{prediction, factors, recommendations, predictionOutputFormat}` into a single JSON string and submits as one `ConnectApi.WrappedValue` keyed by `promptInputApiName` (default `Input:Prediction_Context`). The prompt template must declare a single flex text input matching that API name; see `docs/PROMPT_TEMPLATE_GUIDE.md`.

# Conventions

## Apex
- `with sharing` on all controllers — never `without sharing` for LWC-callable code.
- Public methods callable from LWC must be `@AuraEnabled`.
- All DTO fields must be `@AuraEnabled` to deserialize on the JS side (see `PredictionResult`).
- **Reserved keyword `in`** — Apex parses `in` as the SOQL IN operator. Never use it as a local variable name (`inVal`, `input`, `arg`).
- `Decimal.valueOf(Double)` produces binary-float artifacts (e.g. `0.7` → `0.6999...`). Always route Doubles through `Decimal.valueOf(String.valueOf(d))`.
- `generateAnalysisSummary` re-throws as `AuraHandledException` with concatenated `e.getMessage()` — be cautious about leaking platform internals; sanitize before adding new catches.

## LWC
- **LWC1503 — Boolean `@api` defaults must be `false`.** Compiler rejects `@api foo = true;` because `<my-cmp foo>` (attribute presence) flips it to `true` anyway. The codebase works around this on `autoGenerateSummary` by leaving the JS field undeclared (no default) and setting `default="true"` in `js-meta.xml`, then reading via `this.autoGenerateSummary !== false` (line 632 of the JS). Mirror this pattern for any new "default-on" toggles.
- **All three targetConfig blocks must stay in sync.** RecordPage, AppPage, HomePage. Every new `@api` property MUST be added to all three, and to the `datasource` enum if applicable. RecordPage uses verbose `description="..."`; AppPage/HomePage use the terse form. Match this pattern.
- `@api` properties currently number ~39 — keep an eye on App Builder UX; if the list grows further, group with `<supportedFormFactors>` or split.
- Reactivity uses plain class fields (no `@track`); reassignment triggers re-render. Do not mutate arrays/objects in place — replace them.
- Use `Array.isArray(...)` and `Number.isFinite(...)` defensively — Apex `null` becomes JS `null`/`undefined`, and `Number(null)` is `0`, which masks bugs.
- `connectedCallback` runs `applyTheme()` then schedules two more frames before applying again — this defends against flexipage paint races where the host node briefly loses inline custom properties.
- `setTimeout` inside `connectedCallback` (`animateGauge`/`animateBars`) currently triggers `@lwc/lwc/no-async-operation`. Prefer `requestAnimationFrame` + `data-scale` reads in `renderedCallback` with an `_animated` guard if you refactor.
- Color sanitization: `sanitizePmTextColor` rejects anything containing `; } < > url( expression(`. When adding new color-typed `@api` properties for CSS custom properties, run through a similar guard — never pipe raw user input directly into `style.setProperty`.

## CSS
- Reuse existing `--wp-*` theme tokens (`--wp-shell-bg`, `--wp-text-primary`, `--wp-border-soft`, `--wp-accent`, `--wp-track-bg`, etc.). Do NOT introduce new tokens unless updating BOTH `predictionThemes.js` files (this LWC + multiclass sibling).
- Component-private tokens use the `--lwc-pm-*` prefix (e.g. `--lwc-pm-summary-label-color`, `--lwc-pm-summary-font-scale`).
- Theme tokens come in 43 presets (default + 42 named) — see `predictionThemes.js`. **Maintain parity** with `multiclassPredictionLwc/predictionThemes.js`.
- Container queries: `@container (max-width: 340px)` for the main grid, `@container (max-width: 380px)` to hide the header theme switcher. Don't introduce new breakpoints without checking the sibling.
- Do NOT use SLDS internal token names (e.g. `--lwc-brandPrimary`) — the LWC compiler rejects them. Stick to the local `--wp-*` / `--lwc-pm-*` namespaces.

## Documentation
- README is the entry point; `docs/INDEX.md` is the table of contents.
- Mermaid diagrams in markdown — keep balanced arrows and nodes, validate by eye.
- Theme catalog PDF lives at `docs/assets/widget_theme_catalog.pdf` (also linked from monorepo `../docs/THEME_CATALOG.md`).
- Section labels (UPPERCASE) use `font-size: 11px`, `letter-spacing: 0.08em`, weight 500. Match this when adding new sections.

# Testing

```bash
# Apex (org-side)
sf apex run test --tests ClassificationModelLwcControllerTest \
  --result-format human --code-coverage --wait 10

# LWC Jest (no harness for classificationModelLwc currently — manual smoke tests on a record page)
npm run test:unit
```

Apex test patterns to follow:
- Test signature: `@IsTest static void <method>_<scenario>_<expected>()`.
- For `Flow.Interview` paths, accept that the test must reference a real flow API name in the org (or a known-bogus name for negative paths) — Salesforce doesn't expose Flow stubbing in Apex.
- Add `@TestVisible private static` on private helpers when you need direct unit coverage instead of routing through `Flow.Interview`.

# Deploy gotchas

- **Test queue jamming**: if a deploy fails mid-test-run, subsequent `sf apex run test` invocations may return `ALREADY_IN_PROCESS` until the org's test queue drains or the user manually aborts via Setup → Apex Test Execution.
- The org test queue is shared across the org — running tests in parallel from another tool causes this.
- For sandboxes that allow no-test deploys: `--test-level NoTestRun` — subject to org policy.
- **Validate-only first** for any LWC/Apex change: `sf project deploy validate ...`. Offline code reviewers do not catch LWC1503 or the Apex `in` keyword — only the platform compiler does.

# Common mistakes

- **Forgetting AppPage/HomePage targetConfig blocks** — always add new `@api` properties to all 3 (and to the `datasource` enum on `themeMode` if adding a theme).
- **Boolean `@api foo = true;`** — fails with LWC1503; either invert to a "hide" toggle or leave the JS field undeclared and set `default="true"` in meta-xml + read with `!== false` (see `autoGenerateSummary`).
- **`Decimal in = ...;`** — Apex compile error; rename to `inVal`/`input`.
- **`Decimal.valueOf(Double)`** — produces binary-float noise; route through `String.valueOf`.
- **Blending gauge endpoints in RGB instead of HSL** — `lerpColorHex` deliberately uses HSL so vivid pairs don't mid-mix to mud. Don't "simplify" it back to RGB lerp.
- **Editing `predictionThemes.js` in only one project** — must mirror the change in `DC_Multiclass_Prediction_LWC/force-app/main/default/lwc/multiclassPredictionLwc/predictionThemes.js` to keep theme parity across the suite.
- **Subagent scope creep** — when delegating implementation tasks, be explicit about which files may change. Subagents will sometimes "fix things they noticed" in unrelated files.
- **Offline reviews miss platform-specific compile rules** — code-quality reviewers running without a live org will not catch LWC1503 or the Apex `in` keyword. Always run `sf project deploy validate` before declaring an Apex/LWC change done.

# Related docs

- @docs/INDEX.md — full table of contents
- @docs/ARCHITECTURE.md — sequence + data flow diagrams
- @docs/COMPONENT_REFERENCE.md — every App Builder property, with defaults
- @docs/FLOW_GUIDE.md — Flow contract (inputs/outputs)
- @docs/UI_LAYOUT.md — gauge vs value-hero layout, responsive rules
- @docs/PROMPT_TEMPLATE_GUIDE.md — Einstein prompt template JSON shape
- @docs/HOW_TO.md — percent vs currency, page setup recipes
- @docs/TROUBLESHOOTING.md — common issues + fixes
- @docs/DEPLOY.md — deploy commands and tests
- @docs/assets/widget_theme_catalog.pdf — visual catalog of all 42 themes
- @../DC_Multiclass_Prediction_LWC/AGENTS.md — sibling project conventions to mirror
