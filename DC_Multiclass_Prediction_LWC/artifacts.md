# Artifacts inventory

**Project:** `DC_Multiclass_Prediction_LWC` (see `sfdx-project.json`). **Git:** often under `JDO/DC_Multiclass_Prediction_LWC/` — see [docs/GIT.md](docs/GIT.md).

Source of truth: `force-app/main/default/`. This file describes each deployable artifact and how it fits together.

**Naming:** App Builder shows **Multiclass Prediction**; bundle folder `lwc/multiclassPredictionLwc/`; Apex `MulticlassPredictionLwcController` (+ test). This project is separate from **DC_Prediction_Model_LWC** and uses different API names so both can deploy to the same org if needed.

---

## Apex

| Artifact | File(s) | Role |
|----------|---------|------|
| **MulticlassPredictionLwcController** | `classes/MulticlassPredictionLwcController.cls` (+ `-meta.xml`) | `runPredictionFlow`: starts an autolaunched `Flow.Interview` with a configurable record Id input; reads **text** `prediction`, **recommendations** (serialized to JSON string), and **N per-class probability scalars** named via a comma-separated variable list. Inner classes: `MulticlassResult` (the wire shape) and `ClassProbability` (`apiName` + `Decimal value`). Helpers `parseClassProbabilities` and `coerceToDecimal` are `@TestVisible private static`. `generateAnalysisSummary`: builds JSON (`prediction`, `predictionType`: `multiclass_label`, `recommendations`) and calls `ConnectApi.EinsteinLLM.generateMessagesForPromptTemplate`. |
| **MulticlassPredictionLwcControllerTest** | `classes/MulticlassPredictionLwcControllerTest.cls` (+ `-meta.xml`) | 13 tests covering: null prompt returns null; missing/invalid flow throws; blank class CSV returns empty list; nine `coerceToDecimal_*` cases (null, Decimal, Double-without-binary-noise, Integer, Long, valid numeric string, blank string, garbage string, unsupported type). |
| **LlmOutputSanitizer** | `classes/LlmOutputSanitizer.cls` (+ `-meta.xml`) | Used by the controller to trim boilerplate from model strings. |
| **LlmOutputSanitizerTest** | `classes/LlmOutputSanitizerTest.cls` (+ `-meta.xml`) | Unit tests for sanitizer. |

**Sharing:** `with sharing` — respects sharing of the running user when combined with flow and object security.

---

## Permission set

| Artifact | File | Role |
|----------|------|------|
| **DC Multiclass Prediction User** | `permissionsets/DC_Multiclass_Prediction_User.permissionset-meta.xml` | Apex access: `MulticlassPredictionLwcController`, `LlmOutputSanitizer`. Assign to users who use the Multiclass Prediction component. |

---

## Lightning Web Component bundle

| File | Role |
|------|------|
| `lwc/multiclassPredictionLwc/predictionThemes.js` | **Shared theme tokens** (`THEMES` export); maintain **parity** with **Prediction Model** `classificationModelLwc/predictionThemes.js`. |
| `lwc/multiclassPredictionLwc/multiclassPredictionLwc.js` | UI logic: wire `recordId`, invoke Apex (now passing the class-probability CSV), parse recommendations JSON, **class label** (optional humanize, with `resolvedWinnerApiName` fallback to highest-probability class), **class probabilities** getter (`processedClassProbabilities` — sort desc, opacity gradient, winner flag, optional top-N slice), **diverging** row build (sort by \|value\| desc, bar scales, risk/good colors), **legend** inline styles tied to those colors, `animateBars` (extended to `.prob-bar`), optional Einstein summary; **themeMode** / switcher via `predictionThemes.js`. |
| `lwc/multiclassPredictionLwc/multiclassPredictionLwc.html` | Markup: **class hero panel** (accent-tinted); **class probability section** (`.prob-row`, `.prob-track`, `.prob-bar`, `.prob-pct`, with `.prob-row--winner`); **feature contributions** as **factor-row** + **diverge-zone** (center line, **bar-pos** / **bar-neg**, value text); **diverge-legend**; optional AI summary. |
| `lwc/multiclassPredictionLwc/multiclassPredictionLwc.css` | Layout: accent-tinted hero, class probability chart (theme-accent bars + opacity + winner border), **diverging** feature-contribution chart, wrapping labels, **420px** container column stack for both chart types, legend, summary; container queries; `prefers-reduced-motion: reduce` safety net for `.prob-bar`. |
| `lwc/multiclassPredictionLwc/multiclassPredictionLwc.js-meta.xml` | Exposure: Record / App / Home; multiclass-specific designer properties (including new `classProbabilityVariableNames`, `hideClassProbabilities`, `enableTopNClasses`, `topNClassCount`); **Account** on record pages. |

---

## Not in this repository (org-built)

These are **required in the org** but are not versioned here unless you add them:

| Artifact | Purpose |
|----------|---------|
| **Autolaunched Flow** | Loads model / Data Cloud / custom logic; outputs **text** `prediction` and `recommendations` (names configurable in the LWC). |
| **Prompt template** (Einstein) | Receives a single text input containing JSON; returns natural-language summary. |
| **Custom objects / fields** | Whatever your flow reads or writes. |
| **Prediction / ML integrations** | Invocable actions, Apex, Data Cloud predictions, etc., inside the flow. |

---

## Project configuration (non-deployed tooling)

| Path | Role |
|------|------|
| `sfdx-project.json` | DX project name, package directory, API version. |
| `.forceignore` | Excludes paths from push/pull/deploy where listed. |
| `package.json`, `jest.config.js`, `eslint.config.js` | Local tooling. |
| `config/project-scratch-def.json` | Optional scratch org shape (if used). |

---

## Dependency graph (conceptual)

```
multiclassPredictionLwc (LWC)
    ├── Apex: MulticlassPredictionLwcController.runPredictionFlow
    │         └── Flow.Interview(flowApiName, { recordIdVariable → recordId })
    └── Apex: MulticlassPredictionLwcController.generateAnalysisSummary (optional)
              └── ConnectApi.EinsteinLLM.generateMessagesForPromptTemplate
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for sequence and recommendation pipeline diagrams, [docs/UI_LAYOUT.md](docs/UI_LAYOUT.md) for the diverging chart and responsive behavior, and [docs/GIT.md](docs/GIT.md) for Git layout.
