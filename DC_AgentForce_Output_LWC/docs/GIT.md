# Git and repository layout

This folder is **DC_AgentForce_Output_LWC** in the **JDO** monorepo — a Salesforce DX project for the **DC AgentForce Output** LWC and related Apex.

## Where this project lives

**Salesforce DX project name:** `DC_AgentForce_Output_LWC` (see `sfdx-project.json`).

**Typical Git layout:**

```text
JDO/
└── DC_AgentForce_Output_LWC/     ← Salesforce project root (sfdx-project.json here)
    ├── force-app/
    ├── docs/
    ├── README.md
    ├── artifacts.md
    └── ...
```

Clone and open the DX project:

```bash
git clone https://github.com/josers18/JDO.git
cd JDO/DC_AgentForce_Output_LWC
```

Run `sf project deploy` from the directory that contains `sfdx-project.json`.

---

## Naming reference

| What you see | Technical name | Notes |
|--------------|----------------|--------|
| **DC AgentForce Output** | — | App Builder **master label** (`dcAgentforceOutputLwc.js-meta.xml`). |
| LWC bundle | `lwc/dcAgentforceOutputLwc/` | Main component. |
| Expand modal | `lwc/dcAgentforceOutputModal/` | Not exposed. |
| Copy modal | `lwc/dcAgentforceCopyModal/` | Not exposed. |
| Apex | `DcAgentforceOutputController` | Flow + feedback. |
| Apex test | `DcAgentforceOutputControllerTest` | |
| Sanitizer | `LlmOutputSanitizer` | Optional reuse in other packages if copied. |

---

## Contributing

1. Branch from `main` (or your team’s default branch).
2. Change files under `DC_AgentForce_Output_LWC/`.
3. Deploy to a scratch org or sandbox and verify Flow + UI.
4. Commit with a clear message; open a PR.

Do not commit `.sfdx/`, auth files, or secrets.

---

## Documentation index

**Start here:** [INDEX.md](INDEX.md) (reading order, plain-language map).

| Doc | Topic |
|-----|--------|
| [README.md](../README.md) | Overview |
| [DEPLOY.md](DEPLOY.md) | Install |
| [HOW_TO.md](HOW_TO.md) | Short recipes |
| [artifacts.md](../artifacts.md) | File inventory |
| [REQUIREMENTS.md](REQUIREMENTS.md) | Org requirements |
| [SETUP_GUIDE.md](SETUP_GUIDE.md) | Configure Flow + page |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Diagrams |
| [FLOW_GUIDE.md](FLOW_GUIDE.md) | Flow contract |
| [COMPONENT_REFERENCE.md](COMPONENT_REFERENCE.md) | Designer properties |
| [UI_LAYOUT.md](UI_LAYOUT.md) | Visual structure |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Fixes |
