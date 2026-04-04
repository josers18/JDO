# How the widget works — Customer Profile Widget

This page explains **how data gets to the card** in terms a business reader can follow. Technical names are included where they match App Builder or code.

---

## Plain-language overview

1. User opens an **Account** or **Contact** record. Salesforce tells the widget **which record** it is.  
2. The widget asks the server (**CustomerProfileWidgetController**) for a **profile package** for that record.  
3. The server **reads Salesforce** (standard, optional custom fields, and any **assembly slot** mapped to a **Contact/Account field path** in **[Asm flow output]** / JSON / core custom JSON).  
4. **If a profile assembly Flow is required** (mappings use **`flow:`/`flows:`**, core custom flow tokens, legacy bare Flow names, or the prediction Flow shares the same API name), the server runs that autolaunched Flow and merges outputs; **empty** slots are still filled from the SOQL layer. **SOQL-only** assembly mappings skip the assembly Flow when prediction uses a different Flow.  
5. **If you configured an Insight Flow**, the server adds **prediction** and **recommendation** text to that package (or reuses the same Flow run when API names match).  
6. Apex **enriches the Structure tab** (related accounts, org chart nodes, key contacts) using **AccountContactRelation**, **Person Account** pivot when the page is an Account, and account–account junctions where available (`with sharing`).  
7. The widget **draws the card**. Short delay, then small **animations** on signal bars.  
8. **If you configured Einstein**, the widget may ask for a **short AI summary** for the Insight tab.

You do **not** send a special “graph JSON” blob for the profile Flow. Each piece of data is a normal Flow **output variable** (text, number, etc.).

---

## Technical walkthrough (numbered)

1. The Lightning component receives **`recordId`** from the record page.  
2. It calls **`CustomerProfileWidgetController.getProfileData`** with your Flow and field settings.  
3. Apex runs **SOQL** for Account or Contact, including columns needed for **core custom** fields and **assembly slots** resolved to field paths.  
4. If the **assembly Flow** must run (see [FLOW_GUIDE.md](FLOW_GUIDE.md)), Apex starts it and copies **`flow:`/`flows:`** (and legacy) outputs into `ProfileResult`, then **`mergeEnrichFull`** fills remaining blanks from the SOQL layer. Slots bound only to SOQL are applied in the same query (`applyProfileAssemblyFromSoql`).  
5. If a **prediction Flow** is configured, Apex merges **prediction** and **recommendations**. If its API name is the **same** as the assembly Flow, **one** Flow run serves both.  
6. **Structure tab** data is merged on the server (`enrichStructureTabForCustomer`).  
7. The widget renders. After about 400 ms it runs **`animateBars()`** on signal bars.  
8. If **`promptTemplateId`** is set and auto-summary is not turned off, the widget calls **`generateSummary`** (Einstein).

---

## Where each part of the data comes from

| Source | When it runs | What it provides |
|--------|----------------|------------------|
| **Profile assembly Flow** | Flow API name set **and** at least one mapping needs Flow, **or** same API as prediction Flow | Values for **`flow:`/`flows:`** / legacy slots; SOQL fills gaps |
| **Salesforce only** | No Flow tokens and no shared prediction/assembly run | Standard + custom + assembly slots mapped as field paths only |
| **Insight / prediction Flow** | You set **Autolaunched flow API name (predictions)** | Headline and recommendations on Insight |

---

## Security (short)

- The controller runs with **user sharing rules** (`with sharing`).  
- Users must have the **Customer_Profile_Widget_User** permission set (Apex access).

---

## Diagram: request sequence

```mermaid
sequenceDiagram
    participant Page as Record page
    participant LWC as Customer Profile Widget
    participant Apex as CustomerProfileWidgetController
    participant DB as Salesforce DB
    participant Asm as Assembly Flow
    participant Pred as Prediction Flow
    participant E as Einstein Prompt Template

    Page->>LWC: recordId set
    LWC->>Apex: getProfileData(recordId, flows, maps...)
    Apex->>DB: SOQL Account or Contact by Id
    DB-->>Apex: row
    opt profile assembly interview runs
        Apex->>Asm: Flow.Interview.start
        Asm-->>Apex: output variables
        Apex->>Apex: applyCoreCustomFlowTokenMappings + applyProfileOutputsFromFlow + mergeEnrichFull
    end
    Apex->>Apex: enrichStructureTabForCustomer
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

---

## Diagram: screen layout

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
        T5[Structure]
        T6[Location]
        T7[Insight]
    end
    Header --> Tabs
    T1 --> F1[Field rows]
    T2 --> F2[Rings + bar chart]
    T3 --> F3[Donut + account cards]
    T4 --> F4[Service cards + suggestions]
    T5 --> F5[Org chart + key contacts]
    T6 --> F6[Map + address + branches]
    T7 --> F7[Prediction + summary + actions]
```

---

**More diagrams:** [DIAGRAMS.md](DIAGRAMS.md) · **Properties:** [COMPONENT_REFERENCE.md](COMPONENT_REFERENCE.md)
