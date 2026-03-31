# Troubleshooting — DC Query to Table

## Error: no access to Apex class `DcQueryToTableController`

Assign permission set **DC Query to Table User** (`DC_Query_to_Table_User`) or enable the class on the user’s **profile**. Data Cloud query permissions are still required separately.

---

## Table never appears or always empty

1. **Parser / key casing (fixed in current source)**  
   Older builds expected camelCase only from `JSON.serialize` of Connect API results. If `metadata` / `data` arrived as PascalCase, columns could be empty. Current Apex uses **case-insensitive** keys and can **infer columns from the first row** when metadata is missing. **Redeploy** controller + LWC.

2. **Zero rows returned**  
   Confirm the query in **Data Cloud Query Editor** (or equivalent) with the **same user** and dataspace.

3. **Permissions**  
   Running user needs Data Cloud SQL execution rights and **`DcQueryToTableController`** Apex access (use **DC Query to Table User** permission set or profile).

4. **Wrong table or quoting**  
   Use Data Cloud object names (e.g. `__dlm`). Quote mixed-case identifiers.

5. **Invalid or mutating SQL**  
   Apex blocks obvious DML/DDL. Use read-only **SELECT** / **WITH**.

6. **LIMIT issues**  
   Current logic avoids double-`LIMIT` when a clause already exists.

7. **Org shape**  
   `ConnectApi.CdpQuery` expects Data Cloud in the **same** org. Cross-org needs a different integration (Named Credential + HTTP API), not this package.

## Errors in toast / alert

- Read the **message** from `AuraHandledException` (blank SQL, validation failures).
- **Sticky** error toasts are used for query failures so admins can screenshot the message.

## Warning toast about batching

If the API returns **`nextBatchId`**, only the first batch is shown. Tighten **`LIMIT`** in SQL or extend Apex to call **`nextBatchAnsiSqlV2`**.

## App Builder: property not saving

Ensure you **Save** the Lightning page. For record pages, confirm the object is listed in **`js-meta.xml`** `<objects>`.

## See also

Main [README.md](../README.md) behavior and security sections.
