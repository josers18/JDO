# Git and repository layout

## Where this project lives

**Salesforce DX project name:** `DC_Prediction_Model_LWC` (see `sfdx-project.json`).

**Default Git layout:** This folder is tracked inside the **[JDO](https://github.com/josers18/JDO)** monorepo:

```text
JDO/
└── DC_Prediction_Model_LWC/    ← Salesforce project root (sfdx-project.json here)
    ├── force-app/
    ├── docs/
    ├── README.md
    └── ...
```

Clone and open the DX project:

```bash
git clone https://github.com/josers18/JDO.git
cd JDO/DC_Prediction_Model_LWC
```

All `sf project deploy` / `npm` commands in this documentation assume your shell **current directory** is `DC_Prediction_Model_LWC` (the directory that contains `sfdx-project.json`).

If you copied only this tree into a **standalone** repository, clone that repo instead and `cd` to the root that contains `sfdx-project.json`.

---

## Naming reference (docs vs metadata)

| What you see | Technical / API name | Notes |
|--------------|----------------------|--------|
| **Prediction Model** | — | Lightning App Builder **master label** (`classificationModelLwc.js-meta.xml`). |
| LWC bundle folder | `lwc/classificationModelLwc/` | Bundle API name; unchanged so existing org deployments stay compatible. |
| Apex controller | `ClassificationModelLwcController` | Class API name; unchanged for compatibility. |
| Apex test | `ClassificationModelLwcControllerTest` | Run with `--tests ClassificationModelLwcControllerTest` when using `RunSpecifiedTests`. |

---

## Contributing via Git

1. Create a branch from `main` in the repo you use (JDO or standalone).
2. Make changes under `DC_Prediction_Model_LWC/` (or your standalone root).
3. Run lint/tests locally if configured (`npm run lint`, `npm run test:unit`).
4. Commit with a clear message; open a PR against the target repo’s default branch.

Do not commit `.sfdx/`, `node_modules/`, or org auth artifacts — they are listed in `.gitignore`.
