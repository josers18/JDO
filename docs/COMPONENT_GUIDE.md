# Component guide (all projects)

Quick reference for **exposed** Lightning Web Components: where they run, what drives them, and where full property docs live.

## Summary table

| App Builder name | LWC bundle | Targets | Data source | Full property list |
|------------------|------------|---------|-------------|-------------------|
| Prediction Model | `c/classificationModelLwc` | App, Home, Record (Account in meta) | Autolaunched Flow + optional Prompt template | [DC_Prediction_Model_LWC/docs/COMPONENT_REFERENCE.md](../DC_Prediction_Model_LWC/docs/COMPONENT_REFERENCE.md) |
| Multiclass Prediction | `c/multiclassPredictionLwc` | App, Home, Record | Autolaunched Flow + optional Prompt template | [DC_Multiclass_Prediction_LWC/docs/COMPONENT_REFERENCE.md](../DC_Multiclass_Prediction_LWC/docs/COMPONENT_REFERENCE.md) |
| DC AgentForce Output | `c/dcAgentforceOutputLwc` | App, Home, Record | Autolaunched Flow (text / HTML / Markdown) | [DC_AgentForce_Output_LWC/docs/COMPONENT_REFERENCE.md](../DC_AgentForce_Output_LWC/docs/COMPONENT_REFERENCE.md) |
| DC Query to Table | `c/dcQueryToTableLwc` | App, Home, Record (Account in meta) | Data Cloud SQL via Apex `ConnectApi.CdpQuery` | [DC_Query_to_Table_LWC/docs/COMPONENT_REFERENCE.md](../DC_Query_to_Table_LWC/docs/COMPONENT_REFERENCE.md) |
| Customer Profile Widget | `c/customerProfileWidget` | App, Home, Record (Account, Contact) | SOQL + **`flow:`/`flows:`** or field paths per slot; optional assembly/prediction Flows; **two optional Overview/Insight extras** — **Insight** Einstein (`generateSummary` + prediction JSON), **Overview Agentforce** above **Contact** (`getAgentforceOverviewSummary`, **Contact**/**Account** dual **Id + object** inputs), and **Overview Unified relationships** table (`getUnifiedRelationshipsQueryJson`, **`Invocable.Action`** on **`@InvocableMethod`** Apex, separate request); **`aiSummaryTextColor`** for generated narrative body; **icon + label** field rows; optional **Account** rollups (`openCasesCount`, `openOpportunitiesAmount`) | [DC_PersonProfileWidget/docs/COMPONENT_REFERENCE.md](../DC_PersonProfileWidget/docs/COMPONENT_REFERENCE.md) |
| Business Profile Widget | `c/businessProfileWidget` | App, Home, Record (Account) | `fieldMappingsJson`: Account path or **`flow:`**; optional assembly + insight Flows + Einstein; **Overview Agentforce** (`getAgentforceOverviewSummary`, **`Input:Account.Id`** + **`Input:Account`**); optional **Overview Unified relationships** table (`getUnifiedRelationshipsQueryJson`, **`Invocable.Action`** on **`@InvocableMethod`** Apex); **Pipeline** tab (open **Opportunity** rows; **Pipeline: max open opportunities** — **0** = up to **2000**, or **1–2000** to cap); live **Financial Account** count for **Active products** when FinServ is present | [DC_BusinessProfileWidget/docs/COMPONENT_REFERENCE.md](../DC_BusinessProfileWidget/docs/COMPONENT_REFERENCE.md) |

## Non-exposed building blocks

These are **not** placed directly on Lightning pages from the component palette:

| Bundle | Project | Role |
|--------|---------|------|
| `dcAgentforceOutputModal` | DC_AgentForce_Output_LWC | `LightningModal` for expanded output |
| `dcAgentforceCopyModal` | DC_AgentForce_Output_LWC | `LightningModal` for manual copy fallback |

## Record page object restrictions

`js-meta.xml` lists allowed objects for **record** targets. Today:

- **Prediction Model**, **Multiclass**, **Query to Table:** `Account` is listed as an example for record pages. Add more `<object>` entries and redeploy to support other objects.
- **Customer Profile Widget:** `Account` and `Contact` are listed in meta.
- **Business Profile Widget:** `Account` only.

See each project’s `docs/GIT.md` for metadata naming notes.

## Apex access for standard users

**Customer Profile Widget** requires **`Customer_Profile_Widget_User`** (Apex). **`Customer_Profile_Widget_DC_Callout`** is optional (shipped External Credential / Named Credential for other integrations). See [DC_PersonProfileWidget/docs/SETUP.md](../DC_PersonProfileWidget/docs/SETUP.md).

**Business Profile Widget** does **not** ship a permission set: grant **Apex class access** to **`BusinessProfileWidgetController`** on profiles or permission sets. See [DC_BusinessProfileWidget/docs/SETUP.md](../DC_BusinessProfileWidget/docs/SETUP.md).

For other components, see [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) (section **After deploy**).

## Related reading

- [THEME_CATALOG.md](THEME_CATALOG.md) — **42 shared themes** (PDF) for Customer Profile, Business Profile, Prediction Model, and Multiclass Prediction.
- [MOBILE_AND_FORM_FACTORS.md](MOBILE_AND_FORM_FACTORS.md) — Home vs phone, activation.
- [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) — Deploy commands and permission set table.
