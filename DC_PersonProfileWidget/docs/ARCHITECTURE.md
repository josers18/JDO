# Architecture — Customer Profile Widget

## High-level behavior

1. The LWC receives **`recordId`** from the record page (or host).
2. On `recordId` set (and in `connectedCallback` if already set), it calls **`CustomerProfileWidgetController.getProfileData`** with:
   - **`graphApiName`** — if blank, step 3 is skipped.
   - **`recordId`**
   - **`fieldMappingsJson`** — JSON map built from every `field*` `@api` property (logical key → dot path).
   - **Flow** parameters — if **`flowApiName`** is blank, Flow merge is skipped.
3. Apex optionally **GETs** the Data Graph record over HTTP (**Named Credential `DataCloud`**), parses JSON, and **maps** values into `ProfileResult` using dot notation paths.
4. Apex always **merges** CRM **SOQL** data for the same `recordId` (Account or Contact) into **empty** profile slots (does not overwrite graph values already set).
5. If **Flow** is configured, Apex runs it and sets **`predictionLabel`** and **`recommendationsJson`** on `ProfileResult` (overwriting any prior values for those two fields when Flow returns data).
6. The LWC binds `ProfileResult` to the UI. After ~400 ms it runs **`animateBars()`** on signal bar fills (CSS transform).
7. If **`promptTemplateId`** is set and **`autoGenerateSummary`** is not explicitly false, the LWC calls **`generateSummary`**, which sends a JSON payload to **Einstein Prompt Template** and displays the returned text on the **Insight** tab.

```mermaid
sequenceDiagram
    participant Page as Record page
    participant LWC as customerProfileWidget
    participant Apex as CustomerProfileWidgetController
    participant NC as Named Credential DataCloud
    participant DC as Data Graph API
    participant DB as Salesforce DB
    participant Flow as Autolaunched Flow
    participant E as Einstein Prompt Template

    Page->>LWC: recordId set
    LWC->>Apex: getProfileData(graphApiName, recordId, mappings, flow...)
    alt graphApiName present
        Apex->>NC: GET .../ssot/data-graph/{graph}/records/{id}
        NC->>DC: HTTP
        DC-->>Apex: JSON body
        Apex->>Apex: unwrap + applyFieldMappings
    end
    Apex->>DB: SOQL Account or Contact by Id
    DB-->>Apex: row
    Apex->>Apex: mergeEnrich (fill blanks)
    alt flowApiName present
        Apex->>Flow: Flow.Interview.start
        Flow-->>Apex: prediction, recommendations
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
| Data Graph | `graphApiName` + successful HTTP | All mapped fields present in JSON |
| SOQL | Always when `recordId` is valid | Only **null/blank** fields on `ProfileResult` after graph step |
| Flow | `flowApiName` set | **predictionLabel**, **recommendationsJson** when outputs exist |

## JSON unwrapping (graph response)

Apex **`unwrapGraphRoot`** treats the deserialized body as:

- If top-level has **`record`** object → use that map as the mapping root.
- Else if top-level has **`data`** object → use that.
- Else → use the top-level map.

Your Data Graph API response must either be a **flat** map of fields or a structure where the fields you care about live under **`record`** or **`data`**, or adjust paths to start at the correct prefix (e.g. `party.individual.firstName`).

## Security

- Controller is **`with sharing`**.
- Graph access is only as strong as the **Named Credential** identity and Data Cloud permissions.
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
    T1 --> F1[Field rows + sparkline]
    T2 --> F2[Rings + bar chart]
    T3 --> F3[Donut + account cards]
    T4 --> F4[Service cards + suggestions]
    T5 --> F5[Map + address + branches]
    T6 --> F6[Prediction + summary + actions]
```

## Related docs

- [DATA_GRAPH.md](DATA_GRAPH.md) — how to shape graph JSON and mappings.
- [DIAGRAMS.md](DIAGRAMS.md) — additional Mermaid figures.
- [COMPONENT_REFERENCE.md](COMPONENT_REFERENCE.md) — designer properties.
