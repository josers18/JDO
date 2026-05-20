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
| **CRM + Flow-assembled tabbed profile UI** | DC Person Profile Widget (Account + Contact; SOQL + **`flow:`/`flows:`** slots + optional Flows + Einstein; **icon + label** field rows on key tabs; optional live rollups such as open case count and summed open opportunity amounts on Account); DC Business Profile Widget (Account; `fieldMappingsJson` SOQL or **`flow:`**; **Pipeline** tab lists open Opportunities with configurable row cap via **`pipelineOpportunityLimit`** / App Builder **Pipeline: max open opportunities** (default **0** → up to **2000**); **Active products** can reflect **FinServ Financial Account** count when that object exists; icon rows on Overview, Credit facilities, Structure) |
| **Shared theme tokens (profile-aligned)** | DC Prediction Model + DC Multiclass Prediction import **`predictionThemes.js`** (same CSS variable keys as profile widgets; App Builder **Theme** / optional header switcher) |
| **Hybrid two-call multi-source timeline (hot cache + cold-store backfill)** | Web_Engagements_RT_Timeline fires **Promise A** (`DataCloudWebEngagementController.getWebEngagementsWithBackfill` — orchestrates a Data Graph hot-cache fetch via `callout:Data_Cloud_API` AND a cold-store backfill from `CumulusWeb_Engagements__dlm` via `ConnectApi.CdpQuery.querySql` JOIN'd to `UnifiedLinkssotAccountAcc__dlm` on `deviceId__c = SourceRecordId__c`, merged hot-wins-on-eventId-collision into one envelope so the timeline stays populated after the real-time cache window expires) and **Promise B** (CRM SOQL aggregator `CrmTimelineController` across Case/Task/Event/VoiceCall) **in parallel**. Data Graph rows render the moment Promise A resolves; CRM events stream in below when Promise B finishes. Cold-side failures are non-fatal — the response degrades gracefully to hot-only. Filter chips operate on already-loaded data with no Apex round-trip. Helper LWC modules (`sourceConfig.js` + `timelineMappers.js`) keep the component class thin and Jest-testable. |

## Documentation map

- **Visual diagrams:** [DIAGRAMS.md](DIAGRAMS.md)
- **Per-project deep dives:**
  - [DC_Prediction_Model_LWC/docs/ARCHITECTURE.md](../DC_Prediction_Model_LWC/docs/ARCHITECTURE.md)
  - [DC_Multiclass_Prediction_LWC/docs/ARCHITECTURE.md](../DC_Multiclass_Prediction_LWC/docs/ARCHITECTURE.md)
  - [DC_AgentForce_Output_LWC/docs/ARCHITECTURE.md](../DC_AgentForce_Output_LWC/docs/ARCHITECTURE.md)
  - [DC_Query_to_Table_LWC/docs/ARCHITECTURE.md](../DC_Query_to_Table_LWC/docs/ARCHITECTURE.md)
  - [DC_PersonProfileWidget/docs/ARCHITECTURE.md](../DC_PersonProfileWidget/docs/ARCHITECTURE.md)
  - [DC_BusinessProfileWidget/docs/ARCHITECTURE.md](../DC_BusinessProfileWidget/docs/ARCHITECTURE.md)
  - [Web_Engagements_RT_Timeline/README.md](../Web_Engagements_RT_Timeline/README.md) and the [revamp design spec](../Web_Engagements_RT_Timeline/docs/superpowers/specs/2026-05-17-revamp-design.md)

## Security posture (high level)

- Controllers use **`with sharing`** where implemented.
- **Query to Table** executes **admin-configured SQL**; restrict Apex class access and treat SQL as sensitive.
- **Person** and **Business** profile widgets use **SOQL** and optional **Flow** outputs (`with sharing`). Person Profile optional shipped **Named Credential** metadata is not used by the controller’s main profile path.
- **AgentForce Output** renders flow-supplied HTML/Markdown through platform components; org should trust the Flow and connected features.

## Not in source control

Typical org-specific assets: production Flow definitions beyond samples, permission sets, Prompt templates, Named Credentials for cross-org patterns, and FlexiPage XML unless you choose to version them separately.
