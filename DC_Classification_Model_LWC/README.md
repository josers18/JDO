# DC Classification Model LWC

Lightning Web Component bundle that shows a **classification / prediction score** (gauge), **top drivers** and **recommendations** from JSON, and an optional **Einstein Prompt Builder** narrative summary. Data is loaded by calling an **autolaunched Flow** for the current record; the summary calls **Apex** → `ConnectApi.EinsteinLLM.generateMessagesForPromptTemplate`.

---

## Documentation map

| Document | Purpose |
|----------|---------|
| [artifacts.md](artifacts.md) | Everything in source control and what each piece does |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Data flow diagrams (Mermaid) |
| [docs/FLOW_GUIDE.md](docs/FLOW_GUIDE.md) | How to build the Flow (inputs, outputs, JSON shape) |
| [docs/PROMPT_TEMPLATE_GUIDE.md](docs/PROMPT_TEMPLATE_GUIDE.md) | How to create the prompt template and match Apex inputs |
| [docs/COMPONENT_REFERENCE.md](docs/COMPONENT_REFERENCE.md) | Every App Builder property explained |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Common failures and fixes |

---

## Features

- **Gauge** — Score 0–100% with animated arc; solid color interpolated between configurable “bad” and “good” hex colors (HSL blend). Optional **reverse arc** mapping.
- **Top predictors** — Sorted list with impact % and horizontal bars; supports Einstein-style `fields[]` payloads.
- **Suggested improvements** — Same pattern, sorted by ascending impact.
- **AI summary** — Optional; sends structured JSON to a Prompt Builder template via one flex text input.
- **Refresh** — Re-runs the flow (and auto-summary when enabled).

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

```bash
git clone <your-repo-url>
cd DC_Classification_Model_LWC
sf org login web --alias my-target-org
```

### 2. Deploy metadata

Deploy everything under `force-app`. If the org requires Apex tests, run only this project’s test class:

```bash
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
2. Edit the page → drag **Classification Model** onto the layout.
3. Set **Autolaunched flow API name** (required on record pages).
4. Align **Flow output variable names** and **Flow input variable for record Id** with your flow.
5. Optionally set colors, titles, gauge options, and prompt template Id / API name.

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
force-app/main/default/
├── classes/
│   ├── ClassificationModelLwcController.cls
│   └── ClassificationModelLwcControllerTest.cls
└── lwc/
    └── classificationModelLwc/
```

---

## Support & customization

- **Extend to other objects:** Edit `classificationModelLwc.js-meta.xml` `<objects>` under `lightning__RecordPage`.
- **Change defaults:** App Builder properties or edit `@api` defaults in `classificationModelLwc.js` (then redeploy).

For behavior details and troubleshooting, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/COMPONENT_REFERENCE.md](docs/COMPONENT_REFERENCE.md).

---

## License

Use and modify according to your organization’s policies. No license file is included unless you add one.
