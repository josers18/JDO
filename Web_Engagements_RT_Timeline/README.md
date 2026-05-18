# Web Engagements RT Timeline

A **real-time web engagement timeline** card for Salesforce **Account / Person Account** record pages. The LWC (`webEngagementData`) calls Apex (`DataCloudWebEngagementController`), which resolves the Salesforce Account ID to a **Data Cloud Unified ID** and fetches the **`RT_Web_Engagementsv2`** Data Graph live via a **Named Credential** (`callout:Data_Cloud_API`). Engagements render as an SLDS expandable timeline with dynamic title / subtitle / icon based on `productType`, `pageTitle`, and `applicationStatus`.

<div align="center">

[![Salesforce DX](https://img.shields.io/badge/Salesforce-DX-00A1E0?style=for-the-badge&logo=salesforce&logoColor=white)](https://developer.salesforce.com/developer-centers/salesforce-dx)
[![LWC](https://img.shields.io/badge/Lightning-Web_Components-0176D3?style=for-the-badge)](https://developer.salesforce.com/docs/component-library/overview/components)
[![Apex](https://img.shields.io/badge/Apex-04844B?style=for-the-badge)](https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/)
[![Data Cloud](https://img.shields.io/badge/Data_Cloud-Data_Graph-7F56D9?style=for-the-badge)](https://developer.salesforce.com/docs/atlas.en-us.c360a_api.meta/c360a_api/c360a_api_data_graphs.htm)

**Account + Contact** · **Real-time Data Graph** · **Named Credential auth**

</div>

---

## What it shows

A **Real Time Engagements** card on the record page with one row per engagement, sorted **most-recent-first**:

- **Title:** `webInteractions_pageTitle__c` (suffixed with `applicationStatus__c` when present).
- **Subtitle:** derived from `productType` / `pageTitle` / `applicationStatus`:
  - `productType` contains **Contact Us** → *Contact Request Form*
  - `pageTitle` contains **Apply** + status `submit_app` → *Application Submitted*
  - status `save_draft` → *Application Saved*
  - status `cancel_app` → *Application Cancelled*
  - default → *Visited Page*
- **Icon:** mirrors the subtitle (`custom:custom68` for Visited Page, `custom:custom105` for Contact Request, `standard:task2` / `record_update` / `cancel_checkout` / `document` for application states).
- **Expanded details:** `deviceId`, `eventType`, `userId`, `userEmail`. Contact-Us rows also surface `contactName` / `contactPhone` / `contactRequestType`; application rows also surface `requestedAmount`. Null-valued details are filtered out.

The card title links to the demo Cumulus Bank login page (`https://cumulusbank-620df6d1b36b.herokuapp.com/login`) and a refresh button re-runs the Apex call.

---

## Architecture

```
Record Page (Account | Contact)
        │  recordId
        ▼
LWC webEngagementData ── @AuraEnabled ──▶ DataCloudWebEngagementController.getWebEngagementData(accountId)
                                                  │
                                                  │ 1. Resolve Unified ID
                                                  ▼
                                          ConnectApi.CdpQuery.querySql
                                          (UnifiedLinkssotAccountAcc__dlm)
                                                  │
                                                  │ 2. Live Data Graph fetch
                                                  ▼
                                          callout:Data_Cloud_API
                                          /services/data/v65.0/ssot/data-graphs/data/RT_Web_Engagementsv2/{unifiedId}
                                                  │
                                                  ▼
                                          Raw Data Graph JSON
                                                  │
                                                  ▼
LWC processGraphData() ── recursive search for `CumulusWeb_Engagements__dlm` arrays
                          ── dedupe by `eventId__c`
                          ── sort by `dateTime__c` DESC
```

The recursive walker (`findAndProcessEngagements`) supports both **wrapped-blob** responses (`data[0].json_blob__c`) and **direct JSON** Data Graph responses, so the same component works against differently-shaped retriever outputs.

---

## Prerequisites

| Requirement | Why |
|-------------|-----|
| **Data Graph** named `RT_Web_Engagementsv2` | The API name is hardcoded in `DataCloudWebEngagementController.DATA_GRAPH_NAME`. Rename the constant if your Data Graph is named differently. |
| **DLO `UnifiedLinkssotAccountAcc__dlm`** with `SourceRecordId__c` + `UnifiedRecordId__c` | The bridge from CRM Account ID → Data Cloud Unified ID. Hardcoded in `LINK_OBJECT_NAME`. |
| **Named Credential** with API name `Data_Cloud_API` | Used as `callout:Data_Cloud_API`; handles OAuth so Apex sends no Authorization header. |
| **DMO** `CumulusWeb_Engagements__dlm` (or equivalent) inside the Data Graph | The LWC walker keys on this DMO name; rename in `webEngagementData.js` if your DMO differs. |
| **Apex class access** for `DataCloudWebEngagementController` | Grant via permission set or profile to the running user. |

---

## Quick deploy

```bash
cd Web_Engagements_RT_Timeline
sf project deploy start --source-dir force-app --target-org <your-org-alias> --wait 10
```

After deploy:
1. Open **App Builder** for the **Account** or **Contact** record page.
2. Drag **Real Time Digital Engagements** onto the layout (`masterLabel` from `webEngagementData.js-meta.xml`).
3. Save and activate.

---

## App Builder properties

Once deployed, the **Real Time Digital Engagements** component exposes 5 properties in App Builder. Configure per-instance — no code changes needed for common admin tasks.

| Property | Default | Description |
|---|---|---|
| **Data Graph API name** | `RT_Web_Engagementsv2` | API name of the Data Cloud Data Graph this card pulls from. Change to point at any other Data Graph in the same org. |
| **Card title** | `Real Time Engagements` | Header text shown on the card. |
| **Card title link URL** | _(blank)_ | Optional URL the card title links to. Leave blank for plain text. |
| **Feed height (px)** | `600` | Maximum height of the feed before scrolling. Ignored when Auto-size is on. |
| **Auto-size feed** | _off_ | When on, feed grows up to 90% of viewport height. Overrides Feed height. |
| **Show Case events** | _off_ | Include Case records (created in the lookback window) on the timeline. |
| **Show Task events (incl. logged calls)** | _off_ | Include Task records on the timeline. Logged calls (Task with CallType set) get a distinct icon. |
| **Show Event records (calendar)** | _off_ | Include Salesforce Calendar Event records on the timeline. |
| **Show Agentforce Voice calls** | _off_ | Include VoiceCall records (Service Cloud Voice). Silently skipped if Voice isn't provisioned. |
| **CRM lookback (days)** | `90` | How far back to query CRM events. Max 365; values out of range fall back to 90. |

Defaults preserve pre-revamp behavior except for **Card title link URL** (was hardcoded to a Cumulus Bank demo URL; now blank — paste a URL to restore the link) and the four **Show … events** toggles (default off, so no CRM events appear until an admin opts in).

---

## Multi-source timeline

When any of the four CRM source toggles are on, the component fires two Apex calls in parallel:

| Call | Apex method | Returns |
|---|---|---|
| **A — Web** (always) | `DataCloudWebEngagementController.getWebEngagementData` | Data Cloud Data Graph events |
| **B — CRM** (only when one or more sources on) | `CrmTimelineController.getCrmTimelineEvents` | Cases / Tasks / Events / VoiceCalls |

The Data Graph rows render the moment Call A resolves. CRM events stream in below when Call B finishes. Filter chips operate on already-loaded events with no Apex round-trip.

**Source colors / icons:**

| Source | Color | Default icon |
|---|---|---|
| Web | `#7f56d9` | `custom:custom68` |
| Case | `#c23934` | `standard:case` |
| Task | `#04844b` | `standard:task` (or `standard:log_a_call` for logged calls) |
| Event | `#c97a00` | `standard:event` |
| Voice | `#0176d3` | `standard:live_chat` |

**Partial-failure UX:** if Call A or Call B fails, the other still renders. An inline warning banner with a Retry button appears for the failed side; the working side keeps showing.

**Lookback:** all CRM sources share the `CRM lookback (days)` window (default 90). Per-source `LIMIT 200` keeps the SOQL inside governor headroom.

---

## Customizing for your data

| Change | Where |
|--------|-------|
| Data Graph name, card title/link, feed height/auto-size | **App Builder property** — see "App Builder properties" section above |
| Link Object DLO API name | `DataCloudWebEngagementController.cls` → `LINK_OBJECT_NAME` |
| Named Credential alias | `DataCloudWebEngagementController.cls` → endpoint string `callout:Data_Cloud_API` |
| Engagement DMO name | `webEngagementData.js` → `node.CumulusWeb_Engagements__dlm` checks |
| Title / subtitle / icon rules | `webEngagementData.js` → `findAndProcessEngagements` mapper |
| Detail rows | `webEngagementData.js` → `details` array in the mapper |

---

## Known issues in this snapshot

> **Fixed since retrieve:**
> - **Missing semicolon in icon switch** — In `webEngagementData.js`, the `cancel_app` case was missing the trailing semicolon on `icon = 'standard:cancel_checkout'` before `break`. Now consistent with the rest of the file.
> - **`const` reassignment** in `webEngagementData.js` — `finalTitle` was declared `const` then reassigned for the `'Your Dashboard'` branch (would throw `TypeError`). Now `let`.
> - **Title used `baseTitle` instead of `finalTitle`** in the mapper return — all the title-derivation logic (status suffix, "Login - Home" override) was effectively dead code. Now wired through to the rendered title.

---

## API version posture

| Asset | Version | Why |
|---|---|---|
| `sfdx-project.json` `sourceApiVersion` | **62.0** | Matches sibling DX projects (`DC_BusinessProfileWidget`, `DC_PersonProfileWidget`, etc.) for monorepo consistency. Bump only when a feature requires it. |
| Component / class `-meta.xml` `apiVersion` | **65.0** | What was retrieved from the org. Untouched. |
| Org runtime API | **66.0** | Salesforce platform release running on the target org. |

These three numbers can legally differ. `sourceApiVersion` only governs *new* metadata authored in this DX project — not retrieval, deploy, or runtime behavior of components already at 65.0.

---

## Test coverage

| Class / spec | Tests | Coverage achieved |
|---|---|---|
| `DataCloudWebEngagementController` | 17 Apex (Plan 1+2) | ~83% |
| `CrmTimelineController` | 10 Apex (Plan 3) | ~78% |
| `timelineMappers.js` | 18 Jest (parseDataGraphResponse + mergeAndSort + groupByDay) | full branch coverage |
| `webEngagementData` LWC | 10 Jest (DOM-level) | smoke + regression |

Run all locally:

```bash
sf apex run test --class-names DataCloudWebEngagementControllerTest --class-names CrmTimelineControllerTest --result-format human --code-coverage --wait 15 --synchronous
npm test
```

The DataCloudWebEngagementController coverage ceiling (~83%) is by design: the `@TestVisible static String testMockUnifiedId` seam intentionally bypasses `getUnifiedId`'s body, leaving the SOQL build + `ConnectApi.QuerySqlInput` + `ConnectApi.CdpQuery.querySql` call structurally uncoverable in API 65.0. The JSON-parsing logic that follows is extracted into `extractUnifiedIdFromQueryOutput` and tested directly.

CrmTimelineController's ~78% sits above Salesforce's 75% deployment floor. Uncovered lines are minor error-handling and fall-through branches (e.g. blank-Subject defaults, Description-truncation branches, Owner-is-null paths) — exercised at runtime but not asserted in unit tests.

---

## Repository context

This folder is a **Salesforce DX project** inside the [JDO monorepo](../README.md). See the root [deployment guide](../docs/DEPLOYMENT_GUIDE.md) for org aliases and shared patterns.

See [artifacts.md](artifacts.md) for the full inventory of `force-app/main/default/`.

---

## License

Demo / educational source; adjust for your org's policy if you republish.
