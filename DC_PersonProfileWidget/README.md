# DC Person Profile Widget

Premium **financial services customer profile** experience for **Account** and **Contact** record pages (also **App** and **Home** with a reduced property set). The Lightning bundle **`customerProfileWidget`** loads profile data from **CRM SOQL** (standard and optional custom fields), optionally from an **autolaunched profile assembly Flow** whose **output variables** map to card slots, optionally merges a **prediction Flow** for the Insight tab, and can call **Einstein Prompt Builder** for a short narrative.

<div align="center">

[![Salesforce DX](https://img.shields.io/badge/Salesforce-DX-00A1E0?style=for-the-badge&logo=salesforce&logoColor=white)](https://developer.salesforce.com/developer-centers/salesforce-dx)
[![LWC](https://img.shields.io/badge/Lightning-Web_Components-0176D3?style=for-the-badge)](https://developer.salesforce.com/docs/component-library/overview/components)
[![Apex](https://img.shields.io/badge/Apex-04844B?style=for-the-badge)](https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/)
[![Einstein](https://img.shields.io/badge/Einstein-Gen_AI-7F56D9?style=for-the-badge)](https://help.salesforce.com/s/articleView?id=sf.generative_ai_prompt_builder.htm&type=5)

[![SF CLI](https://img.shields.io/badge/SF_CLI-v2-111111?style=for-the-badge&logo=gnu-bash&logoColor=white)](https://developer.salesforce.com/tools/salesforcecli)
[![Metadata API](https://img.shields.io/badge/Bundle_API-v62.0-032D60?style=for-the-badge)](https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_intro.htm)

**Six tabs** · **Theming via CSS variables** · **Flow output mapping**

</div>

---

## Documentation map

| Document | Purpose |
|----------|---------|
| [docs/INDEX.md](docs/INDEX.md) | **Master index** (all guides and references) |
| [artifacts.md](artifacts.md) | Inventory of everything under `force-app/` |
| [docs/DEPLOY.md](docs/DEPLOY.md) | CLI deploy, remote sites, optional metadata |
| [docs/SETUP.md](docs/SETUP.md) | Permissions, Lightning App Builder, Flow, smoke test |
| [docs/HOW_TO.md](docs/HOW_TO.md) | Step-by-step recipes (page, Flow, map, theme, Einstein) |
| [docs/FLOW_GUIDE.md](docs/FLOW_GUIDE.md) | Flow authoring: assembly, prediction, gauge flows |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | End-to-end behavior, merge order, sequence diagram |
| [docs/COMPONENT_REFERENCE.md](docs/COMPONENT_REFERENCE.md) | Designer properties and `@api` names |
| [docs/APEX_REFERENCE.md](docs/APEX_REFERENCE.md) | `CustomerProfileWidgetController` API and DTO keys |
| [docs/PROMPT_TEMPLATE.md](docs/PROMPT_TEMPLATE.md) | Einstein payload (`person_profile`), template binding |
| [docs/DIAGRAMS.md](docs/DIAGRAMS.md) | Mermaid diagrams (data flow, tabs, geocode, theme) |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Common deploy and runtime errors |
| [docs/samples/](docs/samples/README.md) | Sample JSON payloads for maps and Flow output |
| [docs/GIT.md](docs/GIT.md) | Monorepo path and naming |

---

## What you get

- **Header:** Gradient header, avatar ring (gold / silver / teal / custom), tier badge, optional enrollment flags, three-cell KPI strip.
- **Tabs:** Overview, AI Signals (rings + bar rows), Portfolio (donut + account rows), Services (cards + suggested enrollments), Location (decorative map + address grid + branch list), Insight (prediction, optional AI summary, recommendation rows from JSON).
- **Theming:** Presets (**Theme** / `themeMode`) plus optional hex overrides; applied as **`--wp-*`** CSS custom properties on the host and shell for consistent live vs App Builder rendering.
- **No SLDS utility layout** in the template; visuals are custom CSS and SVG.

---

## Quick deploy

```bash
cd DC_PersonProfileWidget
sf project deploy start --source-dir force-app --target-org <your-alias>
```

After deploy, complete **[docs/SETUP.md](docs/SETUP.md)** (assign **`Customer_Profile_Widget_User`**, optional Flow and prompt template).

---

## Flow outputs (no graph JSON)

Configure an **autolaunched** Flow with **output variables** and map each widget slot in **Profile output map (JSON object)**. Apex reads values with `Flow.Interview.getVariableValue`—use normal Flow data types (Text, Number, Checkbox, etc.). For **`nearbyBranches`**, use a **Text** output containing a JSON array of branch objects, or another serializable structure. See [docs/COMPONENT_REFERENCE.md](docs/COMPONENT_REFERENCE.md).

---

## Repository context

This folder is a **standalone** Salesforce DX project inside the [JDO monorepo](../README.md). See the root [deployment guide](../docs/DEPLOYMENT_GUIDE.md) for org aliases and patterns.

---

## License

Demo/educational source; adjust for your org’s policy if you republish.
