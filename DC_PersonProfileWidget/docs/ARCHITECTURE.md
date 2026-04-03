# Architecture — Customer Profile Widget

## High-level behavior

1. The LWC receives **`recordId`** from the record page (or host).
2. On `recordId` set (and in `connectedCallback` if already set), it calls **`CustomerProfileWidgetController.getProfileData`** with assembly Flow settings, prediction Flow settings, and optional **`coreCustomFieldsJson`**.
3. Apex loads **CRM** data with **SOQL** (Account or Contact) into a baseline `ProfileResult`, including optional custom fields from `coreCustomFieldsJson`.
4. If **profile assembly Flow** is configured (`profileAssemblyFlowApiName` + non-empty **`profileFlowOutputMapJson`**), Apex runs that autolaunched Flow and copies **Flow output variables** into `ProfileResult` using the map (logical widget key → output variable API name). Apex then **fills blanks** on that result from the SOQL layer (`mergeEnrichFull`).
5. If **prediction Flow** is configured (`flowApiName`), Apex merges **prediction** and **recommendations** outputs. When the prediction Flow is the **same** API name as the assembly Flow, **one** `Flow.Interview` is reused.
6. The LWC binds `ProfileResult` to the UI. After ~400 ms it runs **`animateBars()`** on signal bar fills (CSS transform).
7. If **`promptTemplateId`** is set and **`autoGenerateSummary`** is not explicitly false, the LWC calls **`generateSummary`** (Einstein Prompt Template) for the **Insight** tab.

**Flow assignments:** You do not pass a graph JSON blob. Each mapped slot is a normal Flow **output** (Text, Number, Currency, Checkbox, etc.). Apex reads values with `Flow.Interview.getVariableValue`. For **`nearbyBranches`**, store a **Text** output containing a JSON array string, or another type Apex can `JSON.serialize` / deserialize.

```mermaid
sequenceDiagram
    participant Page as Record page
    participant LWC as customerProfileWidget
    participant Apex as CustomerProfileWidgetController
    participant DB as Salesforce DB
    participant Asm as Assembly Flow
    participant Pred as Prediction Flow
    participant E as Einstein Prompt Template

    Page->>LWC: recordId set
    LWC->>Apex: getProfileData(recordId, flows, maps...)
    Apex->>DB: SOQL Account or Contact by Id
    DB-->>Apex: row
    opt profile assembly configured
        Apex->>Asm: Flow.Interview.start
        Asm-->>Apex: output variables
        Apex->>Apex: applyProfileOutputsFromFlow + mergeEnrichFull
    end
    opt flowApiName present
        Apex->>Pred: Flow.Interview (or reuse Asm)
        Pred-->>Apex: prediction, recommendations
    end
    Apex-->>LWC: ProfileResult
    LWC->>LWC: animateBars (timeout)
    opt promptTemplateId + auto summary
        LWC->>Apex: generateSummary(...)
        Apex->>E: generateMessagesForPromptTemplate
        E-->>Apex: text
        Apex-->>LWC: summary string
    end
```

## Merge semantics

| Source | When | What it fills |
|--------|------|----------------|
| Assembly Flow | `profileAssemblyFlowApiName` + output map | Mapped outputs; SOQL fills **remaining blanks** |
| SOQL only | No assembly Flow | Standard + optional custom CRM fields |
| Prediction Flow | `flowApiName` set | **predictionLabel**, **recommendationsJson** when outputs exist |

## Security

- Controller is **`with sharing`**.
- Users need **Apex authorization** for the controller class.

## UI architecture

```mermaid
flowchart TB
    subgraph Header
        H1[Gradient + avatar ring]
        H2[Name / location / tier]
        H3[Enrollment flags optional]
        H4[KPI strip optional]
    end
    subgraph Tabs
        T1[Overview]
        T2[AI Signals]
        T3[Portfolio]
        T4[Services]
        T5[Location]
        T6[Insight]
    end
    Header --> Tabs
    T1 --> F1[Field rows]
    T2 --> F2[Rings + bar chart]
    T3 --> F3[Donut + account cards]
    T4 --> F4[Service cards + suggestions]
    T5 --> F5[Map + address + branches]
    T6 --> F6[Prediction + summary + actions]
```

## Related docs

- [DIAGRAMS.md](DIAGRAMS.md) — additional Mermaid figures.
- [COMPONENT_REFERENCE.md](COMPONENT_REFERENCE.md) — designer properties.
