# Apex reference — Business Profile Widget

**Class:** `BusinessProfileWidgetController`  
**Sharing:** `with sharing`

---

## `getProfileData` (`@AuraEnabled`)

Returns a **JSON string** representing **`BusinessProfileResult`** (the LWC parses it).

| Parameter | Purpose |
|-----------|---------|
| `recordId` | **Account** Id (required; Aura throws if blank). |
| `fieldMappingsJson` | JSON object: logical keys → Account field path or `flow:VarName`. Built by the LWC from **Field: …** properties. |
| `flowApiName` | Profile **assembly** Flow API name. |
| `flowRecordIdVariable` | Assembly Flow input for Account Id (default `recordId`). |
| `insightFlowApiName` | Optional Insight/prediction Flow API name. |
| `insightFlowRecordIdVariable` | Insight Flow record Id input (default `recordId`). |
| `flowPredictionVariable` | Flow output for prediction text (default `prediction`). |
| `flowRecommendationsVariable` | Flow output for recommendations (default `recommendations`). |
| `geocodeBillingAddress` | If true/null, may call Nominatim/Photon when lat/lng missing (skipped in tests). |

**Flow token detection:** `isFlowToken` — values whose trimmed lower case starts with **`flow:`** (see class implementation).

---

## `generateSummary` (`@AuraEnabled`)

Einstein prompt template invocation. Payload JSON includes:

- `prediction`  
- `predictionType` = **`business_profile`**  
- `recommendations`  

Throws **`AuraHandledException`** on failure.

| Parameter | Purpose |
|-----------|---------|
| `promptTemplateId` | Template Id or API name. |
| `promptInputApiName` | Template text input (default `Input:Prediction_Context`). |
| `predictionLabel` | Maps to `prediction` in payload. |
| `recommendationsJson` | Maps to `recommendations` (default `[]`). |

---

## Main result type

**`BusinessProfileResult`** — serialized to JSON for the LWC. Includes company overview fields, credit/bureau-style metrics, structure (key contacts, org chart children), map coordinates, `predictionLabel`, `recommendationsJson`, subsidiaries count, and:

| Member | Notes |
|--------|--------|
| **`pipelineOpenOpportunities`** | `List<PipelineOpportunityRow>` — open **Opportunity** rows for this Account (`id`, `name`, `stageName`, `amount`). Populated in **`enrichActiveFinancialAccountsAndPipeline`** when Opportunity fields are accessible. |
| **`activeProducts`** | May be set from **`COUNT()`** of active **`FinServ__FinancialAccount__c`** rows for the Account when that object and an Account lookup field resolve; otherwise from field mapping as before. |
| **`activeProductsReflectsFinancialAccounts`** | `true` when **`activeProducts`** came from the live Financial Account query (not field-mapping only). |

See inner classes **`PipelineOpportunityRow`** and **`BusinessProfileResult`** in `BusinessProfileWidgetController.cls`.

---

[COMPONENT_REFERENCE.md](COMPONENT_REFERENCE.md) · [FLOW_GUIDE.md](FLOW_GUIDE.md)
