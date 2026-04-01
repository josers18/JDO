# JDO documentation hub

**JDO** (**Jose’s Demo Org**) is a monorepo of standalone Salesforce DX projects. Each subfolder with `sfdx-project.json` deploys independently.

## Start here

| Document | Purpose |
|----------|---------|
| [MONOREPO_OVERVIEW.md](MONOREPO_OVERVIEW.md) | Layout, clone paths, how projects relate |
| [COMPONENT_GUIDE.md](COMPONENT_GUIDE.md) | Every exposed LWC: purpose, targets, deep links |
| [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) | `sf project deploy` patterns and org aliases |
| [MOBILE_AND_FORM_FACTORS.md](MOBILE_AND_FORM_FACTORS.md) | Why Home does not show on phone; activation |
| [DIAGRAMS.md](DIAGRAMS.md) | Consolidated Mermaid diagrams (architecture) |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Narrative + links to per-project architecture docs |
| [ARTIFACTS.md](ARTIFACTS.md) | Links to each project’s `artifacts.md` inventory |

## Per-project documentation

| Project | README | Artifacts | Architecture | Component properties |
|---------|--------|-----------|--------------|------------------------|
| DC_Prediction_Model_LWC | [README](../DC_Prediction_Model_LWC/README.md) | [artifacts](../DC_Prediction_Model_LWC/artifacts.md) | [ARCHITECTURE](../DC_Prediction_Model_LWC/docs/ARCHITECTURE.md) | [COMPONENT_REFERENCE](../DC_Prediction_Model_LWC/docs/COMPONENT_REFERENCE.md) |
| DC_Multiclass_Prediction_LWC | [README](../DC_Multiclass_Prediction_LWC/README.md) | [artifacts](../DC_Multiclass_Prediction_LWC/artifacts.md) | [ARCHITECTURE](../DC_Multiclass_Prediction_LWC/docs/ARCHITECTURE.md) | [COMPONENT_REFERENCE](../DC_Multiclass_Prediction_LWC/docs/COMPONENT_REFERENCE.md) |
| DC_AgentForce_Output_LWC | [README](../DC_AgentForce_Output_LWC/README.md) | [artifacts](../DC_AgentForce_Output_LWC/artifacts.md) | [ARCHITECTURE](../DC_AgentForce_Output_LWC/docs/ARCHITECTURE.md) | [COMPONENT_REFERENCE](../DC_AgentForce_Output_LWC/docs/COMPONENT_REFERENCE.md) |
| DC_Query_to_Table_LWC | [README](../DC_Query_to_Table_LWC/README.md) | [artifacts](../DC_Query_to_Table_LWC/artifacts.md) | [ARCHITECTURE](../DC_Query_to_Table_LWC/docs/ARCHITECTURE.md) | [COMPONENT_REFERENCE](../DC_Query_to_Table_LWC/docs/COMPONENT_REFERENCE.md) |
| DC_PersonProfileWidget | [README](../DC_PersonProfileWidget/README.md) | [artifacts](../DC_PersonProfileWidget/artifacts.md) | [ARCHITECTURE](../DC_PersonProfileWidget/docs/ARCHITECTURE.md) | [COMPONENT_REFERENCE](../DC_PersonProfileWidget/docs/COMPONENT_REFERENCE.md) |

## Guides inside projects

- **Flows:** `docs/FLOW_GUIDE.md` (Prediction, Multiclass, AgentForce Output). Query-to-Table has no Flow dependency.
- **Prompt Builder:** `docs/PROMPT_TEMPLATE_GUIDE.md` (Prediction, Multiclass).
- **Setup / requirements:** `docs/SETUP_GUIDE.md`, `docs/REQUIREMENTS.md` (AgentForce Output); `docs/SETUP_GUIDE.md` (Query to Table); `docs/SETUP.md` (Person Profile Widget — Named Credential, Apex, Flow).
- **Git / naming:** `docs/GIT.md` in each project.
