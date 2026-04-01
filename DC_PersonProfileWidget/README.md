# DC Person Profile Widget

Premium **financial services customer profile** experience for **Account** and **Contact** record pages (also **App** and **Home** with a reduced property set). The Lightning bundle **`customerProfileWidget`** loads profile attributes from **Data Cloud Data Graph** (HTTP via Named Credential), enriches with **CRM SOQL** where fields are missing, optionally merges an **autolaunched Flow** for predictions and recommendations, and can call **Einstein Prompt Builder** for a short narrative on the **Insight** tab.

<div align="center">

[![Salesforce DX](https://img.shields.io/badge/Salesforce-DX-00A1E0?style=for-the-badge&logo=salesforce&logoColor=white)](https://developer.salesforce.com/developer-centers/salesforce-dx)
[![LWC](https://img.shields.io/badge/Lightning-Web_Components-0176D3?style=for-the-badge)](https://developer.salesforce.com/docs/component-library/overview/components)
[![Apex](https://img.shields.io/badge/Apex-04844B?style=for-the-badge)](https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/)
[![Data Cloud](https://img.shields.io/badge/Data_Cloud-Data_Graph-7F56D9?style=for-the-badge)](https://help.salesforce.com/s/articleView?id=sf.c360_a_data_graph.htm&type=5)
[![Einstein](https://img.shields.io/badge/Einstein-Gen_AI-7F56D9?style=for-the-badge)](https://help.salesforce.com/s/articleView?id=sf.generative_ai_prompt_builder.htm&type=5)

[![SF CLI](https://img.shields.io/badge/SF_CLI-v2-111111?style=for-the-badge&logo=gnu-bash&logoColor=white)](https://developer.salesforce.com/tools/salesforcecli)
[![Metadata API](https://img.shields.io/badge/Bundle_API-v62.0-032D60?style=for-the-badge)](https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_intro.htm)

**Six tabs** · **Theming via CSS variables** · **Configurable field paths**

</div>

---

## Documentation map

| Document | Purpose |
|----------|---------|
| [artifacts.md](artifacts.md) | Inventory of everything under `force-app/` |
| [docs/SETUP.md](docs/SETUP.md) | **Start here:** Named Credential, permissions, Lightning App Builder, smoke test |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | End-to-end behavior, merge order, diagrams |
| [docs/DATA_GRAPH.md](docs/DATA_GRAPH.md) | REST call, JSON shapes, dot-path mappings, `nearbyBranches` |
| [docs/COMPONENT_REFERENCE.md](docs/COMPONENT_REFERENCE.md) | Every designer property and `@api` name |
| [docs/PROMPT_TEMPLATE.md](docs/PROMPT_TEMPLATE.md) | Einstein payload (`person_profile`), template input binding |
| [docs/DIAGRAMS.md](docs/DIAGRAMS.md) | Mermaid diagrams (data flow, tabs, graph contract) |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Common deploy and runtime errors |

---

## What you get

- **Header:** Gradient header, avatar ring (gold / silver / teal / custom), tier badge, optional enrollment flags, three-cell KPI strip.
- **Tabs:** Overview, AI Signals (rings + bar rows), Portfolio (donut + account rows), Services (cards + suggested enrollments), Location (decorative map + address grid + branch list), Insight (prediction, optional AI summary, recommendation rows from JSON).
- **Theming:** Hex and gradient strings exposed to App Builder; applied as **`--wp-*`** CSS custom properties on the host.
- **No SLDS utility layout** in the template; visuals are custom CSS and SVG.

---

## Quick deploy

```bash
cd DC_PersonProfileWidget
sf project deploy start --source-dir force-app --target-org <your-alias>
```

After deploy, complete **[docs/SETUP.md](docs/SETUP.md)** (Named Credential **`DataCloud`**, assign permission sets **`Customer_Profile_Widget_User`** + **`Customer_Profile_Widget_DC_Callout`**, optional Flow and prompt template).

---

## Important naming note (`graphApiName`)

Public LWC properties **cannot** start with **`data`** (platform reserves `data-*` attributes). The designer property is **`graphApiName`**, not `dataGraphApiName`. Apex method parameter matches: `getProfileData(String graphApiName, ...)`.

---

## Repository context

This folder is a **standalone** Salesforce DX project inside the [JDO monorepo](../README.md). See the root [deployment guide](../docs/DEPLOYMENT_GUIDE.md) for org aliases and patterns.

---

## License

Demo/educational source; adjust for your org’s policy if you republish.
