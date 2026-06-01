# Artifacts — Web Engagements RT Timeline

Inventory of **`force-app/main/default/`**.

---

## Apex

| File | Role |
|------|------|
| `classes/DataCloudWebEngagementController.cls` | Two `@AuraEnabled` methods: **`getWebEngagementsWithBackfill(String accountId, String dataGraphName, Integer lookbackDays)`** is what the LWC calls — orchestrates the hot-cache fetch + cold-store DMO backfill + merge into a single response shaped as `{"data":[{"json_blob__c":"<encoded merged events>"}]}` so the LWC's `parseDataGraphResponse` consumes hot-only and hot+cold responses identically. **`getWebEngagementData(String accountId, String dataGraphName)`** stays callable for direct anonymous-Apex diagnostics — it's what `getWebEngagementsWithBackfill` calls internally for the hot path. Hot path: `getUnifiedId` → `callout:Data_Cloud_API/services/data/v65.0/ssot/data-graphs/data/{graph}/{unifiedId}`. Cold path: `queryWebEngagementsFromDmo(unifiedId, lookbackDays)` runs `ConnectApi.CdpQuery.querySql` with an INNER JOIN of `CumulusWeb_Engagements__dlm` to `UnifiedLinkssotAccountAcc__dlm` on `deviceId__c = SourceRecordId__c` filtered by the unified ID and `dateTime__c >= since`. Merge wrapper dedupes by `eventId__c` with hot-wins. Cold-side failures are non-fatal — caught and logged via `System.debug(WARN)` so a transient DMO unavailability degrades to hot-only rather than failing the call. `@TestVisible` seams: `testMockUnifiedId`, `testMockColdEvents`, `testMockHotResponse`. `@TestVisible` parser helpers: `extractUnifiedIdFromQueryOutput`, `extractColumnNamesFromMetadata`, `extractInnerBlob`, `mergeHotAndColdEvents`. Configuration constants: `DATA_GRAPH_NAME` (`RT_Web_Engagementsv2`), `LINK_OBJECT_NAME` (`UnifiedLinkssotAccountAcc__dlm`), `ENGAGEMENTS_DMO_NAME` (`CumulusWeb_Engagements__dlm`), `COLD_PER_QUERY_LIMIT` (200), `COLD_DEFAULT_LOOKBACK_DAYS` (90), `COLD_MAX_LOOKBACK_DAYS` (365). `apiVersion 65.0`. |
| `classes/DataCloudWebEngagementControllerTest.cls` | Apex test class for the Data Cloud controller. 28 test methods achieving ~85% coverage. Uses `@TestVisible testMockUnifiedId` to bypass un-mockable `ConnectApi.CdpQuery.querySql`, `@TestVisible testMockColdEvents` to substitute cold-store rows, `@TestVisible testMockHotResponse` to feed in pre-formed envelopes for merge tests, plus `Test.setMock(HttpCalloutMock.class, ...)` for the Data Graph callout. Test groups: original hot-path coverage (blank account, happy-path, 500/404, no unified ID, callout exception, custom + blank Data Graph names), `extractUnifiedIdFromQueryOutput` parser branch coverage (4 shape variants × null / missing / empty cases), and the new merge-logic block (`getWebEngagementsWithBackfill` blank account, hot-empty cold-fills, disjoint hot+cold union, dedupe with hot-wins, cold-empty pass-through, lookbackDays clamping branches, metadata column-name extract lowercase + uppercase + null, full-roundtrip entity decode/parse). Coverage ceiling at ~85% is by design — see project README "Test coverage" for rationale. |
| `classes/CrmTimelineController.cls` | `@AuraEnabled getCrmTimelineEvents(Id recordId, List<String> enabledSources, Integer lookbackDays)` returning `List<TimelineEvent>`. Whitelists `enabledSources` against `{'case','task','event','voice'}`, validates `recordId.getSObjectType()` is Account or Contact (throws `AuraHandledException` via the new `buildAuraException` helper that sets BOTH the constructor message AND `setMessage()` so the LWC toast surfaces the message text), clamps `lookbackDays` to `[1, 365]` with default 90. Per-source private methods (`queryCases` / `queryTasks` / `queryEvents` / `queryVoiceCalls`) use bound SOQL with `LIMIT 200` each. `queryVoiceCalls` is `Schema.getGlobalDescribe`-gated and uses `Database.query` so the class compiles in orgs without Service Cloud Voice. Returns events sorted DESC by `occurredAt` via `Comparator<TimelineEvent>`. `with sharing`. `apiVersion 65.0`. Inner classes: `TimelineEvent`, `DetailField`, `TimelineEventComparator`. |
| `classes/CrmTimelineControllerTest.cls` | Apex test class for the CRM timeline controller. 11 test methods achieving ~78% coverage (above Salesforce's 75% deployment floor). Tests: target validation (Opportunity Id throws), empty-sources / whitelist filtering, Cases happy path (Account + Contact pages), Tasks happy path (plain task + logged-call CallType branch), Events happy path, Voice-absent-no-throw, three-source merged DESC sort, lookbackDays 5-arm clamping (within / outside / null / negative / huge). |

---

## Lightning Web Component

| Path | Role |
|------|------|
| `lwc/webEngagementData/webEngagementData.html` | **Style B card stream** inside a `lightning-card` whose title (and optional link) come from App Builder properties. Renders: header actions slot containing a `lightning-combobox` (the runtime lookback dropdown — `30 / 60 / 90 / 180 / 365 days`, label-hidden but kept in the a11y tree) plus the refresh button; chip-bar filter row (one chip per available source + an `All` chip; each source chip carries an inline `style={chip.style}` setting the `--chip-color` CSS variable from `SOURCE_CONFIG`); partial-failure warning banners with Retry buttons (separate for web vs CRM); day-grouped card stream (`<article>` per event with source-colored left rail, title-row that wraps long titles, metadata sub-row containing source tag · timestamp, Details + Open buttons, expand-on-click detail panel); empty-state message gated on `isWebLoadedAndEmpty`; "Loading CRM activity..." chip when web rendered but CRM still pending. Uses `lwc:if` / `lwc:elseif` / `lwc:else` directives. |
| `lwc/webEngagementData/webEngagementData.js` | Component class (~290 lines) — orchestrates two parallel Apex calls (`loadWebEngagements` calling `getWebEngagementsWithBackfill` + `loadCrmEvents` calling `getCrmTimelineEvents`) from `handleRefresh`; manages state (`webEvents`, `crmEvents`, `loadingWeb`, `loadingCrm`, `webError`, `crmError`, `activeSourceFilters: Set`, `expandedIds: Set`, `_currentLookback`); exposes 10 `@api` properties (`recordId` + 9 admin-configurable); provides 13 reactive getters (`mergedEvents`, `availableChips`, `groupedByDay`, `feedStyle`, `currentLookback`, `effectiveLookbackDays`, `lookbackOptions`, `isWebLoadedAndEmpty`, etc.); handles chip toggle (incl. `All` toggle), per-card expand toggle, retry-web, retry-crm, and runtime lookback change (`handleLookbackChange` clears `webEvents` / `crmEvents` / chip filters before refetching). Module-scope constants `LOOKBACK_OPTIONS` and `LOOKBACK_VALUES` define the dropdown's preset windows. The `availableChips` getter attaches a per-chip `style: '--chip-color: <hex>;'` for source chips, sourced from `SOURCE_CONFIG[s].color` — single source of truth for chip + icon + left-rail colors. Pure parsing logic lives in helper modules; class itself is thin and reactivity-correct (Set re-creation forces recompute). |
| `lwc/webEngagementData/webEngagementData.css` | Style B styling: `.header-actions` (flex row holding the lookback combobox + refresh button) with `.lookback-select` (constrained to 8.5rem so the combobox doesn't push refresh off the right edge); `.engagement-feed` container (height driven by inline `style={feedStyle}` from JS, default 600px capped or 90vh when `autoSize=true`); `.chip-bar` + `.chip` (`.chip-on` active state and hover transition; new `.chip--colored` variant uses `color-mix(in srgb, var(--chip-color) 12%, white)` tint background + colored text and border in off-state, solid `var(--chip-color)` fill with white text in on-state); `.day-group` + `.day-header` (uppercase letter-spacing brand-colored); `.stream-card` (3px source-colored left rail via inline `style={leftRailStyle}`, plus a 1-px `--slds-g-color-border-base-4` hairline `border-bottom` between adjacent cards, dropped on `:last-child`); `.stream-head` (now `flex-direction: column` so title and metadata stack vertically); `.stream-title` (`align-items: flex-start` to keep the icon top-aligned with wrapped titles); `.stream-title-text` (`overflow-wrap: anywhere` + `word-break: break-word` instead of ellipsis truncation); `.stream-meta` (horizontal sub-row hosting source tag · middot · date with `flex-wrap: wrap` for narrow cards); `.stream-meta-sep` (decorative middot, `aria-hidden` in template); `.stream-source-tag`, `.stream-sub`, `.stream-actions`, `.stream-details` (CSS Grid with `display: contents` rows for label/value alignment), `.stream-detail-id` (monospace, weak text). All rules use SLDS-2 design tokens (`var(--slds-g-color-...)`) with sensible fallbacks. |
| `lwc/webEngagementData/webEngagementData.js-meta.xml` | `apiVersion 65.0`, `isExposed=true`, `masterLabel=Real Time Digital Engagements`, target `lightning__RecordPage` for **Account** and **Contact**. **10 `<property>` elements** drive App Builder configuration: `dcDataGraphName` (String, default `RT_Web_Engagementsv2`), `cardTitle` (String), `cardTitleLink` (String), `feedHeight` (Integer, default `600`), `autoSize` (Boolean), `showCases` / `showTasks` / `showEvents` / `showVoiceCalls` (Booleans, all default `false`), `lookbackDays` (Integer, default `90`). |

---

## LWC helper modules

| Path | Role |
|------|------|
| `lwc/webEngagementData/sourceConfig.js` | Source registry: `SOURCE_CONFIG` (label/color/icon per source key) and `SOURCE_ORDER` (display order). |
| `lwc/webEngagementData/timelineMappers.js` | Pure functions: `parseDataGraphResponse`, `mergeAndSort`, `groupByDay`. Lifted out of the component class for direct Jest testability. |
| `lwc/webEngagementData/__tests__/timelineMappers.test.js` | Jest unit tests for the three mappers (~18 tests). |
| `lwc/webEngagementData/__tests__/webEngagementData.test.js` | Jest DOM tests for the component (~10 tests across getters + chip bar + day groups + left-rail color). |

---

## External dependencies

These live **outside** this `force-app/` directory but are required for the component to work:

| Dependency | Type | API name |
|-----------|------|----------|
| Data Graph | Data Cloud | `RT_Web_Engagementsv2` |
| Link Object DLO | Data Cloud | `UnifiedLinkssotAccountAcc__dlm` |
| Engagement DMO | Data Cloud | `CumulusWeb_Engagements__dlm` |
| Named Credential | Salesforce | `Data_Cloud_API` |

If you're cloning this into a new org, create or rename these in advance — or:
- **Data Graph name:** override per-instance via the **Data Graph API name** App Builder property (`dcDataGraphName`).
- **Link Object DLO API name:** still hardcoded as `LINK_OBJECT_NAME` in `DataCloudWebEngagementController.cls`; rename the constant if your DLO differs.
- **Engagement DMO key:** rename the `node.CumulusWeb_Engagements__dlm` lookups inside `lwc/webEngagementData/timelineMappers.js` → `parseDataGraphResponse` and the field-name references in `mapWebEngagement`.
- **Service Cloud Voice:** absent orgs auto-skip the `voice` source; no change needed.

---

[../README.md](README.md) · [CHANGELOG.md](CHANGELOG.md) · [JDO monorepo](../README.md)
