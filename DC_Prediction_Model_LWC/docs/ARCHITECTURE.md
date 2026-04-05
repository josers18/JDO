# Architecture

High-level behavior of **Prediction Model** (`classificationModelLwc`) and **`ClassificationModelLwcController`** (Apex class name unchanged; see [GIT.md](GIT.md)).

---

## Component responsibilities

| Layer | Responsibility |
|-------|------------------|
| **LWC** | Renders **percent gauge** or **full-width numeric metric panel** (by `predictionOutputFormat`), driver/recommendation lists, summary; maps designer properties to Apex; parses JSON for lists; applies colors and animations; applies **`THEMES`** from **`predictionThemes.js`** (profile-aligned CSS variables, optional header theme switcher). |
| **Apex** | Runs flow with safe variable naming; serializes flow outputs to strings; invokes Einstein prompt API with a wrapped text parameter. |
| **Flow** (org) | Encapsulates record-scoped prediction and shapes `factors` / `recommendations` for the UI. |
| **Prompt template** (org) | Turns JSON context into user-facing narrative (optional). |

---

## Sequence: record page load

```mermaid
sequenceDiagram
    participant User
    participant LWC as classificationModelLwc
    participant Apex as ClassificationModelLwcController
    participant Flow as Autolaunched Flow
    participant LLM as Einstein Prompt API

    User->>LWC: Opens record page
    LWC->>LWC: recordId set by platform
    LWC->>Apex: runPredictionFlow (flow API name, record Id, output vars)
    Apex->>Flow: createInterview and start
    Flow-->>Apex: prediction, factors, recommendations
    Apex-->>LWC: PredictionResult JSON plus prediction number
    LWC->>LWC: Render main value (gauge if percent, else metric panel), lists, bar animation

    alt When prompt template set and auto summary on
        LWC->>Apex: generateAnalysisSummary
        Apex->>LLM: generateMessagesForPromptTemplate
        LLM-->>Apex: generation text
        Apex-->>LWC: summary string
        LWC->>User: Show AI summary card
    end
```

---

## Data flow (prediction → UI)

```mermaid
flowchart LR
    subgraph Org
        F[Autolaunched Flow]
    end
    subgraph Deployed
        A[runPredictionFlow]
        L[classificationModelLwc]
    end
    F -->|outputs| A
    A -->|prediction, factorsJson, recommendationsJson| L
    L -->|gauge or formatted number, bars, labels| UI[Lightning UI]
```

---

## Summary payload (Apex → prompt)

Apex builds **one JSON string** and passes it to the flex text input (API name from LWC, default `Input:Prediction_Context`):

```json
{
  "prediction": 51.58,
  "predictionOutputFormat": "decimal",
  "factors": "[...]",
  "recommendations": "[...]"
}
```

`predictionOutputFormat` mirrors the LWC App Builder setting (`percent`, `integer`, `decimal`, `currency`). `factors` and `recommendations` are **strings** (often stringified JSON arrays). The prompt template should treat them as text or parse them inside the template instructions.

---

## Error handling

| Failure | User-visible behavior |
|---------|------------------------|
| Flow missing / runtime error | Toast: “Could not run prediction flow”; sticky message with detail. |
| Summary / Einstein error | Toast: “AI summary failed”; main prediction area and lists may still show if flow succeeded. |
| No `recordId` | Flow is not called (silent skip). |
| No `flowApiName` | Flow is not called. |

---

## Main prediction rendering

- **Percent mode:** Arc **color** from getter `gaugeArcSolidColor` (template-bound `stroke`). **Dash offset** is animated in JS. `renderedCallback` removes inline `stroke` on `.gauge-arc` so App Builder color/reverse changes apply after refresh.
- **Integer / decimal / currency:** No gauge. The value is shown in **`.value-hero-panel`** (full column width) with **`lightning-formatted-number`**; label uses **Gauge subtitle** on **`.value-hero__caption`**. Typography uses **container query** units on `.lwc-shell` for responsive size.

Full DOM and CSS overview: [UI_LAYOUT.md](UI_LAYOUT.md).

---

## Related docs

- [GIT.md](GIT.md) — Git layout, clone path, naming vs metadata
- [UI_LAYOUT.md](UI_LAYOUT.md) — Gauge vs metric panel, captions, responsive rules
- [FLOW_GUIDE.md](FLOW_GUIDE.md) — Flow contract
- [PROMPT_TEMPLATE_GUIDE.md](PROMPT_TEMPLATE_GUIDE.md) — Template inputs
- [COMPONENT_REFERENCE.md](COMPONENT_REFERENCE.md) — All properties
