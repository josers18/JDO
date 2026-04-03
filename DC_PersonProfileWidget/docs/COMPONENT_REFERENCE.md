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
| `coreCustomFieldsJson` | String | `''` | JSON object mapping widget logical keys to Account/Contact field API names for extra CRM fields, e.g. `{"tierSegment":"Customer_Tier__c"}`. |
| `profileAssemblyFlowApiName` | String | `''` | Autolaunched flow that populates **output variables** (assignments, Get Records, subflows). Requires **at least one** output mapping via **[Asm flow output] …** fields and/or **Profile output map JSON (advanced)**. |
| `profileAssemblyFlowRecordIdVariable` | String | `recordId` | Flow input variable for the current record Id. |
| `assemblyOut*` | String | `''` | One property per widget slot, e.g. **`assemblyOutEmail`**, **`assemblyOutFullName`**. Value = Flow **output variable API name** only (not JSON). Leave blank to skip that slot. Labels in App Builder are **[Asm flow output] …**. |
| `profilePhotoFlowOutputVariable` | String | `''` | Assembly Flow **Text** output API name for avatar URL (same logical mapping as `assemblyOutProfilePhotoUrl` / JSON `profilePhotoUrl`). |
| `profileFlowOutputMapJson` | String | `''` | **Advanced.** Optional full JSON map (`{"email":"EmailVar"}`). Merged with `assemblyOut*` fields; **per-slot fields override** the same logical key. Leave blank if you only use `assemblyOut*`. |
| `geocodeBillingAddress` | Boolean | `true` (meta) | When true and map coordinates are unset, Apex geocodes billing address (Remote Sites required). |
| `flowApiName` | String | `''` | Autolaunched Flow API name for **prediction** and **recommendations** (Insight tab). |
| `flowRecordIdVariable` | String | `recordId` | Flow input variable for the current record Id. |
| `flowPredictionVariable` | String | `prediction` | Flow output for prediction text. |
| `flowRecommendationsVariable` | String | `recommendations` | Flow output (JSON string or serializable). |
| `promptTemplateId` | String | `''` | Einstein prompt template Id or API name. |
| `promptInputApiName` | String | `Input:Prediction_Context` | Template text input API name for the JSON payload. |
| `autoGenerateSummary` | Boolean | *(meta default true)* | When false, skip `generateSummary`. Unset behaves as true (LWC1503 pattern). |

`assemblyOut*` property names follow `assemblyOut` + camelCase logical key (e.g. `assemblyOutPropensityScore` for slot `propensityScore`). Slots include `fullName`, `firstName`, `lastName`, `city`, `state`, `industry`, `employees`, `phone`, `email`, `website`, `revenue`, `tierSegment`, scores, balances, `loanLimit`, `riskProfile`, `customerSince`, `lastInteraction`, enrollment flags, `kycStatus`, `twoFaStatus`, `street`, `zip`, branch fields, `nearbyBranches` (Flow **Text** JSON array of branch objects), **`financialAccounts`** (JSON array for Portfolio rows), **`mapLatitude`** / **`mapLongitude`**, **`profilePhotoUrl`**. Use the **same** `flowApiName` as the prediction flow to run one interview.

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
| `showKpiStrip`, `showEnrollmentFlags`, `showBranchProximity`, `showAiActions` |

Legacy pages may still list `showSparkline` and `[Asm flow output] Portfolio trend`; they are ignored (portfolio sparkline removed).

## AI Signals gauges (record page; partial on App/Home)

| Property | Default | Notes |
|----------|---------|--------|
| `crossSellScoreMax` | `10` | Denominator for cross-sell display. |
| `signalsDetailSectionLabel` | Cross-sell & savings | Section title below rings. |
| `signalGauge1ModelLabel` … `signalGauge3ModelLabel` | Propensity / Engagement / Churn risk | Ring labels. |
| `signalGaugeNFlowApiName` | `''` | Autolaunched Flow; blank → use profile score for that slot. |
| `signalGaugeNRecordIdVariable` | `recordId` | Flow input for record Id. |
| `signalGaugeNPredictionVariable` | `prediction` | Numeric Flow output. |
| `signalGaugeNOutputFormat` | `percent` | `percent`, `integer`, `decimal`, `currency`. |
| `signalGaugeNRingScaleMax` | `''` | Max value for full ring (decimal/currency). |
| `signalGaugeCurrencyCode` | `USD` | ISO 4217 for currency format. |
| `signalGaugeMinFractionDigits` / `MaxFractionDigits` | `0` / `2` | Decimal/currency display. |

## Insight tab (record page)

| Property | Notes |
|----------|--------|
| `insightRecommendationsPositiveMeansGood` | When true, positive recommendation % uses “good” bar color. |
| `insightRecommendationsRiskColor` / `GoodColor` | Optional hex overrides for recommendation bars. |
| `insightRecommendationsSectionTitle` | Heading above recommendation rows. |

## Services tab — suggested copy (record page)

Per-service paragraph overrides: `servicesSuggestionCopyMobileBanking`, `…OnlineBanking`, `…WireTransfers`, `…Paperless`, `…AccountAlerts`, `…KycCompliance`. Advanced: **`servicesSuggestionValueAddJson`** (map service name → body).

## Theme preset and colors

| Property | Default | Notes |
|----------|---------|--------|
| `themeMode` | `obsidian` | Preset: obsidian, midnight, graphite, ivory, dusk, slate, parchment, onyx, fog, forest, ember, sage, copper, verdant, steel, mercury, arctic, indigo, glacier (see meta datasource). |
| `showThemeSwitcher` | `false` | In-card buttons cycle a subset of presets (O/M/G/I). |

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

Applied asynchronously to the **custom element host** and **`.wp-shell`** so `--wp-*` tokens match App Builder and live record pages: `--wp-bg-primary`, `--wp-bg-secondary`, `--wp-accent`, `--wp-accent-2`, `--wp-text-primary`, `--wp-text-secondary`, `--wp-positive`, `--wp-negative`, `--wp-warning`, `--wp-gradient-1`, `--wp-gradient-2`, plus extended shell tokens (`--wp-shell-bg`, etc.) from the preset map.

## Header gradient

| Property | Default | Notes |
|----------|---------|-------|
| `headerGradientStyle` | `radial` | Picklist: `radial`, `linear`, `solid`. |
| `headerGradientColor1` | `rgba(100,80,200,0.25)` | |
| `headerGradientColor2` | `rgba(29,158,117,0.12)` | |
| `avatarRingStyle` | `gold` | `gold`, `silver`, `teal`, `custom`. |
| `profilePhotoUrl` | `''` | Static HTTPS (or org-relative) avatar URL; overrides Flow and Contact photo when set. |

## Typography (record page)

| Property | Default | Notes |
|----------|---------|--------|
| `textScalePercent` | `100` | 85–160 (%); scales `--wp-text-scale`. |
| `textEmphasis` | `default` | `default`, `medium`, `strong` — heading/tab weight. |

## Platform-injected

| Attribute | Source |
|-----------|--------|
| `recordId` | Injected on record pages; drives `loadProfile()`. |

---

[SETUP.md](SETUP.md) · [ARCHITECTURE.md](ARCHITECTURE.md)
