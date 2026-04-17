# Apex reference — technical

**For:** Developers and technical admins integrating or extending the widget.

**Class:** `CustomerProfileWidgetController`  
**Sharing:** `with sharing` (respects the running user’s record access)

**Plain summary:** This class loads one **`ProfileResult`** object per request (Salesforce + optional Flows + optional address lookup), optionally calls **Einstein** for the **Insight** tab summary (`generateSummary`), optionally merges an **Overview Agentforce** narrative via **`getAgentforceOverviewSummary`** (separate transaction), optionally invokes an **Overview Unified relationships** **`@InvocableMethod`** via **`getUnifiedRelationshipsQueryJson`** (separate transaction, **`Invocable.Action`**), and can run small **gauge** Flows for the three rings.

---

## Methods callable from the widget (`@AuraEnabled`)

### `getProfileData(...)`

Returns **`ProfileResult`** for the open record.

| Parameter | Purpose |
|-----------|---------|
| `recordId` | Account or Contact Id; blank → empty profile shell. |
| `flowApiName` | Insight **prediction** Flow API name. |
| `flowRecordIdVariable` | Prediction Flow input name for record Id. |
| `flowPredictionVariable` | Prediction Flow output for headline text. |
| `flowRecommendationsVariable` | Prediction Flow output for recommendations (text/JSON). |
| `coreCustomFieldsJson` | Maps **logical keys** → **field API name** or **`flow:`/`flows:`** + variable name (Flow values merged after assembly interview). |
| `profileAssemblyFlowApiName` | Profile assembly Flow API name. |
| `profileAssemblyFlowRecordIdVariable` | Assembly Flow input for record Id. |
| `profileFlowOutputMapJson` | JSON map merged with LWC **[Asm flow output]** props: each value is a **field path**, **`flow:`/`flows:`** variable, or legacy bare Flow name. |
| `geocodeBillingAddress` | If true/null and coordinates missing, may call external geocoders (not in unit tests). |

**Assembly Flow** runs when the name is set **and** there is at least one mapping that **requires** Flow (**`flow:`/`flows:`**, core custom flow token, or non-validating legacy name), **or** the prediction Flow shares the same API name. **SOQL-only** assembly maps skip the assembly interview otherwise. SOQL-bound slots are loaded in **`buildFallbackFromSoql`** via **`applyProfileAssemblyFromSoql`**.

### `generateSummary(...)`

Runs **Einstein Prompt Template**; returns **text** or `null`; failures throw **`AuraHandledException`**.

| Parameter | Role |
|-----------|------|
| `promptTemplateId` | Template Id or API name. |
| `promptInputApiName` | Template text input API name (default `Input:Prediction_Context`). |
| `predictionLabel` | Becomes `prediction` in the JSON payload. |
| `recommendationsJson` | Becomes `recommendations` in the payload (default `[]`). |

### `runSignalGaugeFlow(...)`

Runs one **autolaunched** Flow for a single gauge; returns **`SignalGaugeFlowResult`** with **`prediction`** (Decimal).

| Parameter | Role |
|-----------|------|
| `flowApiName` | Flow API name. |
| `recordId` | Record Id. |
| `recordIdVariableName` | Flow input variable for Id. |
| `predictionVariableName` | Flow output variable (numeric). |

### `getAgentforceOverviewSummary(...)` (`@AuraEnabled`)

Returns a **JSON string** with **`agentforceSummary`** and **`agentforceSummaryPromptHint`**. Used only for the **Overview** tab inset (above **Contact**); **not** mixed into **`getProfileData`** (same pattern as **Business Profile Widget** — keeps Connect / Einstein out of the heavy profile transaction).

| Parameter | Role |
|-----------|------|
| `recordId` | **Account** or **Contact** Id. Blank → **`AuraHandledException`**. Invalid Id → **`AuraHandledException`**. |
| `agentforceSummaryPromptTemplateId` | Template Id or developer name (sanitized). **Blank** → returns JSON with both fields empty / null (no Connect call). |
| `agentforceSummaryPromptInputApiName` | Prompt input API name for the Id and related payload; blank defaults by record type (**`Input:Contact.Id`** vs **`Input:Account.Id`**). See [COMPONENT_REFERENCE.md](COMPONENT_REFERENCE.md). |

**Object guard:** If **`recordId`** is not **Account** or **Contact**, the method returns JSON with **`agentforceSummary`** null and a **`agentforceSummaryPromptHint`** explaining that only **001** / **003** pages are supported (no exception).

**Implementation notes:** **`mergeAgentforceSummaryFromPromptTemplate`** builds dual **Id + object** inputs, tries **anonymous-parity** combinations first, then **`PromptBuilderPreview`** / Connect **`generateMessagesForPromptTemplate`**. An inner **`EinsteinOverviewConnectBridge`** class runs **`without sharing`** for the Connect call only (bridge pattern). When **`generations`** is empty, **`agentforceSummaryPromptHint`** may include **truncated** serialized Connect output for admin diagnosis.

The LWC merges the returned strings into in-memory **`profileData`** after **`getProfileData`** completes.

### `getUnifiedRelationshipsQueryJson(...)` (`@AuraEnabled`)

Invokes a **custom Apex invocable** (type **`apex`**, **class API name only**) for the **Overview — Unified relationships** table. Runs in its **own** request after profile load (and after optional **`getAgentforceOverviewSummary`**).

| Parameter | Role |
|-----------|------|
| `recordId` | **Account** or **Contact** Id. Blank → **`AuraHandledException`**. Invalid Id → **`AuraHandledException`**. |
| `invocableApexClassApiName` | e.g. **`DC_UnifiedAccounts`**. **Blank** → returns **`UnifiedRelationshipsApexResult`** with **`queryResultJson`** null (no invocation). Validated with **`isSafeInvocableConfigurationToken`** (letters, digits, underscore; must start with a letter — allows managed-style **`Ns__Class`**). |
| `invocableRecordIdInputApiName` | Invocable input variable API name; default **`id`**. Same validation as class name. |
| `invocableJsonOutputApiName` | Invocable output variable API name; default **`queryResultJSON`**. Matched case-insensitively if the platform returns different casing. |

**Returns** **`UnifiedRelationshipsApexResult`** with **`queryResultJson`** as **String** when the action returns **`String`**, otherwise **`JSON.serialize`** of the output object (e.g. **List** rows from Data Cloud connectors).

**Errors:** Failed **`Invocable.Action`** invocations throw **`AuraHandledException`** with the platform error message when available.

---

## Main data types (short)

- **`ProfileResult`** — Full payload for the LWC (fields, branches, accounts, map coords, photo URL, prediction, recommendations, **`agentforceSummary`**, **`agentforceSummaryPromptHint`**, …). Overview Einstein fields are normally filled by the **second** LWC call; they may be null when the template Id is blank. For **Account** records, **`enrichOpenOppAndCaseRollups`** may set **`openCasesCount`** and **`openOpportunitiesAmount`** (open opportunities on the Account, including via **Opportunity Contact Role**, subject to object and field access).  
- **`BranchInfo`**, **`FinancialAccountInfo`** — Rows for lists.  
- **`SignalGaugeFlowResult`** — One number for a ring.  
- **`UnifiedRelationshipsApexResult`** — Wrapper for **`queryResultJson`** string from **`getUnifiedRelationshipsQueryJson`**.

---

## Allowed assembly map keys (logical keys)

These strings may appear as keys in `profileFlowOutputMapJson` / LWC-built maps (must match Apex allowlist):

`fullName`, `firstName`, `lastName`, `city`, `state`, `industry`, `employees`, `phone`, `email`, `website`, `revenue`, `tierSegment`, `propensityScore`, `engagementScore`, `churnScore`, `ltvScore`, `crossSellScore`, `savingsRate`, `investmentBalance`, `loanBalance`, `depositYtd`, `loanLimit`, `riskProfile`, `customerSince`, `lastInteraction`, mobile/online/paperless/alerts/wire flags, `kycStatus`, `twoFaStatus`, `street`, `zip`, branch-related keys, `nearbyBranches`, `financialAccounts`, `mapLatitude`, `mapLongitude`, `profilePhotoUrl`.

---

## Core custom field keys (for `coreCustomFieldsJson`)

See Apex constant **`CORE_CUSTOM_LOGICAL_KEYS`** in `CustomerProfileWidgetController.cls` for the exact list (tier, balances, scores, enrollments, photo URL, etc.).

---

**Business-facing docs:** [FLOW_GUIDE.md](FLOW_GUIDE.md) · [ARCHITECTURE.md](ARCHITECTURE.md)
