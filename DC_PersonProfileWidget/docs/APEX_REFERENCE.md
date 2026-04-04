# Apex reference — technical

**For:** Developers and technical admins integrating or extending the widget.

**Class:** `CustomerProfileWidgetController`  
**Sharing:** `with sharing` (respects the running user’s record access)

**Plain summary:** This class loads one **`ProfileResult`** object per request (Salesforce + optional Flows + optional address lookup), optionally calls **Einstein** for a summary string, and can run small **gauge** Flows for the three rings.

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

---

## Main data types (short)

- **`ProfileResult`** — Full payload for the LWC (fields, branches, accounts, map coords, photo URL, prediction, recommendations, …).  
- **`BranchInfo`**, **`FinancialAccountInfo`** — Rows for lists.  
- **`SignalGaugeFlowResult`** — One number for a ring.

---

## Allowed assembly map keys (logical keys)

These strings may appear as keys in `profileFlowOutputMapJson` / LWC-built maps (must match Apex allowlist):

`fullName`, `firstName`, `lastName`, `city`, `state`, `industry`, `employees`, `phone`, `email`, `website`, `revenue`, `tierSegment`, `propensityScore`, `engagementScore`, `churnScore`, `ltvScore`, `crossSellScore`, `savingsRate`, `investmentBalance`, `loanBalance`, `depositYtd`, `loanLimit`, `riskProfile`, `customerSince`, `lastInteraction`, mobile/online/paperless/alerts/wire flags, `kycStatus`, `twoFaStatus`, `street`, `zip`, branch-related keys, `nearbyBranches`, `financialAccounts`, `mapLatitude`, `mapLongitude`, `profilePhotoUrl`.

---

## Core custom field keys (for `coreCustomFieldsJson`)

See Apex constant **`CORE_CUSTOM_LOGICAL_KEYS`** in `CustomerProfileWidgetController.cls` for the exact list (tier, balances, scores, enrollments, photo URL, etc.).

---

**Business-facing docs:** [FLOW_GUIDE.md](FLOW_GUIDE.md) · [ARCHITECTURE.md](ARCHITECTURE.md)
