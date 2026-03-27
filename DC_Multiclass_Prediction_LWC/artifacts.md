# Artifacts inventory

**Project:** `DC_Multiclass_Prediction_LWC` (see `sfdx-project.json`). **Git:** often under `JDO/DC_Multiclass_Prediction_LWC/` — see [docs/GIT.md](docs/GIT.md).

Source of truth: `force-app/main/default/`. This file describes each deployable artifact and how it fits together.

**Naming:** App Builder shows **Prediction Model**; the LWC bundle path is still `lwc/classificationModelLwc/` and Apex classes `ClassificationModelLwcController*` (historical API names, stable for orgs).

---

## Apex

| Artifact | File(s) | Role |
|----------|---------|------|
| **ClassificationModelLwcController** | `classes/ClassificationModelLwcController.cls` (+ `-meta.xml`) | `runPredictionFlow`: starts an autolaunched `Flow.Interview` with a configurable record Id input and reads configurable output variables for prediction (Decimal/Integer/String coerced), factors, and recommendations (serialized to JSON strings). `generateAnalysisSummary`: builds JSON (`prediction`, `predictionOutputFormat`, `factors`, `recommendations`) and calls `ConnectApi.EinsteinLLM.generateMessagesForPromptTemplate`. |
| **ClassificationModelLwcControllerTest** | `classes/ClassificationModelLwcControllerTest.cls` (+ `-meta.xml`) | Minimal tests: null prompt returns null; missing/invalid flow throws. |

**Sharing:** `with sharing` — respects sharing of the running user when combined with flow and object security.

---

## Lightning Web Component bundle

| File | Role |
|------|------|
| `lwc/classificationModelLwc/classificationModelLwc.js` | UI logic: wire `recordId`, invoke Apex, parse insight JSON, **prediction output format** (percent vs integer/decimal/currency), gauge color (HSL lerp) when percent, bar animation, optional Einstein summary + `predictionOutputFormat` in payload. |
| `lwc/classificationModelLwc/classificationModelLwc.html` | Markup: **percent** → `gauge-wrap` + SVG arc; **non-percent** → `value-hero-panel` + `lightning-formatted-number`; predictor/recommendation lists; summary card. |
| `lwc/classificationModelLwc/classificationModelLwc.css` | Layout: gauge column (170px) vs **full-width metric panel**; container queries (`cqw`) for large numeric typography; section and bar styles. |
| `lwc/classificationModelLwc/classificationModelLwc.js-meta.xml` | Exposure: Record / App / Home pages; all designer properties; **Account** object restriction for record pages. |

---

## Not in this repository (org-built)

These are **required in the org** but are not versioned here unless you add them:

| Artifact | Purpose |
|----------|---------|
| **Autolaunched Flow** | Loads model / Data Cloud / custom logic; outputs `prediction`, `factors`, `recommendations` (names configurable in the LWC). |
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
classificationModelLwc (LWC)
    ├── Apex: ClassificationModelLwcController.runPredictionFlow
    │         └── Flow.Interview(flowApiName, { recordIdVariable → recordId })
    └── Apex: ClassificationModelLwcController.generateAnalysisSummary (optional)
              └── ConnectApi.EinsteinLLM.generateMessagesForPromptTemplate
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for sequence diagrams, [docs/UI_LAYOUT.md](docs/UI_LAYOUT.md) for gauge vs metric panel, and [docs/GIT.md](docs/GIT.md) for Git layout.
