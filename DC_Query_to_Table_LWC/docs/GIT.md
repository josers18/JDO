# Git and monorepo notes

## Path in the JDO repo

```text
JDO/
  DC_Query_to_Table_LWC/
    sfdx-project.json
    force-app/main/default/
```

Clone the monorepo, then `cd DC_Query_to_Table_LWC` before running `sf` commands.

## Bundle vs label

| Concept | Value |
|---------|--------|
| **Folder / tag name** | `dcQueryToTableLwc` |
| **App Builder master label** | DC Query to Table |
| **Apex** | `DcQueryToTableController` |

## Record page objects

`js-meta.xml` includes `<object>Account</object>` under the record-page `targetConfig`. Add additional `<object>` entries for other primary objects and redeploy.

## Contributing

Commit related Apex, tests, LWC, and docs together. Keep `README.md` and `docs/*` aligned when behavior or properties change.
