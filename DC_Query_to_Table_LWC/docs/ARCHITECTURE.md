# Architecture — DC Query to Table

## Runtime flow

```mermaid
sequenceDiagram
    participant User
    participant LWC as dcQueryToTableLwc
    participant Apex as DcQueryToTableController
    participant CDP as ConnectApi.CdpQuery
    User->>LWC: Page load (auto-run) or Run query
    LWC->>Apex: runDataCloudSql(sql, maxRows, defaultColumnWrap, defaultInitialWidth)
    Apex->>Apex: validateReadOnlySql, append LIMIT if needed
    Apex->>CDP: queryAnsiSqlV2(input)
    CDP-->>Apex: metadata + row data
    Apex->>Apex: map to ColumnDef + Map rows (case-insensitive keys)
    Apex-->>LWC: TableQueryResult
    LWC->>LWC: Build columns for lightning-datatable; optional client sort
    LWC-->>User: Table + toasts (errors, warnings, next batch)
```

## Key design choices

1. **Same-org Data Cloud** — Uses in-process `ConnectApi.CdpQuery`, not Named Credentials. Cross-org query would require HTTP Query API (out of scope for this package).
2. **No on-page SQL editor** — SQL is a **design-time** App Builder property to avoid end-user arbitrary query in typical demos.
3. **Read-only SQL gate** — Apex rejects obvious DML/DDL tokens (heuristic); not a substitute for org policy.
4. **lightning-datatable** — Platform table for SLDS-aligned UI; header/cell styling is limited by shadow DOM (see platform docs).

## Pagination / batching

If the API returns `nextBatchId`, the controller surfaces a **warning** string; the LWC shows an **info** toast. Only the **first batch** is rendered unless you extend the controller for `nextBatchAnsiSqlV2`.

## Related files

- `DcQueryToTableController.cls` — `runDataCloudSql`, validation, mapping.
- `dcQueryToTableLwc.js` — `handleRun`, `normalizeColumn`, `handleSort`.
