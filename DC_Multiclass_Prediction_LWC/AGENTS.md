# AGENTS.md — DC_Multiclass_Prediction_LWC

Context for AI coding agents working on the **Multiclass Prediction** Lightning card. This is a Salesforce DX project shipping one LWC, one Apex controller (+ helper), test classes, and a permission set.

# Product context

A record-page LWC that visualizes a multiclass model prediction (e.g. product recommendation by class). Pulls data from an autolaunched Flow that the user owns in their org, then renders three sections top to bottom: predicted-class hero → class probabilities chart → SHAP-style feature contributions → optional Einstein-generated narrative summary.

Sibling project `DC_Prediction_Model_LWC` covers the **numeric/regression** case (gauge / big number); both can deploy to the same org since they use distinct API names.

# Tech stack

- **Apex** — `with sharing` controller; Flow.Interview reads; Einstein `ConnectApi.EinsteinLLM` for prompt-template summaries
- **LWC** — `@api` properties bound from App Builder; CSS custom properties for theming; `container-type: inline-size` for responsive layout
- **Salesforce DX** — `sourceApiVersion: 66.0`, `sf` CLI v2 for deploys (NOT `sfdx`)
- **Tooling** — Jest via `sfdx-lwc-jest`, ESLint, Prettier with XML plugin
- **Mermaid** in markdown for architecture diagrams

# Project structure

```
DC_Multiclass_Prediction_LWC/
├── force-app/main/default/
│   ├── classes/
│   │   ├── MulticlassPredictionLwcController.cls   ← Flow runner + Einstein caller
│   │   ├── MulticlassPredictionLwcControllerTest.cls   ← 13 tests, including @TestVisible coerceToDecimal_*
│   │   ├── LlmOutputSanitizer.cls                  ← strips LLM closing courtesy text
│   │   └── LlmOutputSanitizerTest.cls
│   ├── lwc/multiclassPredictionLwc/
│   │   ├── multiclassPredictionLwc.js              ← getters, Apex roundtrip, animations
│   │   ├── multiclassPredictionLwc.html            ← hero + class-prob-section + improve-section + summary
│   │   ├── multiclassPredictionLwc.css             ← reuses --wp-* tokens; ~510 lines
│   │   ├── multiclassPredictionLwc.js-meta.xml     ← THREE targetConfig blocks (RecordPage, AppPage, HomePage) — keep all in sync
│   │   └── predictionThemes.js                     ← 43 theme presets; parity with classificationModelLwc
│   └── permissionsets/DC_Multiclass_Prediction_User.permissionset-meta.xml
├── docs/                                           ← INDEX.md is the entry point
├── README.md
├── CHANGELOG.md                                    ← project-scoped, Keep a Changelog format
└── sfdx-project.json
```

# Commands

```bash
# Deploy (single project, scoped)
sf project deploy start --source-dir force-app/main/default --wait 10 --concise

# Deploy with tests
sf project deploy start --source-dir force-app \
  --test-level RunSpecifiedTests \
  --tests MulticlassPredictionLwcControllerTest --wait 30

# Run Apex tests against an org
sf apex run test --tests MulticlassPredictionLwcControllerTest \
  --result-format human --code-coverage --wait 10

# Local LWC unit tests (Jest)
npm install
npm run test:unit

# Format / lint
npm run prettier
npm run lint
```

**IMPORTANT:** Use `sf` (CLI v2), not `sfdx`. The `sfdx` commands are deprecated.

# Architecture

## Data contract

```
Autolaunched Flow (user-owned)
   ├─ output: prediction          ← Text — predicted class label, e.g. "Wealth_Management"
   ├─ output: recommendations     ← Text/Apex — JSON array of SHAP-style contributions
   └─ output: <ClassName_1..N>    ← N Decimal scalars, one per class (probability 0..1)
        │
        ▼
MulticlassPredictionLwcController.runPredictionFlow(flowApiName, recordId, recordIdVar,
                                                    predictionVar, recommendationsVar,
                                                    classVariableNamesCsv)   ← 6 params
        │
        ▼ MulticlassResult { predictionLabel, recommendationsJson,
        │                    classProbabilities: List<ClassProbability> }
        │
        ▼
multiclassPredictionLwc renders 3 sections
```

`ClassProbability` is the wire DTO: `{ apiName: String, value: Decimal }`. CSV is parsed by `parseClassProbabilities` (`@TestVisible private static`); each value is coerced via `coerceToDecimal` (also `@TestVisible`) which handles null, Decimal, Double, Integer, Long, numeric String, with `try { } catch (TypeException)` on parse failure.

## Key LWC getters

- `resolvedWinnerApiName` — single source of truth for who's "the winner". Returns `predictionLabelRaw.trim()` when non-empty, else falls back to the highest-probability class. **Both** the hero label and the chart's winner row read this getter so they cannot disagree.
- `processedClassProbabilities` — sorted descending, with `barScale`, `percentDisplay`, `barStyle` (opacity), `rowClass` (with `prob-row--winner` flag), and tiebreak by original CSV index. Sliced to top-N when `enableTopNClasses === true` and `topNClassCount > 0`.
- `showClassProbChart` — visibility flag; respects `hideClassProbabilities` toggle AND data presence.
- `hasData` — gates the entire render; truthy if any of: prediction label, recommendations, OR class probabilities exist.

# Conventions

## Apex
- `with sharing` on all controllers — never `without sharing` for LWC-callable code.
- All public methods that LWC calls must be `@AuraEnabled`.
- All DTO fields must be `@AuraEnabled` to deserialize on the JS side.
- Helpers exposed only for tests use `@TestVisible private static`.
- **Reserved keyword `in`** — Apex parses `in` as the SOQL IN operator. Never use it as a local variable name (use `inVal`, `input`, `arg`).
- `Decimal.valueOf(Double)` produces binary-float artifacts (e.g. `0.7` → `0.6999...`). Always route Doubles through `Decimal.valueOf(String.valueOf(d))`.
- Catch the narrowest exception. `Decimal.valueOf(String)` throws `TypeException` — catch that, not bare `Exception` (which would swallow `LimitException`).

## LWC
- **LWC1503 — Boolean `@api` defaults must be `false`.** The compiler rejects `@api foo = true;` because `<my-cmp foo>` (attribute presence) flips the property to `true`. If you want a "show by default" toggle, invert it to a "hide" toggle (`hideX = false`) and adjust both the consuming getter AND meta-xml `default="false"`.
- Public properties expose to App Builder via `@api` + `<property>` in `js-meta.xml`. Every new `@api` property MUST be added to ALL THREE `targetConfig` blocks (RecordPage, AppPage, HomePage) — it's easy to forget the AppPage/HomePage variants.
- RecordPage block uses verbose property `description="..."`; AppPage/HomePage blocks use terse form (no descriptions). Match this pattern.
- Use `Array.isArray(...)` and `Number.isFinite(...)` defensively — Apex `null` becomes JS `null`/`undefined`, and `Number(null)` is `0`, which can mask bugs.
- Reactivity uses plain class fields (no `@track`); reassignment triggers re-render. Never mutate arrays/objects in place — replace them.
- For animation: bars carry `data-scale="<number>"` and the `bar-fill` (or `prob-bar`) class. The `animateBars()` setTimeout in `connectedCallback` reads `data-scale` and applies `transform: scaleX(...)`.
- `prefers-reduced-motion: reduce` is honored — `.prob-bar` falls back to `scaleX(1)` so the chart is visible without JS animation.

## CSS
- Reuse existing `--wp-*` theme tokens (e.g. `--wp-accent`, `--wp-accent-bg`, `--wp-text-primary`, `--wp-border-soft`). Do NOT introduce new tokens unless updating `predictionThemes.js`.
- Theme tokens come in 43 presets (default + 42 named) — see `predictionThemes.js`. **Maintain parity** with `classificationModelLwc/predictionThemes.js` when editing tokens.
- Use `@container (max-width: 420px)` for narrow-card responsive (matches existing `.factor-row` breakpoint). Don't introduce new breakpoints without checking siblings.

## Documentation
- README is the entry point; `docs/INDEX.md` is the table of contents.
- Mermaid diagrams in markdown — keep balanced arrows and nodes, validate by eye.
- `CHANGELOG.md` (this project) follows Keep a Changelog. Parent monorepo at `../CHANGELOG.md` rolls up.
- Section labels (`CLASS PROBABILITIES`, `CONTRIBUTING FACTORS`) use 12px / weight 600 / `--wp-text-primary` — kept dark to delineate sections.

# Testing

```bash
# Apex (org-side)
sf apex run test --tests MulticlassPredictionLwcControllerTest \
  --result-format human --code-coverage --wait 10

# LWC Jest (no harness for multiclassPredictionLwc currently — manual smoke tests on a record page)
npm run test:unit
```

Apex test patterns to follow:
- `@TestVisible` on private helpers when you need direct unit coverage instead of routing through `Flow.Interview` (which can't be stubbed).
- For `Flow.Interview` paths, accept that the test must reference a real flow API name (or a known-bogus one for negative paths) — there's no Flow stubbing in Apex.
- Test signature: `@IsTest static void <method>_<scenario>_<expected>()` — see `coerceToDecimal_handlesDoubleWithoutBinaryNoise` as the canonical example.

# Deploy gotchas

- **Test queue jamming**: if a deploy fails mid-test-run, subsequent `sf apex run test` invocations may return `ALREADY_IN_PROCESS` until the org's test queue drains or the user manually aborts via Setup → Apex Test Execution.
- The org test queue is shared across the org — running tests in parallel from another tool will cause this.
- For sandboxes that allow no-test deploys: `--test-level NoTestRun` — subject to org policy.

# Common mistakes

- **Forgetting AppPage/HomePage targetConfig blocks** — always add new `@api` properties to all 3.
- **Boolean `@api foo = true;`** — fails with LWC1503; invert.
- **`Decimal in = ...;`** — Apex compile error; rename.
- **`Decimal.valueOf(Double)`** — produces noise; route through `String.valueOf`.
- **Trying to fast-forward `main` after the feature branch was rebased** — fast-forward only works when the branches are linearly ahead. Use a regular merge commit (`--no-ff`) when both branches have unique commits.
- **Subagent scope creep** — when delegating implementation tasks, be explicit about which files may change. Subagents will sometimes "fix things they noticed" in unrelated files. Surface and drop those commits via `git rebase --onto`.
- **Offline reviews miss platform-specific compile rules** — code-quality reviewers running without a live org will not catch LWC1503 or the Apex `in` keyword. Always run `sf project deploy validate` before declaring an Apex/LWC change done.

# Related docs

- @docs/INDEX.md — full table of contents
- @docs/ARCHITECTURE.md — sequence + data flow + class probability pipeline diagrams
- @docs/COMPONENT_REFERENCE.md — every App Builder property, with defaults
- @docs/FLOW_GUIDE.md — Flow contract (inputs/outputs incl. per-class scalars)
- @docs/UI_LAYOUT.md — card layout, responsive rules, mermaid structure diagrams
- @docs/PROMPT_TEMPLATE_GUIDE.md — Einstein prompt template JSON shape
- @docs/TROUBLESHOOTING.md — common issues + fixes
- @docs/DEPLOY.md — deploy commands and tests
- @CHANGELOG.md — project-scoped changelog
- @../CHANGELOG.md — JDO monorepo changelog
