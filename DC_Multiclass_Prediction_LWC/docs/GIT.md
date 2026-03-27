# Git and repository layout

This folder is **DC_Multiclass_Prediction_LWC** in the JDO monorepo — a sibling of **DC_Prediction_Model_LWC**, with its own LWC and Apex API names for **multiclass text prediction** + recommendations.

## Where this project lives

**Salesforce DX project name:** `DC_Multiclass_Prediction_LWC` (see `sfdx-project.json`).

**Default Git layout:** This folder is tracked inside the **[JDO](https://github.com/josers18/JDO)** monorepo:

```text
JDO/
└── DC_Multiclass_Prediction_LWC/    ← Salesforce project root (sfdx-project.json here)
    ├── force-app/
    ├── docs/
    ├── README.md
    └── ...
```

Clone and open the DX project:

```bash
git clone https://github.com/josers18/JDO.git
cd JDO/DC_Multiclass_Prediction_LWC
```

All `sf project deploy` / `npm` commands in this documentation assume your shell **current directory** is `DC_Multiclass_Prediction_LWC` (the directory that contains `sfdx-project.json`).

If you copied only this tree into a **standalone** repository, clone that repo instead and `cd` to the root that contains `sfdx-project.json`.

---

## Naming reference (docs vs metadata)

| What you see | Technical / API name | Notes |
|--------------|----------------------|--------|
| **Multiclass Prediction** | — | Lightning App Builder **master label** (`multiclassPredictionLwc.js-meta.xml`). |
| LWC bundle folder | `lwc/multiclassPredictionLwc/` | Bundle folder and component name. |
| Apex controller | `MulticlassPredictionLwcController` | Runs flow; builds multiclass prompt JSON. |
| Apex test | `MulticlassPredictionLwcControllerTest` | Run with `--tests MulticlassPredictionLwcControllerTest` when using `RunSpecifiedTests`. |

---

## Contributing via Git

1. Create a branch from `main` in the repo you use (JDO or standalone).
2. Make changes under `DC_Multiclass_Prediction_LWC/` (or your standalone root).
3. Run lint/tests locally if configured (`npm run lint`, `npm run test:unit`).
4. Commit with a clear message; open a PR against the target repo’s default branch.

Do not commit `.sfdx/`, `node_modules/`, or org auth artifacts — they are listed in `.gitignore`.

---

## Documentation index (this project)

| Doc | Topic |
|-----|--------|
| [README.md](../README.md) | Overview, install, features |
| [artifacts.md](../artifacts.md) | Source files and dependencies |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Diagrams, rendering, errors |
| [UI_LAYOUT.md](UI_LAYOUT.md) | Class hero, diverging chart, legend, responsive UI |
| [COMPONENT_REFERENCE.md](COMPONENT_REFERENCE.md) | App Builder properties |
| [FLOW_GUIDE.md](FLOW_GUIDE.md) | Autolaunched flow contract |
| [PROMPT_TEMPLATE_GUIDE.md](PROMPT_TEMPLATE_GUIDE.md) | Einstein prompt JSON |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Common issues |
