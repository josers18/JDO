# Component reference — Business Profile Widget

**Bundle:** `businessProfileWidget`  
**App Builder label:** Business Profile Widget  

**Targets:** `lightning__RecordPage` (**Account** only), `lightning__AppPage`, `lightning__HomePage` (App/Home expose a **reduced** property set: mostly theme, typography, logo).

---

## Flows and geocoding (record page)

| Property (`@api`) | Type | Default | Description |
|-------------------|------|---------|-------------|
| `flowApiName` | String | `''` | **Profile assembly** autolaunched Flow API name. |
| `flowRecordIdVariable` | String | `recordId` | Assembly Flow input variable for **Account Id**. |
| `insightFlowApiName` | String | `''` | **Insight** prediction Flow (optional). |
| `insightFlowRecordIdVariable` | String | `recordId` | Insight Flow record Id input. |
| `flowPredictionVariable` | String | `prediction` | Flow output for prediction text. |
| `flowRecommendationsVariable` | String | `recommendations` | Flow output for recommendations (JSON/text). |
| `geocodeBillingAddress` | Boolean | `true` | When true, Nominatim then Photon if map lat/lng missing (remote sites required). |

---

## Field mappings (record page)

Each **`field*`** property is sent in **`fieldMappingsJson`** as a logical key (see `buildFieldMappings()` in `businessProfileWidget.js`).

**Value syntax:**

- **Account SOQL path:** API name or dotted relationship path validated against **Account** (e.g. `Name`, `BillingCity`, `Owner.Name`, `Custom__c`).  
- **`flow:VariableApiName`** — read from the assembly Flow after `start()`.  
- If the value is neither valid Account path nor `flow:`, Apex may treat it as a **legacy bare Flow variable** name.

**Overview / header**

| Property | Default (demo-oriented) |
|----------|-------------------------|
| `fieldCompanyName` | `Name` |
| `fieldLegalName` | `legalName` |
| `fieldCity` | `billingCity` |
| `fieldState` | `billingState` |
| `fieldStreet` | `billingStreet` |
| `fieldZip` | `billingPostalCode` |
| `fieldIndustry` | `industry` |
| `fieldEmployees` | `numberOfEmployees` |
| `fieldWebsite` | `website` |
| `fieldProfilePhotoUrl` | `''` (optional text/URL field or `flow:`) |
| `useWebsiteFavicon` | `false` |
| `fieldFounded` | `CreatedDate` (year from Created Date; blank → auto-discovery) |
| `fieldSicCode`, `fieldSicDescription`, `fieldTaxId` | demo API names |
| `fieldTierSegment`, `fieldRevenue`, `fieldRevenueGrowth` | demo API names |
| `fieldLoanBalance`, `fieldLoanLimit`, `fieldLoanUtilization`, `fieldDepositYtd`, `fieldInvestmentBalance`, `fieldInterestExpense` | Account path or **`flow:Var`** (same pattern); liquidity waterfall **Int. expense** reads `interestExpense` from the result. **`flow:` requires Profile assembly Flow API name** on the component; Flow variables must be **Available for output** (see [FLOW_GUIDE.md](FLOW_GUIDE.md) troubleshooting). An orange hint may appear under the waterfall when configuration blocks Apex from reading Flow outputs. Default for **Field: interest expense** is blank (falls back to demo `interestExpense` SOQL). **`[Deprecated] Interest expense (legacy)`** is still honored when the primary field is blank **or** still the demo token `interestExpense` while legacy holds **`flow:Var`**. |
| `fieldCustomerSince`, `fieldPrimaryRm`, `fieldActiveProducts` | demo API names; **`activeProducts`** may be **overwritten** by a live **Financial Account** count when FinServ is present (see **Live CRM enrichments**) |
| `fieldSubsidiaries` | legacy binding; Overview subsidiary count comes from related-account graph |
| `fieldLastInteraction` | `lastInteractionDate` |
| `fieldWalletCapture` | `''` (blank → Apex tries common “last used channel” fields + label match) |

**Credit / bureau style fields**

`fieldCreditRating`, `fieldCreditRatingAgency`, `fieldCreditOutlook`, `fieldCreditScore`, `fieldMoodysRating`, D&B, Experian, Equifax, S&P, Moody’s agency, Fitch, etc. Defaults point at common `__c` demo names—change to your org’s API names or `flow:` outputs.

**Health / relationship signals (mapped fields; UI)**

These slots still populate **`BusinessProfileResult`** from SOQL or **`flow:`** for integrations, formulas, or future UI. The **Pipeline** tab does **not** render the old health-score bars; it shows **open Opportunities** from Apex (see **Live CRM enrichments** below).

`fieldRelationshipScore`, `fieldPropensityToExpand`, `fieldAttritionRisk`, `fieldWalletShare`, `fieldNps`.

**Compliance / digital**

`fieldKycStatus`, `fieldAmlStatus`, `fieldTwoFaStatus`, `fieldPaperlessEnrolled`, `fieldWireEnabled`.

**Branch / map**

| Property | Default |
|----------|---------|
| `fieldAssignedBranch` | `assignedBranch` |
| `fieldBranchDistance` | `assignedBranchDistance` |
| `fieldBranchAddress` | `assignedBranchAddress` |
| `fieldBranchHours` | `assignedBranchHours` |
| `fieldBranchStatus` | `assignedBranchOpenStatus` |
| `fieldMapLatitude` | `BillingLatitude` |
| `fieldMapLongitude` | `BillingLongitude` |

---

## Live CRM enrichments (record page; no extra App Builder wiring)

Apex **`enrichActiveFinancialAccountsAndPipeline`** runs after structure enrichment (best effort; failures are logged, not thrown to the user):

| JSON field | Meaning |
|------------|---------|
| **`pipelineOpenOpportunities`** | List of open **Opportunity** rows on the Account: `id`, `name`, `stageName`, `amount` (see **Pipeline: max open opportunities** below; default server cap **2000**, ordered by amount desc then name). Drives the **Pipeline** tab list. |
| **`activeProducts`** | When **`FinServ__FinancialAccount__c`** is queryable and an Account lookup is resolved, set to **COUNT** of active financial accounts (`FinServ__IsActive__c = true`, or `FinServ__Status__c = 'Open'` when IsActive is unavailable). Otherwise unchanged from field mapping. |
| **`activeProductsReflectsFinancialAccounts`** | `true` only when **`activeProducts`** was set from the live Financial Account count (so the LWC can show **“N active financial account(s)”** instead of **“N facilities”**). |

---

## Tabs and visibility (record page)

| Property | Default | Description |
|----------|---------|-------------|
| `cardTitle` | Business profile | |
| `overviewTabLabel` … `insightTabLabel` | Overview, **Pipeline**, Credit, Structure, Location, Insight | **`healthTabLabel`** defaults to **Pipeline** (tab id in code remains `health` for backward compatibility). |
| `showOverviewTab`, `showHealthTab`, `showCreditTab`, `showStructureTab`, `showLocationTab`, `showInsightTab` | `true` | **`showHealthTab`** controls visibility of the **Pipeline** tab. |
| `pipelineOpportunityLimit` | `0` | **`0`** (default) → load up to **2000** open opportunities (practical “all” on the Account). **1–2000** → SOQL `LIMIT` for the Pipeline list. Hard cap **2000** for payload and governor safety. |
| `showKpiStrip`, `showComplianceFlags`, `showRiskMatrix`, `showWaterfallChart` | `true` | |
| `showOrgChart`, `showKeyContacts` | `true` | Structure tab |
| `showBranchProximity` | `true` | Location |
| `showAiActions` | `true` | Insight recommendation bars |

---

## UI layout notes (record page)

| Area | Behavior |
|------|----------|
| **Overview — Company / Relationship** | **Field rows** with **`lightning-icon`** + label (utility / standard icons), matching Customer Profile styling (`wp-field-rows`, `wp-field-key--iconrow`). |
| **Pipeline** | Three columns per row: **stage** (left) · **opportunity name** (center, link to record) · **amount** (right). The Pipeline inset card is **scrollable** (`max-height` + overflow) when there are many rows. |
| **Credit — Facilities** | Same **icon + field row** pattern inside an inset card (not a plain two-column table). |
| **Structure — Unified relationships** | Same **icon + field row** pattern for linked accounts, contacts, subsidiaries, referral network. |

---

## Theme (record page; subset on App/Home)

**Visual reference:** [Widget theme catalog (PDF)](assets/widget_theme_catalog.pdf) · [THEME_CATALOG.md](../../docs/THEME_CATALOG.md).

| Property | Notes |
|----------|--------|
| `themeMode` | 42 presets (see meta `datasource`). |
| `showThemeSwitcher` | Demo-only four-button switcher. |
| `accentColor`, `warningColor`, `negativeColor`, `positiveColor` | Hex overrides. **`accentColor`:** any value you set (including the default gold) is used for tabs, links, tier chip, KPI “up” deltas, etc. **Clear** the property in App Builder to derive accent from the theme’s tab chrome (e.g. banking blues). |
| `backgroundLightenPercent` | 0–50 mixes white into solid backgrounds. |
| `textColorPrimaryOverride`, `Secondary`, `Tertiary` | Optional hex/rgba. |
| `textScalePercent` | 85–160. |
| `textEmphasis` | `default`, `medium`, `strong`. |

---

## Insight / Einstein (record page)

| Property | Notes |
|----------|--------|
| `promptTemplateId` | Einstein prompt template Id or API name. |
| `promptInputApiName` | Default `Input:Prediction_Context`. |
| `autoGenerateSummary` | Default `true`. |
| `insightRecommendationsPositiveMeansGood` | Bar coloring. |
| `insightRecommendationsRiskColor`, `GoodColor` | Hex. |
| `insightRecommendationsSectionTitle` | Default `Recommended actions`. |

---

## Deprecated / reserved

| Property | Notes |
|----------|--------|
| `profilePhotoUrl`, `profilePhotoFlowOutputVariable`, `assemblyOutProfilePhotoUrl` | Prefer **`fieldProfilePhotoUrl`** with SOQL or `flow:`. |
| `recordIdFieldName` | Reserved for Flow output binding. |

---

## Platform

| Attribute | Source |
|-----------|--------|
| `recordId` | Set automatically on **Account** record pages. |

---

[HOW_TO.md](HOW_TO.md) · [FLOW_GUIDE.md](FLOW_GUIDE.md) · [APEX_REFERENCE.md](APEX_REFERENCE.md)
