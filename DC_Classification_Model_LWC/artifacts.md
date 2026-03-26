# Artifacts inventory

Source of truth: `force-app/main/default/`. This file describes each deployable artifact and how it fits together.

---

## Apex

| Artifact | File(s) | Role |
|----------|---------|------|
| **ClassificationModelLwcController** | `classes/ClassificationModelLwcController.cls` (+ `-meta.xml`) | `runPredictionFlow`: starts an autolaunched `Flow.Interview` with a configurable record Id input and reads configurable output variables for prediction (Decimal/Integer/String coerced), factors, and recommendations (serialized to JSON strings). `generateAnalysisSummary`: builds a JSON payload and calls `ConnectApi.EinsteinLLM.generateMessagesForPromptTemplate`. |
| **ClassificationModelLwcControllerTest** | `classes/ClassificationModelLwcControllerTest.cls` (+ `-meta.xml`) | Minimal tests: null prompt returns null; missing/invalid flow throws. |

**Sharing:** `with sharing` — respects sharing of the running user when combined with flow and object security.

---

## Lightning Web Component bundle

| File | Role |
|------|------|
| `lwc/classificationModelLwc/classificationModelLwc.js` | UI logic: wire `recordId`, invoke Apex, parse insight JSON, gauge color (HSL lerp), bar animation, optional summary. |
| `lwc/classificationModelLwc/classificationModelLwc.html` | Markup: gauge SVG, sections, summary card. |
| `lwc/classificationModelLwc/classificationModelLwc.css` | Layout and styling. |
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

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for sequence diagrams.
