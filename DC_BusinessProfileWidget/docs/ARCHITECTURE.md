# Architecture — Business Profile Widget

Plain-language view of how data reaches the card.

---

## Overview

1. User opens an **Account** record; the platform sets **`recordId`** on the LWC.  
2. **`businessProfileWidget`** calls **`BusinessProfileWidgetController.getProfileData`** with **`fieldMappingsJson`** (built from every **Field: …** `@api` property), assembly Flow name, and optional Insight Flow names.  
3. Apex **`buildFromSoql`** queries **Account** with columns inferred from non-`flow:` mappings.  
4. **`mergeFlowIntoProfile`** runs the assembly Flow when needed and copies **`flow:`** outputs into **`BusinessProfileResult`**.  
5. **`mergeInsightFromFlow`** adds prediction and recommendations (reusing the assembly interview when API names match).  
6. **`enrichStructureTabData`** loads key contacts and related-account org chart data.  
7. Optional **geocode** runs if coordinates are missing and geocoding is enabled.  
8. **`primaryRm`** may resolve from User Id to display name.  
9. The controller returns **JSON**; the LWC **`JSON.parse`**s it and renders.

---

## Security

- Controller is **`with sharing`**.  
- Users need read access to Account and related records used in SOQL and Flow.

---

## Sequence diagram

```mermaid
sequenceDiagram
    participant Page as Account record page
    participant LWC as businessProfileWidget
    participant Apex as BusinessProfileWidgetController
    participant DB as Salesforce DB
    participant Asm as Assembly Flow
    participant Pred as Insight Flow

    Page->>LWC: recordId set
    LWC->>Apex: getProfileData(fieldMappingsJson, ...)
    Apex->>DB: SOQL Account (mapped paths)
    DB-->>Apex: Account row
    opt assembly Flow needed
        Apex->>Asm: Flow.Interview.start
        Asm-->>Apex: output variables
        Apex->>Apex: mergeFlowIntoProfile
    end
    opt insightFlowApiName
        Apex->>Pred: same or new interview
        Pred-->>Apex: prediction, recommendations
    end
    Apex->>Apex: enrichStructureTabData, geocode, resolvePrimaryRm
    Apex-->>LWC: JSON string
    LWC->>LWC: render tabs
```

---

[FLOW_GUIDE.md](FLOW_GUIDE.md) · [APEX_REFERENCE.md](APEX_REFERENCE.md)
