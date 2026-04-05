# DC Prediction Model LWC

## In everyday terms

**Prediction Model** is a Lightning card for **machine-learning style scores**: either a **semicircle gauge** (when the outcome is a **percent**) or a **large number** (count, decimal, or **currency**). It lists **what drove the prediction** and **suggested next steps** from JSON your **autolaunched Flow** returns. You can add an **AI summary** in plain language via **Prompt Builder**. Users **refresh** the card; they do not configure the model inside the component.

**Themes:** App Builder **Theme** and optional in-card switcher use **`predictionThemes.js`** (same CSS variable presets as the Customer / Business profile widgets). **Visual catalog:** [docs/assets/widget_theme_catalog.pdf](docs/assets/widget_theme_catalog.pdf) · [monorepo hub](../docs/THEME_CATALOG.md) · [COMPONENT_REFERENCE](docs/COMPONENT_REFERENCE.md) (Theme section).

**Different package from [Multiclass Prediction](../DC_Multiclass_Prediction_LWC/README.md):** That one shows a **text category** and a **diverging bar** chart. This one shows a **gauge or numeric hero** + drivers.

<div align="center">

[![Salesforce DX](https://img.shields.io/badge/Salesforce-DX-00A1E0?style=for-the-badge&logo=salesforce&logoColor=white)](https://developer.salesforce.com/developer-centers/salesforce-dx)
[![LWC](https://img.shields.io/badge/Lightning-Web_Components-0176D3?style=for-the-badge)](https://developer.salesforce.com/docs/component-library/overview/components)
[![Apex](https://img.shields.io/badge/Apex-04844B?style=for-the-badge)](https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/)
[![Flow](https://img.shields.io/badge/Flow-Autolaunched-5865F2?style=for-the-badge)](https://help.salesforce.com/s/articleView?id=sf.flow.htm&type=5)
[![Einstein](https://img.shields.io/badge/Einstein-Prompt_Builder-7F56D9?style=for-the-badge)](https://help.salesforce.com/s/articleView?id=sf.generative_ai_prompt_builder.htm&type=5)
[![SF CLI](https://img.shields.io/badge/SF_CLI-v2-111111?style=for-the-badge&logo=gnu-bash&logoColor=white)](https://developer.salesforce.com/tools/salesforcecli)
[![Monorepo](https://img.shields.io/badge/Monorepo-JDO-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/josers18/JDO)

**Gauge or metric** · **Drivers & recommendations** · **Optional AI summary**

</div>

---

## Where to start

| Step | Document |
|------|----------|
| 1 | **[docs/INDEX.md](docs/INDEX.md)** — full table of contents |
| 2 | **[docs/DEPLOY.md](docs/DEPLOY.md)** — install |
| 3 | **[docs/FLOW_GUIDE.md](docs/FLOW_GUIDE.md)** — Flow outputs |
| 4 | **[docs/HOW_TO.md](docs/HOW_TO.md)** — percent vs currency, page setup |

---

## Documentation map (plain language)

| Document | What it is for |
|----------|----------------|
| [docs/INDEX.md](docs/INDEX.md) | Master index |
| [docs/DEPLOY.md](docs/DEPLOY.md) | Deploy + tests |
| [docs/HOW_TO.md](docs/HOW_TO.md) | Short recipes |
| [artifacts.md](artifacts.md) | Source files |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Diagrams |
| [docs/FLOW_GUIDE.md](docs/FLOW_GUIDE.md) | Flow contract |
| [docs/PROMPT_TEMPLATE_GUIDE.md](docs/PROMPT_TEMPLATE_GUIDE.md) | Einstein template |
| [docs/COMPONENT_REFERENCE.md](docs/COMPONENT_REFERENCE.md) | Every property |
| [docs/assets/widget_theme_catalog.pdf](docs/assets/widget_theme_catalog.pdf) | **Theme catalog (PDF)** — **42 themes** ([hub](../docs/THEME_CATALOG.md)) |
| [docs/UI_LAYOUT.md](docs/UI_LAYOUT.md) | Gauge vs number layout |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Fixes |
| [docs/GIT.md](docs/GIT.md) | Clone path |

---

## Prerequisites (short)

| Need | Notes |
|------|--------|
| **DC Prediction Model User** | Access to **`ClassificationModelLwcController`**. |
| **Autolaunched Flow** | See **FLOW_GUIDE**. |
| **Einstein** (optional) | AI summary only. |

**Record page:** Defaults to **Account**; extend `classificationModelLwc.js-meta.xml` for other objects.

---

## Quick deploy

```bash
cd DC_Prediction_Model_LWC
sf project deploy start --source-dir force-app --target-org <alias> --wait 10
```

Tests: **[docs/DEPLOY.md](docs/DEPLOY.md)**. Then permission set + Flow + **[docs/PROMPT_TEMPLATE_GUIDE.md](docs/PROMPT_TEMPLATE_GUIDE.md)** if using AI.

---

## Features (short)

- **Percent** → animated gauge; **integer / decimal / currency** → large formatted value.  
- **Top predictors** and **recommendations** from JSON.  
- **Refresh** reruns Flow (and summary when on).  
- Detail: **[docs/UI_LAYOUT.md](docs/UI_LAYOUT.md)**.

---

## Local development (optional)

```bash
npm install
npm run test:unit
```

---

## Repository layout

```
DC_Prediction_Model_LWC/
├── sfdx-project.json
├── force-app/main/default/
│   ├── classes/ClassificationModelLwcController.cls (+ test)
│   └── lwc/classificationModelLwc/   ← App Builder: Prediction Model
└── docs/
```

**JDO path:** `JDO/DC_Prediction_Model_LWC/`.

---

## License

Use per your organization’s policies.
