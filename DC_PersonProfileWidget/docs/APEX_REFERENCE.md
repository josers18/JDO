# Apex reference — `CustomerProfileWidgetController`

**Class:** `CustomerProfileWidgetController`  
**Sharing:** `with sharing`  
**Purpose:** Load `ProfileResult` for the LWC (SOQL + optional Flows + geocode), optional Einstein summary, optional per-gauge Flow inference.

---

## `@AuraEnabled` methods

### `getProfileData(...)`

Returns a **`ProfileResult`** for the given record and configuration.

| Parameter | Type | Description |
|-----------|------|-------------|
| `recordId` | String | Account or Contact Id; blank returns an empty shell (no SOQL). |
| `flowApiName` | String | Prediction Flow API name (Insight). |
| `flowRecordIdVariable` | String | Input variable name for record Id on prediction Flow. |
| `flowPredictionVariable` | String | Output variable for prediction text. |
| `flowRecommendationsVariable` | String | Output for recommendations (JSON string or serializable). |
| `coreCustomFieldsJson` | String | Map of logical keys → field API names for extra SOQL columns. |
| `profileAssemblyFlowApiName` | String | Assembly Flow API name. |
| `profileAssemblyFlowRecordIdVariable` | String | Assembly Flow input for record Id. |
| `profileFlowOutputMapJson` | String | JSON map logical key → output variable API name (merged with LWC-built map from per-slot props). |
| `geocodeBillingAddress` | Boolean | When null/true, Apex may geocode billing address if lat/long missing (no callouts in tests). |

**Assembly Flow runs** only when `recordId` is valid, assembly API name is set, and the **combined** output map is non-empty.

### `generateSummary(...)`

Calls **Einstein Prompt Template** via `ConnectApi.EinsteinLLM.generateMessagesForPromptTemplate`.

| Parameter | Description |
|-----------|-------------|
| `promptTemplateId` | Template Id or API name. |
| `promptInputApiName` | Text input API name (default `Input:Prediction_Context`). |
| `predictionLabel` | Serialized into JSON as `prediction`. |
| `recommendationsJson` | Serialized as `recommendations` (default `[]` if null). |

Returns generated **text** or `null`; failures throw `AuraHandledException`.

### `runSignalGaugeFlow(...)`

Runs a separate autolaunched Flow for **one** AI Signals gauge.

| Parameter | Description |
|-----------|-------------|
| `flowApiName` | Flow API name. |
| `recordId` | Current record Id. |
| `recordIdVariableName` | Flow input variable for Id. |
| `predictionVariableName` | Flow output variable holding a numeric value. |

Returns **`SignalGaugeFlowResult`** with `prediction` (Decimal).

---

## Inner types (selected)

### `ProfileResult`

Aura-enabled DTO bound to the LWC. Includes standard profile fields, billing address, `nearbyBranches`, `financialAccounts`, `mapLatitude` / `mapLongitude`, `profilePhotoUrl`, `predictionLabel`, `recommendationsJson`, and related score/balance/enrollment fields.

### `BranchInfo`

`name`, `distance`, `address`, `hours`, `status`, `assigned`.

### `FinancialAccountInfo`

`type`, `accountNumber`, `balance`, `delta`, `deltaPositive`.

### `SignalGaugeFlowResult`

`prediction` (Decimal).

---

## Assembly output logical keys

Keys allowed in `profileFlowOutputMapJson` / LWC assembly map (must match Apex `PROFILE_ASSEMBLY_OUTPUT_KEYS`):

`fullName`, `firstName`, `lastName`, `city`, `state`, `industry`, `employees`, `phone`, `email`, `website`, `revenue`, `tierSegment`, `propensityScore`, `engagementScore`, `churnScore`, `ltvScore`, `crossSellScore`, `savingsRate`, `investmentBalance`, `loanBalance`, `depositYtd`, `loanLimit`, `riskProfile`, `customerSince`, `lastInteraction`, enrollment flags, `kycStatus`, `twoFaStatus`, `street`, `zip`, branch fields, `nearbyBranches`, `financialAccounts`, `mapLatitude`, `mapLongitude`, `profilePhotoUrl`.

---

## Core custom field logical keys

Allowed keys in `coreCustomFieldsJson` for SOQL enrichment (see Apex `CORE_CUSTOM_LOGICAL_KEYS`): tier, balances, scores, risk, dates, enrollments, KYC/2FA, `profilePhotoUrl`, etc.

---

[ARCHITECTURE.md](ARCHITECTURE.md) · [FLOW_GUIDE.md](FLOW_GUIDE.md)
