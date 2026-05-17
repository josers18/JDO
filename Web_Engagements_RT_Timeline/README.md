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

## Customizing for your data

| Change | Where |
|--------|-------|
| Data Graph API name | `DataCloudWebEngagementController.cls` → `DATA_GRAPH_NAME` |
| Link Object DLO API name | `DataCloudWebEngagementController.cls` → `LINK_OBJECT_NAME` |
| Named Credential alias | `DataCloudWebEngagementController.cls` → endpoint string `callout:Data_Cloud_API` |
| Engagement DMO name | `webEngagementData.js` → `node.CumulusWeb_Engagements__dlm` checks |
| Title / subtitle / icon rules | `webEngagementData.js` → `findAndProcessEngagements` mapper |
| Detail rows | `webEngagementData.js` → `details` array in the mapper |
| Card title link | `webEngagementData.html` → `<a href="...">Real Time Engagements</a>` |
| Feed max height / scroll | `webEngagementData.css` → `.engagement-feed { max-height: 600px }` |

---

## Known issues in this snapshot

1. **Missing semicolon in icon switch (cosmetic)** — In `webEngagementData.js`, the `cancel_app` case in the icon switch is missing the trailing semicolon on `icon = 'standard:cancel_checkout'` before `break`. Parses fine (ASI handles it) but inconsistent with the rest of the file.

> **Fixed since retrieve:**
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

`DataCloudWebEngagementController` is covered by `DataCloudWebEngagementControllerTest` at **~83% lines** (15 test methods). Run locally:

```bash
sf apex run test --class-names DataCloudWebEngagementControllerTest --result-format human --code-coverage --wait 10 --synchronous
```

The test class uses three patterns:
- `@TestVisible static String testMockUnifiedId` on the controller — bypasses `ConnectApi.CdpQuery.querySql`, which is not mockable via `Test.setMock` in API 65.0.
- `Test.setMock(HttpCalloutMock.class, ...)` — fakes the live Data Graph callout to `callout:Data_Cloud_API`.
- `@TestVisible static String extractUnifiedIdFromQueryOutput(Map<String, Object>)` on the controller — direct unit tests of the JSON-parsing branches with crafted Maps.

### Coverage ceiling

The seam means `getUnifiedId`'s body (SOQL build + `ConnectApi.QuerySqlInput` + `ConnectApi.CdpQuery.querySql` + serialize/deserialize-to-Map — about 11 lines) is structurally uncoverable by unit tests. After Task 9a's refactor, the JSON-parsing logic that follows was extracted into the `extractUnifiedIdFromQueryOutput` helper and is covered directly. The remaining ~17% gap is the un-mockable `ConnectApi` integration path itself.

Salesforce's org-wide deployment threshold is 75%. The class deploys cleanly. The plan's spec target was lowered from 85% to 80% to acknowledge this honest ceiling.

---

## Repository context

This folder is a **Salesforce DX project** inside the [JDO monorepo](../README.md). See the root [deployment guide](../docs/DEPLOYMENT_GUIDE.md) for org aliases and shared patterns.

See [artifacts.md](artifacts.md) for the full inventory of `force-app/main/default/`.

---

## License

Demo / educational source; adjust for your org's policy if you republish.
