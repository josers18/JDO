# DC Business Profile Widget

A **rich business account profile card** for Salesforce **Account** record pages. It shows header (company name, logo, KPIs), **six tabs** (Overview, **Pipeline**, Credit, Structure, Location, Insight), optional **autolaunched Flow** field assembly using the same **`flow:`** pattern as SOQL paths, **Insight** prediction Flow, **Einstein** summary, and **OpenStreetMap-backed geocoding** for the map.

**Pipeline tab:** Lists **open Opportunities** on the Account (name link, stage, amount). In **Lightning App Builder**, **Pipeline: max open opportunities** defaults to **0**, which loads up to **2000** rows (server cap; practical “all” for one Account). Set **1–2000** to cap the list. The Pipeline card scrolls when the list is long. **Active products** on Overview can show a **live count of active FinServ Financial Accounts** when `FinServ__FinancialAccount__c` exists; otherwise the mapped **Active products** field is shown as before (**N facilities**). **Overview**, **Credit → Facilities**, and **Structure → Unified relationships** use **SLDS icons** next to labels (same visual language as the Customer Profile Widget).

**In everyday terms:** Each **field mapping** in App Builder can be either an **Account field path** (for example `BillingCity`, `Owner.Name`, `Custom__c`) or **`flow:OutputVariableApiName`** so a Flow fills that slot. The server validates Account paths and runs the assembly Flow only when at least one mapping needs Flow output.

<div align="center">

[![Salesforce DX](https://img.shields.io/badge/Salesforce-DX-00A1E0?style=for-the-badge&logo=salesforce&logoColor=white)](https://developer.salesforce.com/developer-centers/salesforce-dx)
[![LWC](https://img.shields.io/badge/Lightning-Web_Components-0176D3?style=for-the-badge)](https://developer.salesforce.com/docs/component-library/overview/components)
[![Apex](https://img.shields.io/badge/Apex-04844B?style=for-the-badge)](https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/)

**Account-only** · **42 themes** · **Flow + SOQL field maps**

</div>

---

## Where to start

1. **[docs/DEPLOY.md](docs/DEPLOY.md)** — Deploy into your org.  
2. **[docs/SETUP.md](docs/SETUP.md)** — Apex access, page placement, remote sites.  
3. **[docs/HOW_TO.md](docs/HOW_TO.md)** — Map fields, Flows, themes.  
4. **[docs/COMPONENT_REFERENCE.md](docs/COMPONENT_REFERENCE.md)** — Every App Builder property.

**Full index:** [docs/INDEX.md](docs/INDEX.md)

---

## Documentation map

| Document | Purpose |
|----------|---------|
| [docs/INDEX.md](docs/INDEX.md) | Table of contents |
| [docs/DEPLOY.md](docs/DEPLOY.md) | Install and deploy |
| [docs/SETUP.md](docs/SETUP.md) | Post-install configuration |
| [docs/HOW_TO.md](docs/HOW_TO.md) | Step-by-step tasks |
| [docs/FLOW_GUIDE.md](docs/FLOW_GUIDE.md) | Assembly Flow + Insight Flow |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Data flow (LWC → Apex → SOQL/Flow) |
| [docs/COMPONENT_REFERENCE.md](docs/COMPONENT_REFERENCE.md) | Property reference |
| [docs/assets/widget_theme_catalog.pdf](docs/assets/widget_theme_catalog.pdf) | **Theme catalog (PDF)** — **42 themes** visual reference ([monorepo hub](../docs/THEME_CATALOG.md)) |
| [docs/APEX_REFERENCE.md](docs/APEX_REFERENCE.md) | Controller API |
| [docs/PROMPT_TEMPLATE.md](docs/PROMPT_TEMPLATE.md) | Einstein payload (`predictionType: business_profile`) |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Common fixes |
| [docs/DIAGRAMS.md](docs/DIAGRAMS.md) | Diagrams |
| [artifacts.md](artifacts.md) | `force-app/` inventory |
| [docs/GIT.md](docs/GIT.md) | Repo location |

---

## Quick deploy

```bash
cd DC_BusinessProfileWidget
sf project deploy start --source-dir force-app --target-org <your-org-alias> --wait 10
```

Then follow **[docs/SETUP.md](docs/SETUP.md)** so users can run **`BusinessProfileWidgetController`**.

---

## Repository context

This folder is a **Salesforce DX project** inside the [JDO monorepo](../README.md). See the root [deployment guide](../docs/DEPLOYMENT_GUIDE.md) for org aliases and shared patterns.

---

## License

Demo/educational source; adjust for your org’s policy if you republish.
