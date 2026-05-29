# JDO

**JDO** stands for **Jose’s Demo Org**. This repository holds **Salesforce DX projects**, Lightning Web Components, Apex, sample flows, and documentation used with or built for that org.

Each subfolder that contains **`sfdx-project.json`** is a **standalone** deployable package: clone the repo, `cd` into that folder, and run **`sf project deploy`** (see [docs/DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md)). Content-generation folders such as `Customer_Documents` are local generator projects and are not deployed with Salesforce DX.

<div align="center">

[![Salesforce DX](https://img.shields.io/badge/Salesforce-DX-00A1E0?style=for-the-badge&logo=salesforce&logoColor=white)](https://developer.salesforce.com/developer-centers/salesforce-dx)
[![LWC](https://img.shields.io/badge/Lightning-Web_Components-0176D3?style=for-the-badge)](https://developer.salesforce.com/docs/component-library/overview/components)
[![Apex](https://img.shields.io/badge/Apex-04844B?style=for-the-badge)](https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/)
[![Metadata API](https://img.shields.io/badge/Metadata_API-v66.0-032D60?style=for-the-badge)](https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_intro.htm)

[![Flow](https://img.shields.io/badge/Flow-Autolaunched-5865F2?style=for-the-badge)](https://help.salesforce.com/s/articleView?id=sf.flow.htm&type=5)
[![Data Cloud](https://img.shields.io/badge/Data_Cloud-SQL-7F56D9?style=for-the-badge)](https://developer.salesforce.com/docs/data/data-cloud-query-guide/guide/query-guide-get-started.html)
[![Einstein](https://img.shields.io/badge/Einstein-Gen_AI-7F56D9?style=for-the-badge)](https://help.salesforce.com/s/articleView?id=sf.generative_ai_prompt_builder.htm&type=5)

[![SF CLI](https://img.shields.io/badge/SF_CLI-v2-111111?style=for-the-badge&logo=gnu-bash&logoColor=white)](https://developer.salesforce.com/tools/salesforcecli)
[![GitHub](https://img.shields.io/badge/GitHub-josers18%2FJDO-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/josers18/JDO)

[![Snowflake](https://img.shields.io/badge/Snowflake-Federate_/_Zero_Copy-29B5E8?style=for-the-badge&logo=snowflake&logoColor=white)](Snowflake_Cumulus_Common/docs/ROLLOUT.md)
[![Cumulus Datasets](https://img.shields.io/badge/Cumulus_Datasets-13_LIVE-00A1E0?style=for-the-badge)](Snowflake_Cumulus_Common/docs/ROLLOUT.md)
[![Cumulus Rows](https://img.shields.io/badge/Cumulus_Rows-3.97M-181717?style=for-the-badge)](Snowflake_Cumulus_Common/docs/ROLLOUT.md)
[![Multi-Org](https://img.shields.io/badge/Multi--Org-Phase_A_LIVE-2EA44F?style=for-the-badge)](Snowflake_Cumulus_Common/docs/ROLLOUT.md)

<br/>

**Monorepo** · **DX packages + generated content** · **LWCs + Apex + docs**

</div>

---

## Documentation hub

| Resource | Description |
|----------|-------------|
| [docs/INDEX.md](docs/INDEX.md) | Central index of all guides |
| [docs/COMPONENT_GUIDE.md](docs/COMPONENT_GUIDE.md) | **Component guide:** every exposed LWC, targets, links to property reference |
| [docs/MONOREPO_OVERVIEW.md](docs/MONOREPO_OVERVIEW.md) | Repo layout, naming vs App Builder labels |
| [docs/DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md) | Deploy commands and post-deploy checklist |
| [docs/MOBILE_AND_FORM_FACTORS.md](docs/MOBILE_AND_FORM_FACTORS.md) | Why **Home** does not appear on phone; app/record activation |
| [docs/DIAGRAMS.md](docs/DIAGRAMS.md) | **Mermaid diagrams** (monorepo, Flow pattern, Data Cloud query, feedback) |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | High-level architecture and links to per-project docs |
| [docs/ARTIFACTS.md](docs/ARTIFACTS.md) | Index of per-project **`artifacts.md`** inventories |
| [docs/THEME_CATALOG.md](docs/THEME_CATALOG.md) | **Theme catalog (PDF)** for profile + prediction widgets (GitHub Pages–friendly) |
| [CHANGELOG.md](CHANGELOG.md) | **Changelog** — month-by-month log of additions, changes, fixes (Slack-friendly) |

---

## Projects

Each folder with `sfdx-project.json` is its own deployable package. Content-generation folders are listed here as repo assets. For **easy onboarding**, open the project’s README or **`docs/INDEX.md`** when present.

| Path | In short | Doc index |
|------|----------|-----------|
| [**Customer_Hydration**](Customer_Hydration/README.md) | **Customer hydration CLI** for the JDO demo org — Python pipeline that generates ~10K realistic Cumulus Bank customers (4 personas) with full FSC party-model linking, dual-lineage coverage (legacy + native FSC), Apex post-load wireup, and Data Cloud stream refresh. Phase 1 of the spec; 6 implementation plans. | [README](Customer_Hydration/README.md) · [INDEX](Customer_Hydration/docs/INDEX.md) · [briefs](Customer_Hydration/docs/BANKER_BRIEFS.md) |
| [**Customer_Documents**](Customer_Documents/README.md) | **Customer document generation** — ReportLab-based PDF catalog for content-heavy onboarding, relationship review, service/retention, Salesforce-backed KYC briefs, and business Account Articles of Incorporation. KYC files use `<AccountId>_KYC_<date>.pdf`; Articles files use `<AccountId>_Articles_of_Incorporation_<date>.pdf`. | [README](Customer_Documents/README.md) · [documents](Customer_Documents/documents/README.md) · [artifacts](Customer_Documents/docs/ARTIFACTS.md) |
| [**DC_PersonProfileWidget**](DC_PersonProfileWidget/README.md) | **Customer profile** card (Account + Contact); seven tabs incl. Structure; SOQL + **`flow:`/`flows:`**; optional **Insight** Einstein + optional **Overview Agentforce** above Contact (`getAgentforceOverviewSummary`); icon field rows; Account rollups (e.g. open cases / open opp amount) | [docs/INDEX](DC_PersonProfileWidget/docs/INDEX.md) |
| [**DC_BusinessProfileWidget**](DC_BusinessProfileWidget/README.md) | **Business profile** card (Account only); **Pipeline** tab (open Opps); FinServ **active financial accounts** count; field maps = SOQL path or **`flow:`**; optional **Overview Agentforce** (`getAgentforceOverviewSummary`); 42 themes; icon rows | [docs/INDEX](DC_BusinessProfileWidget/docs/INDEX.md) |
| [**DC_Prediction_Model_LWC**](DC_Prediction_Model_LWC/README.md) | **Prediction Model** — percent **gauge** or big **number**, drivers, optional summary; **profile-aligned themes** (`predictionThemes.js`) | [docs/INDEX](DC_Prediction_Model_LWC/docs/INDEX.md) |
| [**DC_Multiclass_Prediction_LWC**](DC_Multiclass_Prediction_LWC/README.md) | **Multiclass** — **text category** + diverging bars; same **theme tokens** as Prediction Model / profile widgets | [docs/INDEX](DC_Multiclass_Prediction_LWC/docs/INDEX.md) |
| [**DC_AgentForce_Output_LWC**](DC_AgentForce_Output_LWC/README.md) | **Agent output** card — shows Flow-generated text/HTML/Markdown; copy, print, optional thumbs | [docs/INDEX](DC_AgentForce_Output_LWC/docs/INDEX.md) |
| [**DC_Query_to_Table_LWC**](DC_Query_to_Table_LWC/README.md) | **Data Cloud SQL** results as a **sortable table** on a Lightning page | [docs/INDEX](DC_Query_to_Table_LWC/docs/INDEX.md) |
| [**Web_Engagements_RT_Timeline**](Web_Engagements_RT_Timeline/README.md) | **Multi-source real-time timeline** (Account/Contact); Data Cloud Data Graph (default `RT_Web_Engagementsv2`) **hot cache + cold-store DMO backfill** so the timeline stays populated after the real-time cache window expires; **+** opt-in CRM sources: **Cases / Tasks (incl. logged calls) / Calendar Events / Agentforce VoiceCalls**. Style B day-grouped card stream with **per-source colored chip filters**, source-colored left rails, **wrapping titles + sub-row metadata**, **inter-card dividers**, expand-on-click details, partial-failure retry banners. 10 App Builder properties (Data Graph name, branding, height, source toggles, lookback). 39 Apex tests + 28 Jest tests. | [README](Web_Engagements_RT_Timeline/README.md) · [artifacts](Web_Engagements_RT_Timeline/artifacts.md) · [spec](Web_Engagements_RT_Timeline/docs/superpowers/specs/2026-05-17-revamp-design.md) |
| [**Snowflake**](Snowflake/README.md) | **Snowflake data pipelines hub** — centralized docs for the `FINS.PUBLIC` schema: daily trade generation (1.87M trades), CSAT/NPS scoring (29K scores), account sync from Data Cloud, retry wrapper, execution logging, and daily email reporting. 8 scheduled tasks, 10 stored procedures, 38 tables. | [README](Snowflake/README.md) · [Architecture](Snowflake/docs/ARCHITECTURE.md) · [Processes](Snowflake/docs/PROCESSES.md) · [Artifacts](Snowflake/docs/ARTIFACTS.md) |
| [**Snowflake_Cumulus_Common**](Snowflake_Cumulus_Common/README.md) | **Cumulus data pipelines foundation** — shared `V_ACCOUNT_ANCHORS` view (v1.2 multi-org-additive), anchor fixture, and Python helpers for the 13 Cumulus dataset pipelines (Plans 1–13, all LIVE). DC ingests each per-dataset table via the "Snowflake (Federate / Zero Copy)" connector. **Multi-org rollout runbook** at [`docs/ROLLOUT.md`](Snowflake_Cumulus_Common/docs/ROLLOUT.md). | [README](Snowflake_Cumulus_Common/README.md) · [AGENTS](Snowflake_Cumulus_Common/AGENTS.md) · [ROLLOUT](Snowflake_Cumulus_Common/docs/ROLLOUT.md) |
| [**Snowflake_Cumulus_Datasets** (×13)](Snowflake_Claritas_Demographics/README.md) | **13 Cumulus FSC dataset pipelines** — Snowpark Python SPs producing deterministic, idempotent synthetic data federated zero-copy into Data Cloud as DLO/DMO pairs (`hasMappings=true` across all 13). **3.97M rows live** in `FINS.PUBLIC` as of 2026-05-29. Plans: Claritas Demographics (1) · MSCI ESG (2) · DnB BusinessCredit (3) · Esri GeoFootprint (4) · CoreLogic Property (5) · Plaid Held-Away (6) · World-Check AML (7) · MGP Financial Plans (8) · Synth Relationship Graph (9) · BoardEx Exec Intel (10) · ZoomInfo Firmographics (11) · Gong Call Sentiment (12) · Moody's Market Context (13). Multi-org Phase A migration LIVE — all 13 carry `ORG_ID VARCHAR(18) DEFAULT 'JDO'` as first column. | [Plan 1](Snowflake_Claritas_Demographics/AGENTS.md) · [Plan 8](Snowflake_MoneyGuidePro_FinancialPlans/AGENTS.md) · [Plan 13](Snowflake_Moodys_MarketContext/AGENTS.md) · [ROLLOUT](Snowflake_Cumulus_Common/docs/ROLLOUT.md) |

---

## Quick clone and deploy (example)

```bash
git clone https://github.com/josers18/JDO.git
cd JDO/DC_Query_to_Table_LWC
sf project deploy start --source-dir force-app --target-org <your-alias>
```

---

## License and contributions

Content is provided as demo/educational source. Adjust licenses and contribution rules to match your team’s policy if you fork or republish.
