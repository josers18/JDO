# JDO documentation hub

**JDO** (**Jose’s Demo Org**) is a monorepo of standalone Salesforce DX projects. Each subfolder with `sfdx-project.json` deploys independently.

**For business and semi-technical readers:** open a project’s **`docs/INDEX.md`** first—each package lists **deploy → setup → how-to** in plain language before deeper references.

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

**Plain-language entry point:** each project has **`docs/INDEX.md`** (what to read first, deploy, how-tos).

| Project | Doc index (start here) | README | Artifacts |
|---------|------------------------|--------|-----------|
| DC_PersonProfileWidget | [INDEX](../DC_PersonProfileWidget/docs/INDEX.md) | [README](../DC_PersonProfileWidget/README.md) | [artifacts](../DC_PersonProfileWidget/artifacts.md) |
| DC_BusinessProfileWidget | [INDEX](../DC_BusinessProfileWidget/docs/INDEX.md) | [README](../DC_BusinessProfileWidget/README.md) | [artifacts](../DC_BusinessProfileWidget/artifacts.md) |
| DC_Prediction_Model_LWC | [INDEX](../DC_Prediction_Model_LWC/docs/INDEX.md) | [README](../DC_Prediction_Model_LWC/README.md) | [artifacts](../DC_Prediction_Model_LWC/artifacts.md) |
| DC_Multiclass_Prediction_LWC | [INDEX](../DC_Multiclass_Prediction_LWC/docs/INDEX.md) | [README](../DC_Multiclass_Prediction_LWC/README.md) | [artifacts](../DC_Multiclass_Prediction_LWC/artifacts.md) |
| DC_AgentForce_Output_LWC | [INDEX](../DC_AgentForce_Output_LWC/docs/INDEX.md) | [README](../DC_AgentForce_Output_LWC/README.md) | [artifacts](../DC_AgentForce_Output_LWC/artifacts.md) |
| DC_Query_to_Table_LWC | [INDEX](../DC_Query_to_Table_LWC/docs/INDEX.md) | [README](../DC_Query_to_Table_LWC/README.md) | [artifacts](../DC_Query_to_Table_LWC/artifacts.md) |

**Diagrams & properties (per project):** open `docs/ARCHITECTURE.md` and `docs/COMPONENT_REFERENCE.md` inside each folder from the project **INDEX**.

## Guides inside projects

- **Deploy / how-tos:** `docs/DEPLOY.md` and `docs/HOW_TO.md` (all projects above except optional extras).
- **Flows:** `docs/FLOW_GUIDE.md` (Prediction, Multiclass, AgentForce Output). Person and Business profile widgets each have `docs/FLOW_GUIDE.md`. Query-to-Table has no Flow dependency.
- **Prompt Builder:** `docs/PROMPT_TEMPLATE_GUIDE.md` (Prediction, Multiclass).
- **Setup / requirements:** `docs/SETUP_GUIDE.md`, `docs/REQUIREMENTS.md` (AgentForce Output); `docs/SETUP_GUIDE.md` (Query to Table); `docs/SETUP.md` (Person Profile Widget).
- **Git / naming:** `docs/GIT.md` in each project.
