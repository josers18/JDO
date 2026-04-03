# DC Multiclass Prediction LWC

## In everyday terms

**Multiclass Prediction** is a Lightning card for outcomes that are **named categories** (for example a segment or product code)—shown as a clear **headline**—not a single percentage on a dial. **Suggested improvements** appear as a **diverging bar chart**. Data comes from an **autolaunched Flow**; you can add an **AI-written summary** with **Prompt Builder**.

**Different package from [Prediction Model](../DC_Prediction_Model_LWC/README.md):** That one uses a **gauge or big number** for numeric scores. This one uses **text class + contribution bars**. You can deploy **both** in the same org.

> The Flow returns **text** `prediction` and **recommendations** JSON—not the same shape as the Prediction Model gauge card.

<div align="center">

[![Salesforce DX](https://img.shields.io/badge/Salesforce-DX-00A1E0?style=for-the-badge&logo=salesforce&logoColor=white)](https://developer.salesforce.com/developer-centers/salesforce-dx)
[![LWC](https://img.shields.io/badge/Lightning-Web_Components-0176D3?style=for-the-badge)](https://developer.salesforce.com/docs/component-library/overview/components)
[![Apex](https://img.shields.io/badge/Apex-04844B?style=for-the-badge)](https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/)
[![Flow](https://img.shields.io/badge/Flow-Autolaunched-5865F2?style=for-the-badge)](https://help.salesforce.com/s/articleView?id=sf.flow.htm&type=5)
[![Einstein](https://img.shields.io/badge/Einstein-Prompt_Builder-7F56D9?style=for-the-badge)](https://help.salesforce.com/s/articleView?id=sf.generative_ai_prompt_builder.htm&type=5)
[![SF CLI](https://img.shields.io/badge/SF_CLI-v2-111111?style=for-the-badge&logo=gnu-bash&logoColor=white)](https://developer.salesforce.com/tools/salesforcecli)
[![Monorepo](https://img.shields.io/badge/Monorepo-JDO-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/josers18/JDO)

**Text predicted class** · **Diverging chart** · **Optional AI summary**

</div>

---

## Where to start

| Step | Document |
|------|----------|
| 1 | **[docs/INDEX.md](docs/INDEX.md)** — full table of contents |
| 2 | **[docs/DEPLOY.md](docs/DEPLOY.md)** — install |
| 3 | **[docs/FLOW_GUIDE.md](docs/FLOW_GUIDE.md)** — build the Flow |
| 4 | **[docs/HOW_TO.md](docs/HOW_TO.md)** — page and AI summary |

---

## Documentation map (plain language)

| Document | What it is for |
|----------|----------------|
| [docs/INDEX.md](docs/INDEX.md) | Master index |
| [docs/DEPLOY.md](docs/DEPLOY.md) | Deploy + tests |
| [docs/HOW_TO.md](docs/HOW_TO.md) | Short recipes |
| [artifacts.md](artifacts.md) | Files in source |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Diagrams |
| [docs/FLOW_GUIDE.md](docs/FLOW_GUIDE.md) | Flow inputs/outputs |
| [docs/PROMPT_TEMPLATE_GUIDE.md](docs/PROMPT_TEMPLATE_GUIDE.md) | Einstein JSON |
| [docs/COMPONENT_REFERENCE.md](docs/COMPONENT_REFERENCE.md) | Every property |
| [docs/UI_LAYOUT.md](docs/UI_LAYOUT.md) | Screen layout |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Fixes |
| [docs/GIT.md](docs/GIT.md) | Clone path and names |

---

## Prerequisites (short)

| Need | Notes |
|------|--------|
| Salesforce org + CLI | Deploy with `sf`. |
| **DC Multiclass Prediction User** | So users can run **`MulticlassPredictionLwcController`** and **`LlmOutputSanitizer`**. |
| **Autolaunched Flow** | Outputs described in **FLOW_GUIDE**. |
| **Einstein** (optional) | Only for AI summary + prompt template. |

**Record page:** Metadata currently allows **Account**; add objects in `multiclassPredictionLwc.js-meta.xml` if needed.

---

## Quick deploy

```bash
cd DC_Multiclass_Prediction_LWC
sf project deploy start --source-dir force-app --target-org <alias> --wait 10
```

With tests: see **[docs/DEPLOY.md](docs/DEPLOY.md)**. Then assign the permission set and **[docs/FLOW_GUIDE.md](docs/FLOW_GUIDE.md)**.

---

## Features (short)

- **Predicted class** with optional “humanize” (underscores → words).  
- **Improvements** as diverging bars; legend matches risk/good colors.  
- **Refresh** reruns Flow and summary.  
- Detail: **[docs/UI_LAYOUT.md](docs/UI_LAYOUT.md)**.

---

## Local development (optional)

```bash
npm install
npm run test:unit
```

API version: `sfdx-project.json` (currently **66.0**).

---

## Repository layout

```
DC_Multiclass_Prediction_LWC/
├── sfdx-project.json
├── force-app/main/default/
│   ├── classes/MulticlassPredictionLwcController.cls (+ test)
│   └── lwc/multiclassPredictionLwc/    ← App Builder: Multiclass Prediction
└── docs/
```

**JDO path:** `JDO/DC_Multiclass_Prediction_LWC/`.

---

## License

Use per your organization’s policies.
