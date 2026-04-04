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
| `fieldLoanBalance`, `fieldLoanLimit`, `fieldLoanUtilization`, `fieldDepositYtd`, `fieldInvestmentBalance`, `fieldInterestExpense` | demo API names |
| `fieldCustomerSince`, `fieldPrimaryRm`, `fieldActiveProducts` | demo API names |
| `fieldSubsidiaries` | legacy binding; Overview subsidiary count comes from related-account graph |
| `fieldLastInteraction` | `lastInteractionDate` |
| `fieldWalletCapture` | `''` (blank → Apex tries common “last used channel” fields + label match) |

**Credit / bureau style fields**

`fieldCreditRating`, `fieldCreditRatingAgency`, `fieldCreditOutlook`, `fieldCreditScore`, `fieldMoodysRating`, D&B, Experian, Equifax, S&P, Moody’s agency, Fitch, etc. Defaults point at common `__c` demo names—change to your org’s API names or `flow:` outputs.

**Health / relationship signals**

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

## Tabs and visibility (record page)

| Property | Default | Description |
|----------|---------|-------------|
| `cardTitle` | Business profile | |
| `overviewTabLabel` … `insightTabLabel` | Overview, Health, Credit, Structure, Location, Insight | |
| `showOverviewTab`, `showHealthTab`, `showCreditTab`, `showStructureTab`, `showLocationTab`, `showInsightTab` | `true` | |
| `showKpiStrip`, `showComplianceFlags`, `showRiskMatrix`, `showWaterfallChart` | `true` | |
| `showOrgChart`, `showKeyContacts` | `true` | Structure tab |
| `showBranchProximity` | `true` | Location |
| `showAiActions` | `true` | Insight recommendation bars |

---

## Theme (record page; subset on App/Home)

| Property | Notes |
|----------|--------|
| `themeMode` | 42 presets (see meta `datasource`). |
| `showThemeSwitcher` | Demo-only four-button switcher. |
| `accentColor`, `warningColor`, `negativeColor`, `positiveColor` | Hex overrides. |
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
