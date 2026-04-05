# JDO

**JDO** stands for **Jose’s Demo Org**. This repository holds **Salesforce DX projects**, Lightning Web Components, Apex, sample flows, and documentation used with or built for that org.

Each subfolder that contains **`sfdx-project.json`** is a **standalone** package: clone the repo, `cd` into that folder, and run **`sf project deploy`** (see [docs/DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md)).

<div align="center">

[![Salesforce DX](https://img.shields.io/badge/Salesforce-DX-00A1E0?style=for-the-badge&logo=salesforce&logoColor=white)](https://developer.salesforce.com/developer-centers/salesforce-dx)
[![LWC](https://img.shields.io/badge/Lightning-Web_Components-0176D3?style=for-the-badge)](https://developer.salesforce.com/docs/component-library/overview/components)
[![Apex](https://img.shields.io/badge/Apex-04844B?style=for-the-badge)](https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/)
[![Metadata API](https://img.shields.io/badge/Metadata_API-v66.0-032D60?style=for-the-badge)](https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_intro.htm)

[![Flow](https://img.shields.io/badge/Flow-Autolaunched-5865F2?style=for-the-badge)](https://help.salesforce.com/s/articleView?id=sf.flow.htm&type=5)
[![Data Cloud](https://img.shields.io/badge/Data_Cloud-SQL-7F56D9?style=for-the-badge)](https://developer.salesforce.com/docs/data/data-cloud-query-guide/guide/query-guide-get-started.html)
[![Einstein](https://img.shields.io/badge/Einstein-Gen_AI-7F56D9?style=for-the-badge)](https://help.salesforce.com/s/articleView?id=sf.generative_ai_prompt_builder.htm&type=5)

[![SF CLI](https://img.shields.io/badge/SF_CLI-v2-111111?style=for-the-badge&logo=gnu-bash&logoColor=white)](https://developer.salesforce.com/tools/salesforcecli)
[![GitHub](https://img.shields.io/badge/GitHub-josers18%2FJDO-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/josers18/JDO)

<br/>

**Monorepo** · **Six DX packages** · **LWCs + Apex + docs**

</div>

---

## Documentation hub

| Resource | Description |
|----------|-------------|
| [docs/INDEX.md](docs/INDEX.md) | Central index of all guides |
| [docs/COMPONENT_GUIDE.md](docs/COMPONENT_GUIDE.md) | **Component guide:** every exposed LWC, targets, links to property reference |
| [docs/MONOREPO_OVERVIEW.md](docs/MONOREPO_OVERVIEW.md) | Repo layout, naming vs App Builder labels |
| [docs/DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md) | Deploy commands and post-deploy checklist |
| [docs/MOBILE_AND_FORM_FACTORS.md](docs/MOBILE_AND_FORM_FACTORS.md) | Why **Home** does not appear on phone; app/record activation |
| [docs/DIAGRAMS.md](docs/DIAGRAMS.md) | **Mermaid diagrams** (monorepo, Flow pattern, Data Cloud query, feedback) |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | High-level architecture and links to per-project docs |
| [docs/ARTIFACTS.md](docs/ARTIFACTS.md) | Index of per-project **`artifacts.md`** inventories |
| [docs/THEME_CATALOG.md](docs/THEME_CATALOG.md) | **Theme catalog (PDF)** for profile + prediction widgets (GitHub Pages–friendly) |

---

## Projects

Each folder with `sfdx-project.json` is its own package. For **easy onboarding**, open the project’s **`docs/INDEX.md`** (reading order, deploy, how-tos in plain language).

| Path | In short | Doc index |
|------|----------|-----------|
| [**DC_PersonProfileWidget**](DC_PersonProfileWidget/README.md) | **Customer profile** card (Account + Contact); seven tabs incl. Structure; SOQL + **`flow:`/`flows:`** + optional AI; icon field rows; Account rollups (e.g. open cases / open opp amount) | [docs/INDEX](DC_PersonProfileWidget/docs/INDEX.md) |
| [**DC_BusinessProfileWidget**](DC_BusinessProfileWidget/README.md) | **Business profile** card (Account only); **Pipeline** tab (open Opps); FinServ **active financial accounts** count; field maps = SOQL path or **`flow:`**; 42 themes; icon rows | [docs/INDEX](DC_BusinessProfileWidget/docs/INDEX.md) |
| [**DC_Prediction_Model_LWC**](DC_Prediction_Model_LWC/README.md) | **Prediction Model** — percent **gauge** or big **number**, drivers, optional summary; **profile-aligned themes** (`predictionThemes.js`) | [docs/INDEX](DC_Prediction_Model_LWC/docs/INDEX.md) |
| [**DC_Multiclass_Prediction_LWC**](DC_Multiclass_Prediction_LWC/README.md) | **Multiclass** — **text category** + diverging bars; same **theme tokens** as Prediction Model / profile widgets | [docs/INDEX](DC_Multiclass_Prediction_LWC/docs/INDEX.md) |
| [**DC_AgentForce_Output_LWC**](DC_AgentForce_Output_LWC/README.md) | **Agent output** card — shows Flow-generated text/HTML/Markdown; copy, print, optional thumbs | [docs/INDEX](DC_AgentForce_Output_LWC/docs/INDEX.md) |
| [**DC_Query_to_Table_LWC**](DC_Query_to_Table_LWC/README.md) | **Data Cloud SQL** results as a **sortable table** on a Lightning page | [docs/INDEX](DC_Query_to_Table_LWC/docs/INDEX.md) |

---

## Quick clone and deploy (example)

```bash
git clone https://github.com/josers18/JDO.git
cd JDO/DC_Query_to_Table_LWC
sf project deploy start --source-dir force-app --target-org <your-alias>
```

---

## License and contributions

Content is provided as demo/educational source. Adjust licenses and contribution rules to match your team’s policy if you fork or republish.
