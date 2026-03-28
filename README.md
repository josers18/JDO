# JDO

**JDO** stands for **Jose’s Demo Org**. This repository is the home for **assets tied to that org**: Salesforce DX projects, Lightning Web Components, Apex, sample flows, documentation, and other demos or tooling used with or built for JDO.

If you clone this monorepo, each subfolder under **Projects** is usually a standalone DX project (`sfdx-project.json` at that path) you can deploy with the Salesforce CLI.

## Projects

| Path | Description |
|------|-------------|
| [**DC_Prediction_Model_LWC**](DC_Prediction_Model_LWC/README.md) | Salesforce DX project: **Prediction Model** LWC — Flow-driven prediction with **percent gauge** or **regression-style metric panel** (integer/decimal/currency), driver JSON lists, optional Einstein summary. Clone this repo and `cd DC_Prediction_Model_LWC` before `sf` / `npm`. Docs: [README](DC_Prediction_Model_LWC/README.md), [GIT](DC_Prediction_Model_LWC/docs/GIT.md), [UI layout](DC_Prediction_Model_LWC/docs/UI_LAYOUT.md). |
| [**DC_Multiclass_Prediction_LWC**](DC_Multiclass_Prediction_LWC/README.md) | **Work in progress:** copy of the Prediction Model DX project for **multiclass** scenarios. Same LWC/Apex API names as source until renamed — see [README](DC_Multiclass_Prediction_LWC/README.md). `cd DC_Multiclass_Prediction_LWC` for CLI from monorepo root. |
| [**DC_AgentForce_Output_LWC**](DC_AgentForce_Output_LWC/README.md) | Salesforce DX project: **DC AgentForce Output** LWC — autolaunched Flow-driven generative display (text / HTML / Markdown), copy, expand, print, optional **Models API** thumbs when the flow returns a **generation Id**. `cd DC_AgentForce_Output_LWC` before `sf project deploy`. Docs: [README](DC_AgentForce_Output_LWC/README.md), [artifacts](DC_AgentForce_Output_LWC/artifacts.md), [architecture](DC_AgentForce_Output_LWC/docs/ARCHITECTURE.md). |
