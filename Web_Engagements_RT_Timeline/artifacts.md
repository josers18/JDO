# Artifacts — Web Engagements RT Timeline

Inventory of **`force-app/main/default/`**.

---

## Apex

| File | Role |
|------|------|
| `classes/DataCloudWebEngagementController.cls` | `@AuraEnabled getWebEngagementData(accountId)` — resolves Salesforce Account ID → Data Cloud Unified ID via `ConnectApi.CdpQuery.querySql` against the `UnifiedLinkssotAccountAcc__dlm` Link Object, then live-fetches the **`RT_Web_Engagementsv2`** Data Graph with `callout:Data_Cloud_API/services/data/v65.0/ssot/data-graphs/data/{graph}/{unifiedId}`. Returns the raw Data Graph JSON body (or `[]` on miss / non-200). Auth handled by the Named Credential — no Authorization header set. `apiVersion 65.0`. |
| `classes/DataCloudWebEngagementControllerTest.cls` | Apex test class for the Data Cloud controller. 17 test methods achieving ~83% coverage. Uses `@TestVisible testMockUnifiedId` seam + `Test.setMock(HttpCalloutMock.class, ...)` for Data Graph callout. |
| `classes/CrmTimelineController.cls` | `@AuraEnabled getCrmTimelineEvents(accountId, sources)` — parallel SOQL queries for Case, Task, Event, VoiceCall records within the lookback window. Returns unified JSON array with source-typed events. Handles missing objects (e.g. Voice not provisioned) gracefully. `apiVersion 65.0`. |
| `classes/CrmTimelineControllerTest.cls` | Apex test class for the CRM timeline controller. 10 test methods achieving ~78% coverage. Tests all four sources + lookback clamping + partial-failure scenarios. |

---

## Lightning Web Component

| Path | Role |
|------|------|
| `lwc/webEngagementData/webEngagementData.html` | SLDS expandable timeline (`slds-timeline__item_expandable`) inside a `lightning-card` titled **Real Time Engagements**. Refresh icon, loading spinner, error banner, "no recent engagements" empty state, and per-row detail box rendered when `item.expanded` is true. |
| `lwc/webEngagementData/webEngagementData.js` | Calls Apex on `connectedCallback()` and `handleRefresh()`. Recursively walks the Data Graph response (`findAndProcessEngagements`) collecting every `CumulusWeb_Engagements__dlm` array, derives title/subtitle/icon/details from `productType`, `pageTitle`, and `applicationStatus`, dedupes by `eventId__c`, sorts by `dateTime__c` DESC. Supports both wrapped-blob (`data[0].json_blob__c`) and direct-JSON Data Graph responses. |
| `lwc/webEngagementData/webEngagementData.css` | Scrollable feed container (`max-height: 600px`), SLDS-token-aware borders, hover state on timeline items. |
| `lwc/webEngagementData/webEngagementData.js-meta.xml` | `apiVersion 65.0`, `isExposed=true`, `masterLabel=Real Time Digital Engagements`, target `lightning__RecordPage` for **Account** and **Contact**. |

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

If you're cloning this into a new org, create or rename these in advance — or update the constants at the top of `DataCloudWebEngagementController.cls` and the DMO key in `webEngagementData.js`.

---

[../README.md](README.md) · [JDO monorepo](../README.md)
