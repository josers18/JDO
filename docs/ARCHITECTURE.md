# Repository architecture

## Purpose

JDO groups **demo-grade Salesforce packages** used with a single demo org: prediction UIs, generative output display, and Data Cloud SQL tables. Each package is deployable on its own.

## Technical themes

| Theme | Projects |
|-------|----------|
| **Flow as integration layer** | Prediction Model, Multiclass, AgentForce Output |
| **Einstein Prompt Builder (optional)** | Prediction Model, Multiclass |
| **Data Cloud in-org query** | DC Query to Table (`ConnectApi.CdpQuery.queryAnsiSqlV2`) |
| **Rich text / Markdown** | AgentForce Output (static **marked** + `lightning-formatted-rich-text`) |
| **Tabular SLDS data table** | DC Query to Table (`lightning-datatable`) |
| **CRM + Flow-assembled tabbed profile UI** | DC Person Profile Widget (Account + Contact; SOQL + **`flow:`/`flows:`** slots + optional Flows + Einstein; **icon + label** field rows on key tabs; optional live rollups such as open case count and summed open opportunity amounts on Account); DC Business Profile Widget (Account; `fieldMappingsJson` SOQL or **`flow:`**; **Pipeline** tab lists open Opportunities; **Active products** can reflect **FinServ Financial Account** count when that object exists; icon rows on Overview, Credit facilities, Structure) |
| **Shared theme tokens (profile-aligned)** | DC Prediction Model + DC Multiclass Prediction import **`predictionThemes.js`** (same CSS variable keys as profile widgets; App Builder **Theme** / optional header switcher) |

## Documentation map

- **Visual diagrams:** [DIAGRAMS.md](DIAGRAMS.md)
- **Per-project deep dives:**
  - [DC_Prediction_Model_LWC/docs/ARCHITECTURE.md](../DC_Prediction_Model_LWC/docs/ARCHITECTURE.md)
  - [DC_Multiclass_Prediction_LWC/docs/ARCHITECTURE.md](../DC_Multiclass_Prediction_LWC/docs/ARCHITECTURE.md)
  - [DC_AgentForce_Output_LWC/docs/ARCHITECTURE.md](../DC_AgentForce_Output_LWC/docs/ARCHITECTURE.md)
  - [DC_Query_to_Table_LWC/docs/ARCHITECTURE.md](../DC_Query_to_Table_LWC/docs/ARCHITECTURE.md)
  - [DC_PersonProfileWidget/docs/ARCHITECTURE.md](../DC_PersonProfileWidget/docs/ARCHITECTURE.md)
  - [DC_BusinessProfileWidget/docs/ARCHITECTURE.md](../DC_BusinessProfileWidget/docs/ARCHITECTURE.md)

## Security posture (high level)

- Controllers use **`with sharing`** where implemented.
- **Query to Table** executes **admin-configured SQL**; restrict Apex class access and treat SQL as sensitive.
- **Person** and **Business** profile widgets use **SOQL** and optional **Flow** outputs (`with sharing`). Person Profile optional shipped **Named Credential** metadata is not used by the controller’s main profile path.
- **AgentForce Output** renders flow-supplied HTML/Markdown through platform components; org should trust the Flow and connected features.

## Not in source control

Typical org-specific assets: production Flow definitions beyond samples, permission sets, Prompt templates, Named Credentials for cross-org patterns, and FlexiPage XML unless you choose to version them separately.
