# Component reference — Customer Profile Widget

**Bundle name:** `customerProfileWidget`  
**App Builder label:** Customer Profile Widget  

**Who should read this:** Admins configuring the card in **Lightning App Builder**. Step-by-step tasks are in **[HOW_TO.md](HOW_TO.md)**; this page is the **full field list** (including technical `@api` names for developers and support).

**Note on labels:** On **record** pages, properties are grouped by **text prefixes** like `[Data source]` and `[Asm flow output]` because some orgs do not support grouped property panels in metadata.

## Targets

| Target | Objects / notes |
|--------|------------------|
| `lightning__RecordPage` | **Account**, **Contact** |
| `lightning__AppPage` | Data source + card labels only |
| `lightning__HomePage` | Data source + card labels only |

## Data source

Each **[Asm flow output] …** slot, **Profile output map JSON** value, and **`coreCustomFieldsJson`** value can be either:

1. **CRM field path** — validated on **Account** (record is Account) or **Contact** (record is Contact), including dotted paths on Contact such as **`Account.Industry`**.  
2. **`flow:VariableApiName`** or **`flows:VariableApiName`** — read from the **profile assembly Flow** after it runs.  
3. **Legacy:** a string that is **not** a valid field path is still treated as a **Flow output variable API name** (backward compatible with pages configured before SOQL paths were supported).

The **assembly Flow runs** when its API name is set **and** at least one mapping needs Flow (**`flow:`/`flows:`**, core custom flow token, or legacy bare name), **or** the **prediction** Flow uses the **same** API name (one interview for both). **SOQL-only** assembly maps do **not** require the assembly Flow. See **[FLOW_GUIDE.md](FLOW_GUIDE.md)** and **[APEX_REFERENCE.md](APEX_REFERENCE.md)**.

| Property (`@api`) | Type | Default | Description |
|-------------------|------|---------|-------------|
| `coreCustomFieldsJson` | String | `''` | JSON map: logical key → **field API name** or **`flow:`/`flows:`** + variable name, e.g. `{"tierSegment":"Customer_Tier__c","riskProfile":"flow:Risk_Out"}`. |
| `profileAssemblyFlowApiName` | String | `''` | Autolaunched flow for **`flow:`/`flows:`** (and legacy bare) slot mappings and optional reuse with prediction Flow. |
| `profileAssemblyFlowRecordIdVariable` | String | `recordId` | Flow input variable for the current record Id. |
| `assemblyOut*` | String | `''` | Per-slot mapping: **field path**, **`flow:Var`**, **`flows:Var`**, or legacy Flow variable name. Labels: **[Asm flow output] …**. |
| `profilePhotoFlowOutputVariable` | String | `''` | Assembly Flow **Text** output for avatar URL (same slot as `assemblyOutProfilePhotoUrl` / JSON `profilePhotoUrl`). Prefer **`flow:`** in **`assemblyOutProfilePhotoUrl`** or core JSON for consistency. |
| `profileFlowOutputMapJson` | String | `''` | **Advanced.** JSON map merged with `assemblyOut*`; per-slot properties **override** keys. Values: SOQL path or **`flow:`/`flows:`** (see [mixed sample](samples/profile-output-map-mixed.sample.json)). |
| `geocodeBillingAddress` | Boolean | `true` (meta) | When true and map coordinates are unset, Apex geocodes billing address (Remote Sites required). |
| `flowApiName` | String | `''` | Autolaunched Flow API name for **prediction** and **recommendations** (Insight tab). |
| `flowRecordIdVariable` | String | `recordId` | Flow input variable for the current record Id. |
| `flowPredictionVariable` | String | `prediction` | Flow output for prediction text. |
| `flowRecommendationsVariable` | String | `recommendations` | Flow output (JSON string or serializable). |
| `promptTemplateId` | String | `''` | Einstein prompt template Id or API name. |
| `promptInputApiName` | String | `Input:Prediction_Context` | Template text input API name for the JSON payload. |
| `autoGenerateSummary` | Boolean | *(default on)* | When **false**, the widget does **not** call Einstein for the **Insight** tab summary (`generateSummary`). When unset, summary generation stays **on**. |
| `agentforceSummaryPromptTemplateId` | String | `''` | Optional **Einstein prompt template** for the **Overview** **Agentforce summary** inset (**above Contact**). When set and **Auto-generate Agentforce summary** is not false, the LWC calls **`getAgentforceOverviewSummary`** after **`getProfileData`** in a **separate** Apex request (same isolation pattern as the Business Profile Widget). **Contact** records: Apex sends **`Input:Contact.Id`** (string) and **`Input:Contact`** (record-style map). **Account** records: **`Input:Account.Id`** + **`Input:Account`**. Tries an **anonymous-parity** payload first so common Record Snapshot templates work even if the input API name is mis-set. |
| `agentforceSummaryPromptInputApiName` | String | `''` | Prompt Builder input for the **Id** string. **Blank** → **`Input:Contact.Id`** when the page record is **Contact** (prefix **003**), else **`Input:Account.Id`** for **Account** (**001**). You may set **`Input:Contact`** or **`Input:Account`**; Apex still supplies **`.Id`** and object keys derived from that choice. Template Id / developer name is sanitized (BOM and zero-width characters stripped). |
| `autoGenerateAgentforceSummary` | Boolean | `true` | When **false**, skips **`getAgentforceOverviewSummary`** on load even if **Agentforce summary: prompt template ID** is set. |
| `showAgentforceSummary` | Boolean | `true` | When **false**, hides the Overview Agentforce block (Overview tab must still be visible). |
| `agentforceSummarySectionLabel` | String | `Agentforce summary` | Section title for the Overview inset above **Contact**. |
| `unifiedRelationshipsInvocableApexClass` | String | `''` | **Overview — Unified relationships:** Apex class API name for an **`@InvocableMethod`** action (e.g. **`DC_UnifiedAccounts`**). Use the **class name only** (not `Class.method`). **Blank** hides the Unified relationships block. After **`getProfileData`** (+ optional Overview Einstein), the LWC calls **`getUnifiedRelationshipsQueryJson`**, which uses **`Invocable.Action`** to pass the page **`recordId`** into the invocable input variable below. |
| `unifiedRelationshipsInvocableIdInput` | String | `id` | **`@InvocableVariable`** API name on the action’s request type that receives the **CRM record Id** string (matches **`DC_UnifiedAccounts.Request.id`**). |
| `unifiedRelationshipsInvocableJsonOutput` | String | `queryResultJSON` | **`@InvocableVariable`** API name for the JSON (or text) payload shown in the table. Non-string values are **`JSON.serialize`**’d server-side. |
| `showUnifiedRelationships` | Boolean | `true` | When **false**, hides the Unified relationships section even if the Apex class is set. |
| `unifiedRelationshipsSectionLabel` | String | `Unified relationships` | Section title (**below Relationship** on Overview). |
| `unifiedRelationshipsFlowApiName` | String | `''` | **Deprecated.** Retained in metadata so existing Lightning pages do not fail deploy; **ignored** at runtime. Use **`unifiedRelationshipsInvocableApexClass`**. |
| `unifiedRelationshipsFlowRecordIdVariable` | String | `recordId` | **Deprecated.** Ignored. |
| `unifiedRelationshipsFlowOutputVariable` | String | `queryResultJSON` | **Deprecated.** Ignored. |

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
| `showOverviewTab`, `showSignalsTab`, `showPortfolioTab`, `showServicesTab`, `showStructureTab`, `showLocationTab`, `showInsightTab` |
| `showKpiStrip`, `showEnrollmentFlags`, `showBranchProximity`, `showAiActions`, `showUnifiedRelationships` |

| Property | Default (meta) | Notes |
|----------|----------------|--------|
| `structureTabLabel` | Structure | Structure tab title. |
| `showStructureTab` | `true` | Org chart, key contacts, linked-account summary (person + related accounts). |

Legacy pages may still list `showSparkline` and `[Asm flow output] Portfolio trend`; they are ignored (portfolio sparkline removed).

## Field rows and icons (record page)

Several tabs use **label + value rows** with optional **`lightning-icon`** next to the label (**`utility:*`** and **`standard:*`**) for faster scanning—Overview contact/relationship blocks, Signals detail rows, Structure summaries, and similar. Icons follow SLDS; if an icon is missing in your org’s release, swap the name in the LWC or open an issue.

## Overview — Agentforce summary (record page)

When **Agentforce summary: prompt template ID** is non-blank (and **Show Agentforce summary** is not false), an inset appears **directly above** the **Contact** section on the **Overview** tab. Body text uses **`wp-ai-summary`** / **`wp-agentforce-summary`**; optional **orange** **`wp-agentforce-summary-hint`** lines surface admin-oriented diagnostics when generation returns empty text (may include a truncated Connect payload snippet). This feature is **independent** of the **Insight** tab’s **`promptTemplateId`** / **`generateSummary`** (prediction JSON template).

## Overview — Unified relationships table (record page)

When **Unified relationships: Apex class API name** is non-blank and **Show Unified relationships** is not false, a **scrollable table** appears **under** the **Relationship** inset on **Overview**. The LWC parses JSON from your invocable output into columns and rows (array of objects, or wrapped **`rows`** / **`data`** / **`records`**, etc.; see [HOW_TO.md](HOW_TO.md)). Plain-text outputs (e.g. **`No records found.`** or **`Error: …`** from your action) render as body copy, not as a parse error. Styling: **`wp-unified-rel-table`**, **`wp-unified-rel-plain`** / **`--warn`** for messages.

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

**Visual reference (all preset names):** [Widget theme catalog (PDF)](assets/widget_theme_catalog.pdf) · [THEME_CATALOG.md](../../docs/THEME_CATALOG.md).

| Property | Default | Notes |
|----------|---------|--------|
| `themeMode` | `obsidian` | Color **preset** for the card. All options appear in the **Theme** dropdown in App Builder (e.g. obsidian, ivory, glacier, …). |
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

Colors apply to the card so **App Builder preview** and **live records** match after you save and activate the page. Optional **Theme** presets set many colors at once; individual color fields below override the preset when you change them. (Internally this uses CSS variables such as `--wp-accent`, `--wp-shell-bg`, etc.)

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
| `aiSummaryTextColor` | `''` | Optional hex or **`rgb()`** / **`rgba()`** for **generated** narrative text: **Overview Agentforce** body and **Insight** tab AI summary. Sets CSS variable **`--wp-ai-summary-text`** on the card shell. Empty → theme **secondary** text. **App** and **Home** targets expose this property for Insight-only pages (Overview Agentforce properties are record-page only). |

## Platform-injected

| Attribute | Source |
|-----------|--------|
| `recordId` | **Automatic on record pages** — Salesforce passes the open Account or Contact Id; the widget loads data when this is set. |

---

[HOW_TO.md](HOW_TO.md) · [SETUP.md](SETUP.md) · [ARCHITECTURE.md](ARCHITECTURE.md)
