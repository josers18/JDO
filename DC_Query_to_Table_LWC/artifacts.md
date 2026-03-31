# Artifacts inventory

**Project:** `DC_Query_to_Table_LWC` (see `sfdx-project.json`). **Git:** typically `JDO/DC_Query_to_Table_LWC/` — see [docs/GIT.md](docs/GIT.md).

Source of truth: `force-app/main/default/`.

**Naming:** App Builder shows **DC Query to Table**; bundle folder is `lwc/dcQueryToTableLwc/`.

---

## Documentation

| Doc | Topic |
|-----|--------|
| [README.md](README.md) | Overview, behavior, troubleshooting summary |
| [docs/GIT.md](docs/GIT.md) | Monorepo path, naming |
| [docs/SETUP_GUIDE.md](docs/SETUP_GUIDE.md) | Deploy, permissions, App Builder |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Sequences and data flow (Mermaid) |
| [docs/COMPONENT_REFERENCE.md](docs/COMPONENT_REFERENCE.md) | Every designer property |
| [docs/UI_LAYOUT.md](docs/UI_LAYOUT.md) | Shell, header, table region |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Empty grid, SQL, permissions |

---

## Apex

| Artifact | File(s) | Role |
|----------|---------|------|
| **DcQueryToTableController** | `classes/DcQueryToTableController.cls` (+ `-meta.xml`) | `runDataCloudSql`: validates read-only SQL, optional `LIMIT`, calls `ConnectApi.CdpQuery.queryAnsiSqlV2`, maps result to column defs + row maps for `lightning-datatable`. |
| **DcQueryToTableControllerTest** | `classes/DcQueryToTableControllerTest.cls` (+ `-meta.xml`) | Tests with mock `TableQueryResult`; SQL validation. |

**Sharing:** `with sharing`.

---

## Permission set

| Artifact | File | Role |
|----------|------|------|
| **DC Query to Table User** | `permissionsets/DC_Query_to_Table_User.permissionset-meta.xml` | Apex access: `DcQueryToTableController`. Assign to users who use the component; Data Cloud permissions are separate. |

---

## Lightning Web Component

| File | Role |
|------|------|
| `lwc/dcQueryToTableLwc/dcQueryToTableLwc.js` | Auto-run vs **Run query**, Apex invoke, client-side sort, column normalization, shell class modifiers when title/header hidden. |
| `lwc/dcQueryToTableLwc/dcQueryToTableLwc.html` | Optional header (icon, title, actions), error area, `lightning-datatable`. |
| `lwc/dcQueryToTableLwc/dcQueryToTableLwc.css` | Card shell, title color via CSS variable, compact layout when title absent. |
| `lwc/dcQueryToTableLwc/dcQueryToTableLwc.js-meta.xml` | Targets: App, Home, Record; designer properties; **Account** on record pages. |

---

## Static resources / Flows

None required for this package.

---

## Not versioned here (org-specific)

| Item | Notes |
|------|--------|
| **Data Cloud** objects and SQL | Configured only in App Builder `defaultSql`. |
| **Permission sets** | Class access + Data Cloud query rights for running users. |
| **Lightning pages** | FlexiPages live in org unless you add them to a DX project. |

---

## Dependency graph (conceptual)

```
dcQueryToTableLwc
    └── Apex: DcQueryToTableController.runDataCloudSql
            └── ConnectApi.CdpQuery.queryAnsiSqlV2
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for a sequence diagram.
