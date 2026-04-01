# Component reference — Customer Profile Widget

**Bundle name:** `customerProfileWidget`  
**App Builder label:** Customer Profile Widget  

Properties are grouped below as in the designer. On **Record** pages, labels use prefixes like `[Data source]` because `propertyGroup` is not supported on all orgs (metadata is flattened).

## Targets

| Target | Objects / notes |
|--------|------------------|
| `lightning__RecordPage` | **Account**, **Contact** |
| `lightning__AppPage` | Data source + card labels only |
| `lightning__HomePage` | Data source + card labels only |

## Data source

| Property (`@api`) | Type | Default | Description |
|-------------------|------|---------|-------------|
| `graphApiName` | String | `''` | Data Graph developer API name. **Cannot** be named `dataGraphApiName` (LWC1503). Blank = skip graph callout, SOQL only. |
| `recordIdFieldName` | String | `accountId__c` | Reserved / hint; URL still uses page `recordId` today. |
| `flowApiName` | String | `''` | Autolaunched Flow API name. |
| `flowRecordIdVariable` | String | `recordId` | Flow input variable for the current record Id. |
| `flowPredictionVariable` | String | `prediction` | Flow output for prediction text. |
| `flowRecommendationsVariable` | String | `recommendations` | Flow output (JSON string or serializable). |
| `promptTemplateId` | String | `''` | Einstein prompt template Id or API name. |
| `promptInputApiName` | String | `Input:Prediction_Context` | Template text input API name for the JSON payload. |
| `autoGenerateSummary` | Boolean | *(meta default true)* | When false, skip `generateSummary`. Unset behaves as true (LWC1503 pattern). |

## Card labels

| Property | Default |
|----------|---------|
| `cardTitle` | Client profile |
| `overviewTabLabel` | Overview |
| `signalsTabLabel` | AI Signals |
| `portfolioTabLabel` | Portfolio |
| `servicesTabLabel` | Services |
| `locationTabLabel` | Location |
| `insightTabLabel` | Insight |

## Visible sections (Boolean)

Unset = visible. Set **false** to hide.

| Property |
|----------|
| `showOverviewTab`, `showSignalsTab`, `showPortfolioTab`, `showServicesTab`, `showLocationTab`, `showInsightTab` |
| `showKpiStrip`, `showEnrollmentFlags`, `showSparkline`, `showBranchProximity`, `showAiActions` |

## Theme colors (String, hex or CSS color)

| Property | Default |
|----------|---------|
| `backgroundPrimary` | `#0b0c14` |
| `backgroundSecondary` | `#0f1020` |
| `accentColor` | `#d4b469` |
| `accentColorSecondary` | `#1d9e75` |
| `textPrimary` | `#f0ebe0` |
| `textSecondary` | `rgba(240,235,224,0.4)` |
| `positiveColor` | `#5dcaa5` |
| `negativeColor` | `#d4537e` |
| `warningColor` | `#e09840` |

Applied in `connectedCallback` to host CSS variables: `--wp-bg-primary`, `--wp-bg-secondary`, `--wp-accent`, `--wp-accent-2`, `--wp-text-primary`, `--wp-text-secondary`, `--wp-positive`, `--wp-negative`, `--wp-warning`, `--wp-gradient-1`, `--wp-gradient-2`.

## Header gradient

| Property | Default | Notes |
|----------|---------|-------|
| `headerGradientStyle` | `radial` | Picklist: `radial`, `linear`, `solid`. |
| `headerGradientColor1` | `rgba(100,80,200,0.25)` | |
| `headerGradientColor2` | `rgba(29,158,117,0.12)` | |
| `avatarRingStyle` | `gold` | `gold`, `silver`, `teal`, `custom`. |

## Field paths (String)

Each value is a **dot path** into the graph JSON root (after `record`/`data` unwrap). See [DATA_GRAPH.md](DATA_GRAPH.md).

| Property | Default path |
|----------|----------------|
| `fieldFirstName` | `firstName` |
| `fieldLastName` | `lastName` |
| `fieldCity` | `mailingCity` |
| `fieldState` | `mailingState` |
| `fieldIndustry` | `industry` |
| `fieldEmployees` | `numberOfEmployees` |
| `fieldPhone` | `phone` |
| `fieldEmail` | `email` |
| `fieldWebsite` | `website` |
| `fieldRevenue` | `annualRevenue` |
| `fieldTierSegment` | `customerTier` |
| `fieldPropensityScore` | `propensityScore` |
| `fieldEngagementScore` | `engagementScore` |
| `fieldChurnScore` | `churnScore` |
| `fieldLtvScore` | `lifetimeValueScore` |
| `fieldInvestmentBalance` | `investmentBalance` |
| `fieldLoanBalance` | `loanBalance` |
| `fieldDepositYtd` | `depositYtd` |
| `fieldLoanLimit` | `loanLimit` |
| `fieldRiskProfile` | `riskProfile` |
| `fieldCustomerSince` | `customerSince` |
| `fieldLastInteraction` | `lastInteractionDate` |
| `fieldMobileEnrolled` | `mobileEnrolled` |
| `fieldOnlineEnrolled` | `onlineEnrolled` |
| `fieldKycStatus` | `kycStatus` |
| `fieldTwoFaStatus` | `twoFaStatus` |
| `fieldPaperlessEnrolled` | `paperlessEnrolled` |
| `fieldAlertsEnrolled` | `alertsEnrolled` |
| `fieldWireEnabled` | `wireTransferEnabled` |
| `fieldStreet` | `billingStreet` |
| `fieldZip` | `billingPostalCode` |
| `fieldAssignedBranch` | `assignedBranch` |
| `fieldBranchDistance` | `assignedBranchDistance` |
| `fieldNearbyBranches` | `nearbyBranches` |

## Platform-injected

| Attribute | Source |
|-----------|--------|
| `recordId` | Injected on record pages; drives `loadProfile()`. |

---

[SETUP.md](SETUP.md) · [ARCHITECTURE.md](ARCHITECTURE.md)
