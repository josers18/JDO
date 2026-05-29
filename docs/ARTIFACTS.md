# Artifacts index (monorepo)

Each Salesforce DX project maintains its own **`artifacts.md`** at the project root. That file lists Apex classes, LWC bundles, static resources, sample flows, and dependencies under `force-app/main/default/`.

Content-generation projects use their own artifact inventories for generated PDFs and source generators.

| Project | Artifacts file |
|---------|----------------|
| Snowflake | [../Snowflake/docs/ARTIFACTS.md](../Snowflake/docs/ARTIFACTS.md) |
| Customer_Documents | [../Customer_Documents/docs/ARTIFACTS.md](../Customer_Documents/docs/ARTIFACTS.md) |
| DC_Prediction_Model_LWC | [../DC_Prediction_Model_LWC/artifacts.md](../DC_Prediction_Model_LWC/artifacts.md) |
| DC_Multiclass_Prediction_LWC | [../DC_Multiclass_Prediction_LWC/artifacts.md](../DC_Multiclass_Prediction_LWC/artifacts.md) |
| DC_AgentForce_Output_LWC | [../DC_AgentForce_Output_LWC/artifacts.md](../DC_AgentForce_Output_LWC/artifacts.md) |
| DC_AgentForce_Markdown_Renderer | [../DC_AgentForce_Markdown_Renderer/AGENTS.md](../DC_AgentForce_Markdown_Renderer/AGENTS.md) · [INTEGRATION_GUIDE](../DC_AgentForce_Markdown_Renderer/docs/INTEGRATION_GUIDE.md) |
| Cumulus_Assistant | [../Cumulus_Assistant/AGENTS.md](../Cumulus_Assistant/AGENTS.md) · [README](../Cumulus_Assistant/README.md) |
| DC_Query_to_Table_LWC | [../DC_Query_to_Table_LWC/artifacts.md](../DC_Query_to_Table_LWC/artifacts.md) |
| DC_PersonProfileWidget | [../DC_PersonProfileWidget/artifacts.md](../DC_PersonProfileWidget/artifacts.md) |
| DC_BusinessProfileWidget | [../DC_BusinessProfileWidget/artifacts.md](../DC_BusinessProfileWidget/artifacts.md) |
| Web_Engagements_RT_Timeline | [../Web_Engagements_RT_Timeline/artifacts.md](../Web_Engagements_RT_Timeline/artifacts.md) |
| Snowflake_Cumulus_Common | [../Snowflake_Cumulus_Common/AGENTS.md](../Snowflake_Cumulus_Common/AGENTS.md) · [ROLLOUT](../Snowflake_Cumulus_Common/docs/ROLLOUT.md) |
| Snowflake_Claritas_Demographics (Plan 1) | [AGENTS](../Snowflake_Claritas_Demographics/AGENTS.md) · [DC setup recipe](../Snowflake_Claritas_Demographics/docs/dc-setup-recipe.md) |
| Snowflake_MSCI_ESG (Plan 2) | [AGENTS](../Snowflake_MSCI_ESG/AGENTS.md) |
| Snowflake_DnB_BusinessCredit (Plan 3) | [AGENTS](../Snowflake_DnB_BusinessCredit/AGENTS.md) |
| Snowflake_Esri_GeoFootprint (Plan 4) | [AGENTS](../Snowflake_Esri_GeoFootprint/AGENTS.md) |
| Snowflake_CoreLogic_Property (Plan 5) | [AGENTS](../Snowflake_CoreLogic_Property/AGENTS.md) |
| Snowflake_Plaid_HeldAway (Plan 6) | [AGENTS](../Snowflake_Plaid_HeldAway/AGENTS.md) |
| Snowflake_WorldCheck_AML (Plan 7) | [AGENTS](../Snowflake_WorldCheck_AML/AGENTS.md) |
| Snowflake_MoneyGuidePro_FinancialPlans (Plan 8) | [AGENTS](../Snowflake_MoneyGuidePro_FinancialPlans/AGENTS.md) |
| Snowflake_Synth_RelationshipGraph (Plan 9) | [AGENTS](../Snowflake_Synth_RelationshipGraph/AGENTS.md) |
| Snowflake_BoardEx_ExecIntel (Plan 10) | [AGENTS](../Snowflake_BoardEx_ExecIntel/AGENTS.md) |
| Snowflake_ZoomInfo_Firmographics (Plan 11) | [AGENTS](../Snowflake_ZoomInfo_Firmographics/AGENTS.md) |
| Snowflake_Gong_CallSentiment (Plan 12) | [AGENTS](../Snowflake_Gong_CallSentiment/AGENTS.md) |
| Snowflake_Moodys_MarketContext (Plan 13) | [AGENTS](../Snowflake_Moodys_MarketContext/AGENTS.md) |

For a narrative overview of how packages relate, see [ARCHITECTURE.md](ARCHITECTURE.md) and [DIAGRAMS.md](DIAGRAMS.md). For the multi-org Cumulus rollout, see [ROLLOUT.md](../Snowflake_Cumulus_Common/docs/ROLLOUT.md).
