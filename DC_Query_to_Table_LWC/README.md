# DC Query to Table

## In everyday terms

**DC Query to Table** is a Lightning card that runs a **Data Cloud SQL** query you define in **Lightning App Builder** and shows the results in a **sortable table**—like a small, read-only report embedded on an app, home, or record page. End users do **not** edit SQL; they view rows and columns. You can run the query **when the page opens** or only when someone clicks **Run query**.

**Who it is for:** Teams that already use **Salesforce Data Cloud** in the **same org** where this code is installed (in-process query API). Cross-org patterns are **not** included in this package.

<div align="center">

[![Salesforce DX](https://img.shields.io/badge/Salesforce-DX-00A1E0?style=for-the-badge&logo=salesforce&logoColor=white)](https://developer.salesforce.com/developer-centers/salesforce-dx)
[![LWC](https://img.shields.io/badge/Lightning-Web_Components-0176D3?style=for-the-badge)](https://developer.salesforce.com/docs/component-library/overview/components)
[![Apex](https://img.shields.io/badge/Apex-04844B?style=for-the-badge)](https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/)
[![Data Cloud](https://img.shields.io/badge/Data_Cloud-SQL-7F56D9?style=for-the-badge)](https://developer.salesforce.com/docs/data/data-cloud-query-guide/guide/query-guide-get-started.html)
[![SF CLI](https://img.shields.io/badge/SF_CLI-v2-111111?style=for-the-badge&logo=gnu-bash&logoColor=white)](https://developer.salesforce.com/tools/salesforcecli)
[![Monorepo](https://img.shields.io/badge/Monorepo-JDO-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/josers18/JDO)

**Data Cloud SQL** · **Sortable table** · **Auto-run or manual Run query**

</div>

---

## Where to start

| Step | Document |
|------|----------|
| 1 | **[docs/INDEX.md](docs/INDEX.md)** — full table of contents |
| 2 | **[docs/DEPLOY.md](docs/DEPLOY.md)** — install into your org |
| 3 | **[docs/SETUP_GUIDE.md](docs/SETUP_GUIDE.md)** — permissions, page, SQL tips |
| 4 | **[docs/HOW_TO.md](docs/HOW_TO.md)** — quick recipes |

---

## Documentation map (plain language)

| Document | What it is for |
|----------|----------------|
| [docs/INDEX.md](docs/INDEX.md) | Master index and reading order |
| [docs/DEPLOY.md](docs/DEPLOY.md) | Deploy commands and tests |
| [docs/SETUP_GUIDE.md](docs/SETUP_GUIDE.md) | After install: perm set, App Builder, security |
| [docs/HOW_TO.md](docs/HOW_TO.md) | Short how-tos |
| [artifacts.md](artifacts.md) | What is in `force-app/` |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Sequence diagram (technical) |
| [docs/COMPONENT_REFERENCE.md](docs/COMPONENT_REFERENCE.md) | Every property |
| [docs/UI_LAYOUT.md](docs/UI_LAYOUT.md) | Header and table shell |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Empty grid, permissions |
| [docs/GIT.md](docs/GIT.md) | Monorepo path |
| [../docs/MOBILE_AND_FORM_FACTORS.md](../docs/MOBILE_AND_FORM_FACTORS.md) | Home vs phone |

---

## Requirements (short)

- **Data Cloud** in the **deployment org**, with Apex access to run Data Cloud queries.  
- Users need **Data Cloud query** permissions for your org’s model **and** Apex access to **`DcQueryToTableController`** (permission set **DC Query to Table User**).  
- **API 66.0** project — see `sfdx-project.json`.

**Security:** SQL is powerful. Limit who can **edit** the Lightning page and who gets the permission set. The component blocks obvious **write** SQL patterns, but org policy and Data Cloud roles still matter.

---

## Quick deploy

```bash
cd DC_Query_to_Table_LWC
sf project deploy start --source-dir force-app --target-org <alias> --wait 10
```

Then **[docs/SETUP_GUIDE.md](docs/SETUP_GUIDE.md)**.

---

## Behavior (short)

| Topic | Summary |
|-------|---------|
| **Load** | Optional **auto-run** on page open, or **Run query** button. |
| **SQL** | **SELECT** / **WITH … SELECT**; mutating keywords rejected. **LIMIT** added if missing (capped). |
| **Table** | Platform **lightning-datatable**; sorting and layout options come from App Builder. |
| **More rows** | If the platform returns a “next batch,” only the **first batch** is shown unless you extend the code. |

---

## Troubleshooting (very short)

Empty table → same SQL in Data Cloud Query Editor, check permissions, see **[docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)**.

---

## Project layout

| Path | Role |
|------|------|
| `force-app/.../lwc/dcQueryToTableLwc/` | UI |
| `force-app/.../classes/DcQueryToTableController.cls` | Runs `ConnectApi.CdpQuery.queryAnsiSqlV2` |

---

## References

- [Data Cloud Query Guide](https://developer.salesforce.com/docs/data/data-cloud-query-guide/guide/query-guide-get-started.html)  
- [lightning-datatable](https://developer.salesforce.com/docs/component-library/bundle/lightning-datatable/documentation)
