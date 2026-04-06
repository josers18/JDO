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
| `flowApiName` | Profile **assembly** Flow API name. **Required** whenever any entry in `fieldMappingsJson` uses a **`flow:`** token; otherwise those slots are not filled from Flow. |
| `flowRecordIdVariable` | Assembly Flow input for Account Id (default `recordId`). |
| `insightFlowApiName` | Optional Insight/prediction Flow API name. |
| `insightFlowRecordIdVariable` | Insight Flow record Id input (default `recordId`). |
| `flowPredictionVariable` | Flow output for prediction text (default `prediction`). |
| `flowRecommendationsVariable` | Flow output for recommendations (default `recommendations`). |
| `geocodeBillingAddress` | If true/null, may call Nominatim/Photon when lat/lng missing (skipped in tests). |
| `pipelineOpportunityLimit` | **Null** or **≤ 0** → load up to **2000** open **Opportunity** rows for the Pipeline tab. **1–2000** → that `LIMIT` (capped at 2000). |

Overview **Agentforce summary** Einstein calls are **not** part of `getProfileData`; the LWC invokes **`getAgentforceOverviewSummary`** in a separate request (minimal transaction, same pattern as Execute Anonymous).

**Flow token detection:** `isFlowToken` — values whose trimmed lower case starts with **`flow:`** (see class implementation).

---

## `getAgentforceOverviewSummary` (`@AuraEnabled`)

Returns a **JSON string** with **`agentforceSummary`** and **`agentforceSummaryPromptHint`**.

**Why a separate method:** Runs Einstein **outside** the heavy `getProfileData` transaction (flows, rollups, geocoding). That isolation matches a minimal Execute Anonymous script and avoids empty **`generations`** from Connect in some orgs.

**Behavior (summary):**

- **`recordId`** must be an **Account** Id (`001…`). Other prefixes return a JSON hint instead of calling Connect.
- **`sanitizeEinsteinTemplateRef`** trims the template Id / developer name and removes BOM / zero-width characters.
- **First** attempt: same **`Input:Account.Id`** + **`Input:Account`** map and **`PromptTemplateGenerationsInvocable`** as `scripts/anon_test_prompt.apex`.
- **Then** additional combinations (alternate object payloads, **`PromptBuilderPreview`**) using the App Builder–configured input names.
- The actual **`ConnectApi.EinsteinLLM.generateMessagesForPromptTemplate`** call runs through a **`private without sharing`** inner bridge class to avoid odd interaction with **`with sharing`** on the controller.
- When **`generations`** is empty, **`agentforceSummaryPromptHint`** may include a **truncated `JSON.serialize`** of the Connect output for admin diagnosis (permissions, template state, etc.).

| Parameter | Purpose |
|-----------|---------|
| `recordId` | **Account** Id. |
| `agentforceSummaryPromptTemplateId` | Template Id or developer name (sanitized). |
| `agentforceSummaryPromptInputApiName` | Prompt Builder input (default `Input:Account.Id`); `Input:Account` is also supported — Apex still sends both **`.Id`** and object keys derived from this setting. |

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
| **`pipelineOpenOpportunities`** | `List<PipelineOpportunityRow>` — open **Opportunity** rows for this Account (`id`, `name`, `stageName`, `amount`). Populated in **`enrichActiveFinancialAccountsAndPipeline`** when Opportunity fields are accessible. Row count follows **`pipelineOpportunityLimit`** on **`getProfileData`** (see parameter table above). |
| **`activeProducts`** | May be set from **`COUNT()`** of active **`FinServ__FinancialAccount__c`** rows for the Account when that object and an Account lookup field resolve; otherwise from field mapping as before. |
| **`activeProductsReflectsFinancialAccounts`** | `true` when **`activeProducts`** came from the live Financial Account query (not field-mapping only). |
| **`assemblyFlowHint`** | Optional **String**. Set when **`flow:`** mappings cannot be applied or **interest expense** could not be read from the assembly interview after `start()` (missing assembly Flow API name, flow fault, variable not **Available for output**, subflow-only assignment, etc.). The LWC surfaces this under **Liquidity waterfall**. |
| **`agentforceSummary`** | Long text for the Overview **Agentforce summary** card; from **`fieldAgentforceSummary`** mapping (SOQL or **`flow:`**), **or** overwritten when **Agentforce summary** Einstein generation succeeds on load. |
| **`agentforceSummaryPromptHint`** | Optional. Set when **`getAgentforceOverviewSummary`** returns no text or throws; includes admin-oriented diagnostics (may include a truncated serialized Connect response when generations are empty). |

Numeric Flow outputs use **`decVal`**, including plain **Decimal** / **Double** / **Integer** values and some **map-shaped** currency payloads (keys such as `amount` / `value`).

See inner classes **`PipelineOpportunityRow`** and **`BusinessProfileResult`** in `BusinessProfileWidgetController.cls`.

---

[COMPONENT_REFERENCE.md](COMPONENT_REFERENCE.md) · [FLOW_GUIDE.md](FLOW_GUIDE.md)
