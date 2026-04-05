# Architecture

High-level behavior of **Multiclass Prediction** (`multiclassPredictionLwc`) and **`MulticlassPredictionLwcController`**. **Git / path:** [GIT.md](GIT.md).

---

## Component responsibilities

| Layer | Responsibility |
|-------|----------------|
| **LWC** | Renders **predicted class** as large text (with optional humanize), **recommendations** as a **diverging bar chart** (SHAP-style scores, legend tied to bar colors), optional summary; maps designer properties to Apex; parses JSON for recommendations; applies **`THEMES`** from **`predictionThemes.js`** (profile-aligned CSS variables, optional header theme switcher). |
| **Apex** | Runs flow with safe variable naming; coerces prediction to text; serializes recommendations to a string; invokes Einstein prompt API with a wrapped text parameter. |
| **Flow** (org) | Encapsulates record-scoped multiclass prediction and shapes `recommendations` for the UI. |
| **Prompt template** (org) | Turns JSON context into user-facing narrative (optional). |

---

## Sequence: record page load

```mermaid
sequenceDiagram
    participant User
    participant LWC as multiclassPredictionLwc
    participant Apex as MulticlassPredictionLwcController
    participant Flow as Autolaunched Flow
    participant LLM as Einstein Prompt API

    User->>LWC: Opens record page
    LWC->>LWC: recordId set by platform
    LWC->>Apex: runPredictionFlow (flow API name, record Id, output vars)
    Apex->>Flow: createInterview and start
    Flow-->>Apex: prediction (text), recommendations
    Apex-->>LWC: predictionLabel, recommendationsJson
    LWC->>LWC: Render class hero, diverging rows, bar animation, legend colors

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
        L[multiclassPredictionLwc]
    end
    F -->|outputs| A
    A -->|predictionLabel, recommendationsJson| L
    L -->|hero label, diverging bars, legend, summary| UI[Lightning UI]
```

---

## Recommendations: client-side pipeline (UI)

After flow data arrives, the LWC derives rows for the chart (conceptual steps):

```mermaid
flowchart TD
    J[recommendations JSON string/array]
    P[parseJsonToInsightArray / normalizeInsightSource]
    B[buildInsightRowsFromArray]
    S[Sort by abs value descending]
    SC[applyBarScales max abs]
    C[resolveColors + applyProcessedRowColors]
    R[Template: factor-row + diverge-zone + bar-pos/bar-neg]
    A[animateBars scaleX on .bar-fill]
    J --> P --> B --> S --> SC --> C --> R --> A
```

- **Display values** are shown as **±x.x** (one decimal, Unicode minus for negatives) — raw model contributions, **not** percentages.
- **Legend** getters (`legendSupportsDotStyle`, `legendAgainstDotStyle`) use the same **risk/good** pairing as positive- vs negative-direction bars.

---

## Summary payload (Apex → prompt)

Apex builds **one JSON string** and passes it to the flex text input (API name from LWC, default `Input:Prediction_Context`):

```json
{
  "prediction": "Wealth_Management",
  "predictionType": "multiclass_label",
  "recommendations": "[{\"fields\":[...],\"value\":317.61}, ...]"
}
```

- `prediction` is always a **JSON string** (the raw label from the flow before LWC humanize).
- `predictionType` is always **`multiclass_label`** so the template can branch from regression/classification payloads.
- `recommendations` is a **string** (often stringified JSON array). The prompt can parse it or treat it as opaque text.

---

## Error handling

| Failure | User-visible behavior |
|---------|------------------------|
| Flow missing / runtime error | Toast: “Could not run prediction flow”; sticky message with detail. |
| Summary / Einstein error | Toast: “AI summary failed”; class and recommendations may still show if flow succeeded. |
| No `recordId` | Flow is not called (silent skip). |
| No `flowApiName` | Flow is not called. |

---

## Main prediction rendering

- **Class hero:** `.class-hero-panel` wraps `.class-hero` with `.class-hero__label` (large text, `word-break`) and `.class-hero__caption` (subtitle).
- **Recommendations:** **Diverging** bars (`.bar-pos` / `.bar-neg` with `.bar-fill` for animation), center line, value overlays, wrapping labels, responsive column stack on narrow containers. See [UI_LAYOUT.md](UI_LAYOUT.md).

---

## Related docs

- [GIT.md](GIT.md) — Git layout, clone path, naming
- [UI_LAYOUT.md](UI_LAYOUT.md) — Class hero, diverging chart, legend, responsive rules
- [FLOW_GUIDE.md](FLOW_GUIDE.md) — Flow contract
- [PROMPT_TEMPLATE_GUIDE.md](PROMPT_TEMPLATE_GUIDE.md) — Template inputs
- [COMPONENT_REFERENCE.md](COMPONENT_REFERENCE.md) — All properties
