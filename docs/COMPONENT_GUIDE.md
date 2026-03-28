# Component guide (all projects)

Quick reference for **exposed** Lightning Web Components: where they run, what drives them, and where full property docs live.

## Summary table

| App Builder name | LWC bundle | Targets | Data source | Full property list |
|------------------|------------|---------|-------------|-------------------|
| Prediction Model | `c/classificationModelLwc` | App, Home, Record (Account in meta) | Autolaunched Flow + optional Prompt template | [DC_Prediction_Model_LWC/docs/COMPONENT_REFERENCE.md](../DC_Prediction_Model_LWC/docs/COMPONENT_REFERENCE.md) |
| Multiclass Prediction | `c/multiclassPredictionLwc` | App, Home, Record | Autolaunched Flow + optional Prompt template | [DC_Multiclass_Prediction_LWC/docs/COMPONENT_REFERENCE.md](../DC_Multiclass_Prediction_LWC/docs/COMPONENT_REFERENCE.md) |
| DC AgentForce Output | `c/dcAgentforceOutputLwc` | App, Home, Record | Autolaunched Flow (text / HTML / Markdown) | [DC_AgentForce_Output_LWC/docs/COMPONENT_REFERENCE.md](../DC_AgentForce_Output_LWC/docs/COMPONENT_REFERENCE.md) |
| DC Query to Table | `c/dcQueryToTableLwc` | App, Home, Record (Account in meta) | Data Cloud SQL via Apex `ConnectApi.CdpQuery` | [DC_Query_to_Table_LWC/docs/COMPONENT_REFERENCE.md](../DC_Query_to_Table_LWC/docs/COMPONENT_REFERENCE.md) |
| DC Carousel | `c/dcCarouselLwc` | App, Home, Record (Account in meta) | Nested LWCs via **slot** (when supported) or **slidesJson** fallback | [DC_Carousel_LWC/docs/COMPOSITION.md](../DC_Carousel_LWC/docs/COMPOSITION.md) |

## Non-exposed building blocks

These are **not** placed directly on Lightning pages from the component palette:

| Bundle | Project | Role |
|--------|---------|------|
| `dcAgentforceOutputModal` | DC_AgentForce_Output_LWC | `LightningModal` for expanded output |
| `dcAgentforceCopyModal` | DC_AgentForce_Output_LWC | `LightningModal` for manual copy fallback |

## Record page object restrictions

`js-meta.xml` lists allowed objects for **record** targets. Today:

- **Prediction Model**, **Multiclass**, **Query to Table**, **DC Carousel:** `Account` is listed as an example for record pages. Add more `<object>` entries and redeploy to support other objects.

See each project’s `docs/GIT.md` for metadata naming notes.

## Related reading

- [MOBILE_AND_FORM_FACTORS.md](MOBILE_AND_FORM_FACTORS.md) — Home vs phone, activation.
- [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) — Deploy commands.
