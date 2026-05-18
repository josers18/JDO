# Artifacts — Web Engagements RT Timeline

Inventory of **`force-app/main/default/`**.

---

## Apex

| File | Role |
|------|------|
| `classes/DataCloudWebEngagementController.cls` | `@AuraEnabled getWebEngagementData(String accountId, String dataGraphName)` — resolves Salesforce Account ID → Data Cloud Unified ID via `ConnectApi.CdpQuery.querySql` against the `UnifiedLinkssotAccountAcc__dlm` Link Object, then live-fetches the Data Graph (defaults to `RT_Web_Engagementsv2` when the parameter is blank) via `callout:Data_Cloud_API/services/data/v65.0/ssot/data-graphs/data/{graph}/{unifiedId}`. Returns the raw Data Graph JSON body (or `[]` on miss / non-200). Auth handled by the Named Credential — no Authorization header set. Includes `@TestVisible static String testMockUnifiedId` seam and `@TestVisible static String extractUnifiedIdFromQueryOutput(Map<String,Object>)` parser helper. `apiVersion 65.0`. |
| `classes/DataCloudWebEngagementControllerTest.cls` | Apex test class for the Data Cloud controller. 17 test methods achieving ~83% coverage. Uses `@TestVisible testMockUnifiedId` seam to bypass un-mockable `ConnectApi.CdpQuery.querySql` + `Test.setMock(HttpCalloutMock.class, ...)` for the Data Graph callout. Coverage ceiling at 83% is by design — see project README "Test coverage" for rationale. |
| `classes/CrmTimelineController.cls` | `@AuraEnabled getCrmTimelineEvents(Id recordId, List<String> enabledSources, Integer lookbackDays)` returning `List<TimelineEvent>`. Whitelists `enabledSources` against `{'case','task','event','voice'}`, validates `recordId.getSObjectType()` is Account or Contact (throws `AuraHandledException` otherwise), clamps `lookbackDays` to `[1, 365]` with default 90. Per-source private methods (`queryCases` / `queryTasks` / `queryEvents` / `queryVoiceCalls`) use bound SOQL with `LIMIT 200` each. `queryVoiceCalls` is `Schema.getGlobalDescribe`-gated and uses `Database.query` so the class compiles in orgs without Service Cloud Voice. Returns events sorted DESC by `occurredAt` via `Comparator<TimelineEvent>`. `with sharing`. `apiVersion 65.0`. Inner classes: `TimelineEvent`, `DetailField`, `TimelineEventComparator`. |
| `classes/CrmTimelineControllerTest.cls` | Apex test class for the CRM timeline controller. 10 test methods achieving ~78% coverage (above Salesforce's 75% deployment floor). Tests: target validation (Opportunity Id throws), empty-sources / whitelist filtering, Cases happy path (Account + Contact pages), Tasks happy path (plain task + logged-call CallType branch), Events happy path, Voice-absent-no-throw, three-source merged DESC sort, lookbackDays 5-arm clamping (within / outside / null / negative / huge). |

---

## Lightning Web Component

| Path | Role |
|------|------|
| `lwc/webEngagementData/webEngagementData.html` | **Style B card stream** inside a `lightning-card` whose title (and optional link) come from App Builder properties. Renders: chip-bar filter row (one chip per available source + an `All` chip), partial-failure warning banners with Retry buttons (separate for web vs CRM), day-grouped card stream (`<article>` per event with source-colored left rail, source tag, formatted date-time, Details + Open buttons, expand-on-click detail panel), empty-state message, "Loading CRM activity..." chip when web rendered but CRM still pending. Uses `lwc:if` / `lwc:else` directives. |
| `lwc/webEngagementData/webEngagementData.js` | Component class (~213 lines) — orchestrates two parallel Apex calls (`loadWebEngagements` + `loadCrmEvents`) from `handleRefresh`; manages state (`webEvents`, `crmEvents`, `loadingWeb`, `loadingCrm`, `webError`, `crmError`, `activeSourceFilters: Set`, `expandedIds: Set`); exposes 10 `@api` properties (`recordId` + 9 admin-configurable); provides 11 reactive getters (`mergedEvents`, `availableChips`, `groupedByDay`, `feedStyle`, etc.); handles chip toggle (incl. `All` toggle), per-card expand toggle, retry-web, retry-crm. Pure parsing logic lives in helper modules — class itself is thin and reactivity-correct (Set re-creation forces recompute). |
| `lwc/webEngagementData/webEngagementData.css` | Style B styling: `.engagement-feed` container (height driven by inline `style={feedStyle}` from JS, default 600px capped or 90vh when `autoSize=true`), `.chip-bar` + `.chip` (with `.chip-on` active state and hover transition), `.day-group` + `.day-header` (uppercase letter-spacing brand-colored), `.stream-card` (3px source-colored left rail, applied via inline `style={leftRailStyle}`), `.stream-head` / `.stream-title` / `.stream-source-tag` / `.stream-meta` / `.stream-sub`, `.stream-actions`, `.stream-details` (CSS Grid with `display: contents` rows for label/value alignment), `.stream-detail-id` (monospace, weak text). All rules use SLDS-2 design tokens (`var(--slds-g-color-...)`) with sensible fallbacks. |
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

[../README.md](README.md) · [JDO monorepo](../README.md)
