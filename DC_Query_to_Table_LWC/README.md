# DC Query to Table LWC

> **Purpose:** Salesforce DX package with **`dcQueryToTableLwc`** (**DC Query to Table** in App Builder): **Data Cloud ANSI SQL** is set **only in App Builder** (not on the page). The runtime UI is a **custom header** (**configurable SLDS icon** + **title** with **hex title color**) and a **`lightning-datatable`**; the query **runs automatically when the page loads** (no on-page SQL editor, checkbox, or Run button). Execution uses **`ConnectApi.CdpQuery.queryAnsiSqlV2`** (same org). Table options remain App Builder properties.

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

Add **DC Query to Table** to a Lightning **app**, **home**, or **record** page. Set **Card title**, **Header icon name**, **Title color (hex)**, **Data Cloud SQL query**, **max rows**, and table options in App Builder.

---

## Behavior

| Area | Details |
|------|---------|
| **UI** | Optional **icon + title** ( **Title color** in App Builder); **datatable** only—no on-page configuration. All [SLDS-style data table](https://www.lightningdesignsystem.com/2e1ef8501/p/86f13a-data-table) options (**selection column**, **row numbers**, **column widths mode**, **min width**, **resize**, **header/cell wrap**, **wrap lines**, **suppress footer**, **enable column sorting**, etc.) are **Lightning App Builder** properties only. SQL is **not** shown at runtime. |
| **Load** | **`connectedCallback`** always schedules **one** query run when the page opens. The older **Auto-run on load (legacy)** designer property is **ignored** but kept so existing pages can deploy. |
| **Query** | **SELECT** or **WITH … SELECT** only; mutating/DDL keywords rejected with spaces (heuristic). |
| **LIMIT** | If the statement has **no `LIMIT n`**, Apex appends **`LIMIT`** using **Max rows (auto LIMIT)** (clamped to **2000**). |
| **Results** | Columns and cells are built from **`queryAnsiSqlV2`** metadata + row data (serialized to maps for the LWC). |
| **Pagination** | If **`nextBatchId`** is returned, a **warning** toast explains that only the **first batch** is shown; use a tighter `LIMIT` or extend the controller for **`nextBatchAnsiSqlV2`** later. |
| **Table** | **Immutable** display: default **hide checkboxes**; optional **row numbers**, **column width** mode, **min width**, **resize**, **header wrap**, **cell wrap** max lines, **suppress bottom bar**. **Enable column sorting** (default on) sets `sortable` on columns and sorts loaded rows client-side (`onsort`); date/datetime columns use parsed timestamps when possible. |

---

## Troubleshooting: always empty or “no records”

1. **Parser / UI (fixed in recent versions)** — Earlier builds read only camelCase JSON keys from `JSON.serialize(ConnectApi…)`, so **`metadata` / `data` / `rowData` were missed** when the platform emitted **PascalCase**. That produced **zero columns**, and the LWC hid the table entirely (it required both columns and rows). Current code uses **case-insensitive keys** and can **infer columns from the first row** if metadata is missing. Deploy the latest controller + LWC.

2. **Real zero-row query** — Data Cloud objects may be empty in your dataspace, or filters may match nothing. Confirm in the **Data Cloud Query Editor** or `sf data360 query sql` with the **same SQL** and **same user context**.

3. **Permissions** — The running user needs rights to execute Data Cloud SQL (your org’s **Data Cloud** / **Einstein** / **CDP query** permission sets). **`DcQueryToTableController`** must be allowed for that user’s profile or permission set.

4. **Wrong object or quoting** — Use **Data Cloud SQL** table names (often `Something__dlm` / DMO names). Quote identifiers when case matters: `"ssot__Individual__dlm"`.

5. **`LIMIT` / `OFFSET`** — If the query already had `LIMIT` not at the very end, the old logic could append a **second** `LIMIT` and break execution. Current logic treats any `LIMIT n` in the statement as sufficient.

6. **Org shape** — `ConnectApi.CdpQuery` is intended for **Data Cloud–enabled** orgs. If you query **across orgs**, you need a **Named Credential** + HTTP Query API instead (not included in this package).

---

## Project layout

| Path | Role |
|------|------|
| `force-app/.../lwc/dcQueryToTableLwc/` | Shell header (icon + title color), auto-run on load, `lightning-datatable` |
| `force-app/.../classes/DcQueryToTableController.cls` | `runDataCloudSql` → `ConnectApi.CdpQuery.queryAnsiSqlV2` |
| `force-app/.../classes/DcQueryToTableControllerTest.cls` | Validation + mock result tests |

---

## References

- [Data Cloud Query Guide](https://developer.salesforce.com/docs/data/data-cloud-query-guide/guide/query-guide-get-started.html)
- [Data Cloud SQL syntax](https://developer.salesforce.com/docs/data/data-cloud-query-guide/references/dc-sql-reference/syntax.html)
- [lightning-datatable](https://developer.salesforce.com/docs/component-library/bundle/lightning-datatable/documentation) (SLDS-aligned table UI)
- [LDS: Data table](https://www.lightningdesignsystem.com/2e1ef8501/p/86f13a-data-table)
