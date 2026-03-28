# DC Query to Table LWC

> **Purpose:** Salesforce DX package with **`dcQueryToTableLwc`** (**DC Query to Table** in App Builder): **Data Cloud ANSI SQL** is set **only in App Builder** (not on the page). The runtime UI shows the **card title**, an optional **“Run query when page loads”** checkbox, a **Run query** button when that box is unchecked, and the **`lightning-datatable`** result. Execution uses **`ConnectApi.CdpQuery.queryAnsiSqlV2`** (same org). Table options (density, row numbers, column widths, wrap, sort) remain App Builder properties.

Visual and behavioral alignment with SLDS **data table** patterns is through the platform **`lightning-datatable`** base component, which implements the [Lightning Design System data table](https://www.lightningdesignsystem.com/2e1ef8501/p/86f13a-data-table) guidance for tabular, scannable layouts.

---

## Requirements

- **Data Cloud** (or equivalent) in the **same org** where this code runs, with Apex access to **`ConnectApi.CdpQuery`**. This matches the pattern described for in-org access in Salesforce’s [Data Cloud + Apex overview](https://developer.salesforce.com/blogs/2023/07/unlocking-the-power-of-apex-in-salesforce-data-cloud-part-1).
- Users need permission to run Data Cloud queries (your org’s **Data Cloud** / **Einstein** permission model).
- **API 66.0** project (`sfdx-project.json`).

### Cross-org (CRM → Data Cloud org)

If the UI runs in an org **without** in-process `CdpQuery`, use a **Named Credential** and HTTP callout to the Data Cloud **Query API** instead (see [How to Query Data Cloud from Any Salesforce Org with Apex](https://developer.salesforce.com/blogs/2024/09/how-to-query-data-cloud-from-any-salesforce-org-with-apex)). That variant is **not** shipped in this package; this repo uses the same-org Connect API path only.

---

## Security

Arbitrary SQL configured in App Builder is **powerful**. Only grant **`DcQueryToTableController`** to **trusted** admins or analysts. The Apex layer blocks obvious **DML/DDL** tokens but this is **not** a substitute for org policy, permission sets, and Data Cloud’s own access controls.

---

## Deploy

```bash
cd JDO/DC_Query_to_Table_LWC
sf project deploy start --source-dir force-app --target-org <alias>
```

Add **DC Query to Table** to a Lightning **app**, **home**, or **record** page. Set **Data Cloud SQL query**, **Start with auto-run on**, **max rows**, and table options in App Builder.

---

## Behavior

| Area | Details |
|------|---------|
| **UI** | **Title** + **Run query when page loads** checkbox. Checked → query runs on load (and again if the user re-checks after clearing). Unchecked → **Run query** button only. SQL is **not** shown at runtime. |
| **Query** | **SELECT** or **WITH … SELECT** only; mutating/DDL keywords rejected with spaces (heuristic). |
| **LIMIT** | If the statement has **no trailing `LIMIT n`**, Apex appends **`LIMIT`** using **Max rows (auto LIMIT)** (clamped to **2000**). |
| **Results** | Columns and cells are built from **`queryAnsiSqlV2`** metadata + row data (serialized to maps for the LWC). |
| **Pagination** | If **`nextBatchId`** is returned, a **warning** toast explains that only the **first batch** is shown; use a tighter `LIMIT` or extend the controller for **`nextBatchAnsiSqlV2`** later. |
| **Table** | **Immutable** display: default **hide checkboxes**; optional **row numbers**, **column width** mode, **min width**, **resize**, **header wrap**, **cell wrap** max lines, **suppress bottom bar**, **sort** (client-side on loaded rows). |

---

## Project layout

| Path | Role |
|------|------|
| `force-app/.../lwc/dcQueryToTableLwc/` | Card, auto-run checkbox, Run button, `lightning-datatable` |
| `force-app/.../classes/DcQueryToTableController.cls` | `runDataCloudSql` → `ConnectApi.CdpQuery.queryAnsiSqlV2` |
| `force-app/.../classes/DcQueryToTableControllerTest.cls` | Validation + mock result tests |

---

## References

- [Data Cloud Query Guide](https://developer.salesforce.com/docs/data/data-cloud-query-guide/guide/query-guide-get-started.html)
- [Data Cloud SQL syntax](https://developer.salesforce.com/docs/data/data-cloud-query-guide/references/dc-sql-reference/syntax.html)
- [lightning-datatable](https://developer.salesforce.com/docs/component-library/bundle/lightning-datatable/documentation) (SLDS-aligned table UI)
- [LDS: Data table](https://www.lightningdesignsystem.com/2e1ef8501/p/86f13a-data-table)
