# AGENTS.md — DC Query to Table

Salesforce DX package: one LWC + one Apex controller that runs a Data Cloud SQL query (configured by an admin in Lightning App Builder) and renders rows in a `lightning-datatable`.

This file is the **agent context primer**. Humans should read [README.md](README.md) and [docs/INDEX.md](docs/INDEX.md) instead.

## Tech stack

- **Salesforce DX**, sourceApiVersion **66.0** ([sfdx-project.json](sfdx-project.json))
- **Apex** (`with sharing`) — Data Cloud query via `ConnectApi.CdpQuery.queryAnsiSqlV2`
- **LWC** — `lightning-datatable`, no third-party JS, no static resources
- **CLI:** `sf` v2 only — **never `sfdx`** (deprecated; the repo's PreToolUse hook will warn)

## Project structure

```
force-app/main/default/
  classes/                    DcQueryToTableController + Test (no other Apex)
  lwc/dcQueryToTableLwc/      Single LWC bundle (js, html, css, js-meta.xml)
  permissionsets/             DC_Query_to_Table_User (Apex class access only)
docs/                         User-facing docs (DEPLOY, SETUP_GUIDE, ARCHITECTURE, etc.)
artifacts.md                  Inventory of every file and its role
```

This package lives inside the **JDO monorepo**; cross-package docs are at `../docs/` (e.g., `../docs/MOBILE_AND_FORM_FACTORS.md`). Do not write to `../docs/` from this package.

## Commands

```bash
# Deploy (from this directory)
sf project deploy start --source-dir force-app --target-org <alias> --wait 10

# Deploy with required tests
sf project deploy start --source-dir force-app --target-org <alias> \
  --test-level RunSpecifiedTests --tests DcQueryToTableControllerTest --wait 30

# Run tests only
sf apex run test --tests DcQueryToTableControllerTest --target-org <alias> --wait 10 --result-format human

# Assign permission set after deploy
sf org assign permset --name DC_Query_to_Table_User --target-org <alias>
```

## Architecture (one paragraph)

App Builder writes `defaultSql` and ~15 designer properties into [dcQueryToTableLwc.js-meta.xml](force-app/main/default/lwc/dcQueryToTableLwc/dcQueryToTableLwc.js-meta.xml). On load (or Run-button click), the LWC calls `@AuraEnabled DcQueryToTableController.runDataCloudSql`. Apex validates read-only SQL, appends `LIMIT` if absent (cap 2000), invokes `ConnectApi.CdpQuery.queryAnsiSqlV2`, then `JSON.serialize`s the response and walks the untyped tree to build `ColumnDef[]` + `List<Map<String,Object>>` for `lightning-datatable`. Sorting is **client-side only**, on the rows already loaded. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the sequence diagram.

## Conventions

- **API version pinned at 66.0** in `sfdx-project.json` and `.cls-meta.xml`/`.js-meta.xml`. Don't bump unless deliberate.
- **Apex sharing:** `with sharing` — running user's Data Cloud permissions apply.
- **No namespace.** Class is `DcQueryToTableController`, LWC bundle is `dcQueryToTableLwc`, App Builder label is `DC Query to Table`.
- **Designer property docs live in `.js-meta.xml`**, not the LWC docs. When you add an `@api` property, also add it to *both* `targetConfig` blocks (record page + app/home).

## Gotchas (the non-obvious stuff)

### LWC1503: never give Boolean `@api` properties a JS default of `true`
[dcQueryToTableLwc.js](force-app/main/default/lwc/dcQueryToTableLwc/dcQueryToTableLwc.js) deliberately declares `@api autoRunOnLoad;`, `@api showTitle;`, `@api enableColumnSorting;`, `@api showTableConfiguration;` **with no default**. The `default="true"` lives in `.js-meta.xml`. JS getters use the idiom:

```js
get titleVisible() { return this.showTitle !== false; }
```

`undefined` (App Builder unset) is treated as "use the meta default." Adding `= true` will fail compilation with **LWC1503**. This pitfall has bitten this monorepo before — keep the pattern.

### Apex reserved word: `in`
Don't name a parameter, local, or property `in` — Apex reserves it. (Same incident as LWC1503 above; flagged in user memory.)

### Read-only SQL is enforced in *two* checks — keep both
[DcQueryToTableController.validateReadOnlySql](force-app/main/default/classes/DcQueryToTableController.cls#L93) requires `^(select|with)` *and* rejects ` insert / update / delete / merge / drop / truncate / alter / create `. The keyword check uses leading+trailing spaces to avoid false positives on column names like `created_date`. Don't relax either check — App Builder admins can paste arbitrary SQL.

### `ConnectApi.CdpQueryOutputV2` JSON casing is unstable
[buildResult](force-app/main/default/classes/DcQueryToTableController.cls#L135) round-trips through `JSON.serialize` + a custom `mapGetCi` helper that tries `metadata`/`Metadata`, `data`/`Data`/`rows`/`Rows`, `rowData`/`RowData`/`row_data`/`values`/`cells`. The casing varies between API versions — don't "simplify" this back to typed property access.

### `LIMIT` append is gated on a regex, not parsing
`hasLimitClause` is a `(?i)\blimit\s+\d+` match. SQL with `LIMIT` inside a CTE or comment will satisfy the regex and skip the cap; SQL with `OFFSET` but no `LIMIT` will get a `LIMIT` appended. Acceptable trade-off for this component — don't try to write a real SQL parser.

### "Next batch" rows are dropped
If `nextBatchId` is non-null, [buildResult](force-app/main/default/classes/DcQueryToTableController.cls#L269) sets a warning and the LWC **shows the first batch only**. This is by design; pagination is out of scope.

### Sorting is client-side over loaded rows only
`handleSort` resorts `tableRows` in memory. Don't mistake it for re-querying — sort never re-hits Data Cloud.

### Test mock hook
`DcQueryToTableController.testMockResult` (`@TestVisible`) short-circuits `runDataCloudSql` inside test context. Apex tests can't actually hit `ConnectApi.CdpQuery`, so all row-rendering coverage rides on this mock.

## Testing

- One test class: [DcQueryToTableControllerTest.cls](force-app/main/default/classes/DcQueryToTableControllerTest.cls). It covers SQL validation guards (blank, DDL/DML, non-SELECT) and the mock-injected happy path.
- **No LWC unit tests** (no `__tests__` directory, no `jest.config.js`). If you add Jest, add it as a peer of the bundle and update this section.
- Manual UI verification only: deploy to a scratch org, drop the component on an App page, confirm the table renders.

## What lives where (quick map)

| You want… | Look at |
|---|---|
| A designer property's purpose | [docs/COMPONENT_REFERENCE.md](docs/COMPONENT_REFERENCE.md) and the `targetConfig` blocks in [dcQueryToTableLwc.js-meta.xml](force-app/main/default/lwc/dcQueryToTableLwc/dcQueryToTableLwc.js-meta.xml) |
| Why an empty grid is showing | [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) |
| Sequence diagram | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| File-by-file inventory | [artifacts.md](artifacts.md) |
| Mobile / form-factor behavior (monorepo-wide) | `../docs/MOBILE_AND_FORM_FACTORS.md` |
