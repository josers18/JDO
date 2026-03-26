# DC Prediction Model LWC

Salesforce DX project **DC_Prediction_Model_LWC**: a Lightning bundle (**Prediction Model** in App Builder) that shows a **numeric prediction** — classification-style **percent + gauge** or regression-style **integer / decimal / currency** — plus **top drivers** and **recommendations** from JSON, and an optional **Einstein Prompt Builder** summary. Data loads from an **autolaunched Flow**; the summary uses **Apex** → `ConnectApi.EinsteinLLM.generateMessagesForPromptTemplate`.

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
| [docs/UI_LAYOUT.md](docs/UI_LAYOUT.md) | **UI**: gauge vs full-width metric panel, responsive typography |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Common failures and fixes |

---

## Features

- **Classification vs regression display** — App Builder **Prediction output format**: **`percent`** shows a 0–100 **semicircle gauge** with animated arc; **`integer`**, **`decimal`**, or **`currency`** shows a **full-width metric panel** with a large formatted value (`lightning-formatted-number`) and a prominent caption (the same “gauge subtitle” property labels both modes).
- **Gauge styling (percent only)** — Arc color interpolated between configurable bad/good hex colors (HSL blend). Optional **reverse arc** mapping. Arc animation uses `stroke-dashoffset`; `renderedCallback` clears inline `stroke` so App Builder color changes apply reliably.
- **Top predictors** — Sorted list with impact % and horizontal bars; supports Einstein-style `fields[]` payloads.
- **Suggested improvements** — Same pattern, sorted by ascending impact.
- **AI summary** — Optional; JSON payload includes `prediction` and `predictionOutputFormat` for the model; one flex text input on the template.
- **Refresh** — Re-runs the flow (and auto-summary when enabled).

See [docs/UI_LAYOUT.md](docs/UI_LAYOUT.md) for how the main prediction area is structured in the DOM for each format.

---

## Prerequisites

| Requirement | Notes |
|-------------|--------|
| Salesforce org with API access | Deploy with Salesforce CLI v2 (`sf`). |
| **Autolaunched Flow** | Must expose the outputs this component reads (see [FLOW_GUIDE.md](docs/FLOW_GUIDE.md)). |
| **Einstein Generative AI** (optional) | Needed only for the AI summary card. Enable and license per your org’s product docs. |
| **Prompt template** (optional) | Created in Prompt Builder; must include a flex text input whose API name matches the LWC property (see [PROMPT_TEMPLATE_GUIDE.md](docs/PROMPT_TEMPLATE_GUIDE.md)). |

**Record page object:** The bundle’s metadata currently allows **Account** record pages (`<object>Account</object>` in `classificationModelLwc.js-meta.xml`). To use another object, add `<object>YourObject__c</object>` (or standard object name) and redeploy.

---

## Install in any Salesforce org

### 1. Clone and authorize

This project is usually cloned as part of the **[JDO](https://github.com/josers18/JDO)** repo:

```bash
git clone https://github.com/josers18/JDO.git
cd JDO/DC_Prediction_Model_LWC
sf org login web --alias my-target-org
```

If your copy is a **standalone** repo whose root is this DX project (contains `sfdx-project.json`), clone that URL and `cd` into the repo root instead. See [docs/GIT.md](docs/GIT.md) for layout and naming.

### 2. Deploy metadata

Deploy everything under `force-app` from the DX project root (`DC_Prediction_Model_LWC`; in JDO use `JDO/DC_Prediction_Model_LWC`). If the org requires Apex tests, run only this project’s test class:

```bash
cd JDO/DC_Prediction_Model_LWC   # or your standalone project root — see docs/GIT.md
sf project deploy start --source-dir force-app \
  --test-level RunSpecifiedTests \
  --tests ClassificationModelLwcControllerTest \
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
2. Edit the page → drag **Prediction Model** onto the layout.
3. Set **Autolaunched flow API name** (required on record pages).
4. Align **Flow output variable names** and **Flow input variable for record Id** with your flow.
5. Set **Prediction output format** (`percent`, `integer`, `decimal`, or `currency`) to match your flow’s prediction. Optionally set colors, titles, gauge options (percent only), currency/decimals, and prompt template Id / API name.

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
DC_Prediction_Model_LWC/          # Salesforce DX project root
├── sfdx-project.json             # name: DC_Prediction_Model_LWC
├── force-app/main/default/
│   ├── classes/
│   │   ├── ClassificationModelLwcController.cls      # Apex API name (unchanged)
│   │   └── ClassificationModelLwcControllerTest.cls
│   └── lwc/
│       └── classificationModelLwc/                   # bundle folder (App Builder: Prediction Model)
└── docs/                         # ARCHITECTURE, FLOW_GUIDE, COMPONENT_REFERENCE, UI_LAYOUT, GIT, etc.
```

In the **JDO** Git repo, the path from clone root is `JDO/DC_Prediction_Model_LWC/`.

---

## Support & customization

- **Extend to other objects:** Edit `classificationModelLwc.js-meta.xml` `<objects>` under `lightning__RecordPage`.
- **Change defaults:** App Builder properties or edit `@api` defaults in `classificationModelLwc.js` (then redeploy).

For behavior details, UI layout (gauge vs numeric panel), and troubleshooting, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/UI_LAYOUT.md](docs/UI_LAYOUT.md), [docs/COMPONENT_REFERENCE.md](docs/COMPONENT_REFERENCE.md), and [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md).

---

## License

Use and modify according to your organization’s policies. No license file is included unless you add one.
