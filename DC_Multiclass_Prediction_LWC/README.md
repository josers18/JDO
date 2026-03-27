# DC Multiclass Prediction LWC

> **Status:** Multiclass **text** prediction from Flow (`prediction` string, e.g. `Wealth_Management`), **recommendations** JSON only (no factors, no gauge). Bundle **`multiclassPredictionLwc`** and Apex **`MulticlassPredictionLwcController`** — distinct from **DC_Prediction_Model_LWC**, so both can deploy to the same org.

<div align="center">

[![Salesforce DX](https://img.shields.io/badge/Salesforce-DX-00A1E0?style=for-the-badge&logo=salesforce&logoColor=white)](https://developer.salesforce.com/developer-centers/salesforce-dx)
[![LWC](https://img.shields.io/badge/Lightning-Web_Components-0176D3?style=for-the-badge)](https://developer.salesforce.com/docs/component-library/overview/components)
[![Apex](https://img.shields.io/badge/Apex-04844B?style=for-the-badge)](https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/)
[![Metadata API](https://img.shields.io/badge/API-v66.0-032D60?style=for-the-badge)](https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_intro.htm)
[![Flow](https://img.shields.io/badge/Flow-Autolaunched-5865F2?style=for-the-badge)](https://help.salesforce.com/s/articleView?id=sf.flow.htm&type=5)
[![Einstein](https://img.shields.io/badge/Einstein-Prompt_Builder-7F56D9?style=for-the-badge)](https://help.salesforce.com/s/articleView?id=sf.generative_ai_prompt_builder.htm&type=5)

[![SF CLI](https://img.shields.io/badge/SF_CLI-v2-111111?style=for-the-badge&logo=gnu-bash&logoColor=white)](https://developer.salesforce.com/tools/salesforcecli)
[![Node.js](https://img.shields.io/badge/Node.js-tooling-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![ESLint](https://img.shields.io/badge/ESLint-4B32C3?style=for-the-badge&logo=eslint&logoColor=white)](https://eslint.org/)
[![Prettier](https://img.shields.io/badge/Prettier-code_style-F7B93E?style=for-the-badge&logo=prettier&logoColor=black)](https://prettier.io/)
[![Jest](https://img.shields.io/badge/Jest-LWC_unit_tests-C21325?style=for-the-badge&logo=jest&logoColor=white)](https://jestjs.io/)
[![GitHub](https://img.shields.io/badge/Monorepo-JDO-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/josers18/JDO)

<br/>

**Multiclass label** · **Recommendations + bars** · **Optional generative summary**

</div>

---

Salesforce DX project **DC_Multiclass_Prediction_LWC**: a Lightning bundle (**Multiclass Prediction** in App Builder) that shows a **text predicted class** in a hero panel, **suggested improvements** from the same JSON array pattern as **DC_Prediction_Model_LWC**, and an optional **Einstein Prompt Builder** summary. Data loads from an **autolaunched Flow**. The summary uses **Apex** → `ConnectApi.EinsteinLLM.generateMessagesForPromptTemplate` with JSON keys **`prediction`** (string), **`predictionType`**: `multiclass_label`, and **`recommendations`**.

---

## Documentation map

| Document | Purpose |
|----------|---------|
| [docs/GIT.md](docs/GIT.md) | **Git**: monorepo path, clone commands, naming vs metadata |
| [artifacts.md](artifacts.md) | Everything in source control and what each piece does |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Data flow diagrams (Mermaid) |
| [docs/FLOW_GUIDE.md](docs/FLOW_GUIDE.md) | How to build the Flow (inputs, outputs, JSON shape) |
| [docs/PROMPT_TEMPLATE_GUIDE.md](docs/PROMPT_TEMPLATE_GUIDE.md) | How to create the prompt template and match Apex inputs |
| [docs/COMPONENT_REFERENCE.md](docs/COMPONENT_REFERENCE.md) | Every App Builder property explained |
| [docs/UI_LAYOUT.md](docs/UI_LAYOUT.md) | **UI**: class hero, recommendation rows, responsive typography |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Common failures and fixes |

---

## Features

- **Predicted class (text)** — Large label with configurable subtitle; optional **humanize** (underscores → title-style words).
- **Suggested improvements** — JSON array with `value` and Einstein-style `fields[]`; bars and `+/-x.x%` with configurable risk/good semantics.
- **AI summary** — Optional; payload is multiclass-only (`prediction` string, `predictionType`, `recommendations` string).
- **Refresh** — Re-runs the flow (and auto-summary when enabled).

See [docs/UI_LAYOUT.md](docs/UI_LAYOUT.md) for DOM structure.

---

## Prerequisites

| Requirement | Notes |
|-------------|--------|
| Salesforce org with API access | Deploy with Salesforce CLI v2 (`sf`). |
| **Autolaunched Flow** | Must output **text** `prediction` and `recommendations` (see [FLOW_GUIDE.md](docs/FLOW_GUIDE.md)). |
| **Einstein Generative AI** (optional) | Needed only for the AI summary. |
| **Prompt template** (optional) | Flex text input API name must match the LWC (see [PROMPT_TEMPLATE_GUIDE.md](docs/PROMPT_TEMPLATE_GUIDE.md)). |

**Record page object:** The bundle’s metadata currently allows **Account** (`<object>Account</object>` in `multiclassPredictionLwc.js-meta.xml`). Add other objects and redeploy as needed.

---

## Install in any Salesforce org

### 1. Clone and authorize

This project is usually cloned as part of the **[JDO](https://github.com/josers18/JDO)** repo:

```bash
git clone https://github.com/josers18/JDO.git
cd JDO/DC_Multiclass_Prediction_LWC
sf org login web --alias my-target-org
```

If your copy is a **standalone** repo whose root is this DX project (contains `sfdx-project.json`), clone that URL and `cd` into the repo root instead. See [docs/GIT.md](docs/GIT.md) for layout and naming.

### 2. Deploy metadata

Deploy everything under `force-app` from the DX project root (`DC_Multiclass_Prediction_LWC`; in JDO use `JDO/DC_Multiclass_Prediction_LWC`). If the org requires Apex tests, run only this project’s test class:

```bash
cd JDO/DC_Multiclass_Prediction_LWC   # or your standalone project root — see docs/GIT.md
sf project deploy start --source-dir force-app \
  --test-level RunSpecifiedTests \
  --tests MulticlassPredictionLwcControllerTest \
  --wait 30
```

Sandboxes that allow it may use `--test-level NoTestRun` (depends on org policy). For more deploy issues, see [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md).

### 3. Assign permissions

- Users need **Run Flow** access for your autolaunched flow (via profile or permission set).
- Users need permission to the **objects** the flow and prediction logic use.
- For **AI summary**: grant access to the prompt template and Einstein features per [Salesforce documentation](https://help.salesforce.com/) for your edition.

### 4. Build Flow and (optional) prompt in the org

This repository does **not** ship Flow or Prompt Template XML. Create them in Setup following:

- [docs/FLOW_GUIDE.md](docs/FLOW_GUIDE.md)
- [docs/PROMPT_TEMPLATE_GUIDE.md](docs/PROMPT_TEMPLATE_GUIDE.md)

### 5. Add the component in App Builder

1. Open an **Account** record page (or the object you added in metadata).
2. Edit the page → drag **Multiclass Prediction** onto the layout.
3. Set **Autolaunched flow API name** (required on record pages).
4. Align **Flow output** names for **prediction** (text) and **recommendations** with your flow, plus **Flow input variable for record Id**.
5. Optionally set subtitle, humanize flag, recommendation colors, and prompt template Id / API name.

**App Page / Home Page:** The component calls the flow only when both `flowApiName` and `recordId` are present. Standard **Home** pages do not provide a record Id; use a **record** context or expect the widget to stay idle until `recordId` is supplied by the host.

---

## Local development

```bash
npm install
# Optional: run Jest when tests exist
npm run test:unit
```

Project API version: see `sfdx-project.json` / component `apiVersion` (currently **66.0**).

---

## Repository layout

```
DC_Multiclass_Prediction_LWC/          # Salesforce DX project root
├── sfdx-project.json             # name: DC_Multiclass_Prediction_LWC
├── force-app/main/default/
│   ├── classes/
│   │   ├── MulticlassPredictionLwcController.cls
│   │   └── MulticlassPredictionLwcControllerTest.cls
│   └── lwc/
│       └── multiclassPredictionLwc/              # App Builder: Multiclass Prediction
└── docs/                         # ARCHITECTURE, FLOW_GUIDE, COMPONENT_REFERENCE, UI_LAYOUT, GIT, etc.
```

In the **JDO** Git repo, the path from clone root is `JDO/DC_Multiclass_Prediction_LWC/`.

---

## Support & customization

- **Extend to other objects:** Edit `multiclassPredictionLwc.js-meta.xml` `<objects>` under `lightning__RecordPage`.
- **Change defaults:** App Builder properties or edit `@api` defaults in `multiclassPredictionLwc.js` (then redeploy).

For behavior details and troubleshooting, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/UI_LAYOUT.md](docs/UI_LAYOUT.md), [docs/COMPONENT_REFERENCE.md](docs/COMPONENT_REFERENCE.md), and [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md).

---

## License

Use and modify according to your organization’s policies. No license file is included unless you add one.
