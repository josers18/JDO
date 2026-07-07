# ZoomInfo Firmographics — Cumulus Synthetic Dataset (B2B Company Profiles)

Synthetic ZoomInfo / DiscoverOrg / Crunchbase-style company-level firmographics dataset for Cumulus BUSINESS accounts. Mirrors
[Snowflake_MSCI_ESG](../Snowflake_MSCI_ESG) and [Snowflake_DnB_BusinessCredit](../Snowflake_DnB_BusinessCredit) — same audience predicate, same monthly cadence, same 1:1 row shape — and the Cumulus umbrella spec at
[../docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md](../docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md).

**Plan 11 is the most "boring" Plan structurally in the Cumulus rollout** — same shape as Plans 2 (MSCI ESG) and 3 (D&B Business Credit) architecturally. Two minor structural deviations both inherited from Plan 4's v1.5 string-quality findings: defensive HQ-string projection and two NULLable columns gated by data-availability heuristics. The vendor specifics — NAICS/SIC codes, employee/revenue bands, tech-stack flags — carry the differentiation, not the architecture.

## Plan
- Plan 11, instantiated from `../docs/superpowers/plans/2026-05-28-cumulus-plan-N-dataset-template.md` (v1.5)
- Per-plan file: `../docs/superpowers/plans/2026-05-28-cumulus-plan-11-zoominfo-firmographics.md`
- Rowspec: `../docs/superpowers/plans/attachments/cumulus-plan-11-zoominfo-firmographics-rowspec.md`
- Depends on: [Snowflake_Cumulus_Common](../Snowflake_Cumulus_Common) (Plan 0)

## Snowflake objects
- Table: `DATA_JEDAIS.FINS__PUBLIC.ZOOMINFO_FIRMOGRAPHICS`
- Stored procedure: `DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_ZOOMINFO_FIRMOGRAPHICS()`
- Task: `DATA_JEDAIS.FINS__PUBLIC.TASK_MONTHLY_ZOOMINFO_FIRMOGRAPHICS` (MONTHLY, `0 7 1 * * UTC`, warehouse `MAIN_WH_XS`, wrapper `SP_RETRY_WRAPPER` retries=2)
- Egress: DC "Snowflake (Federate / Zero Copy)" connector → DLO `CumulusZoomInfoFirmographics__dll` → DMO `CumulusZoomInfoFirmographics__dlm`

## Audience
```sql
SELECT DISTINCT * FROM DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS WHERE ACCOUNT_TYPE_FLAG = 'BUSINESS'
```

Live cardinality (probed 2026-05-28): **12,021 distinct BUSINESS anchors** — same predicate and same volume class as Plans 2 (MSCI ESG, 11,389 rows) and 3 (D&B Business Credit, 11,389 rows). Each anchor emits exactly one firmographics row per month → **~12,021 rows/month**.

**BUSINESS over-count caveat (spec §3 v1.2 finding #3):** real CRM BUSINESS cardinality is closer to ~5K. The 12,021 includes ~7K Person Accounts misclassified by the `PersonBirthdate__c IS NULL → BUSINESS` heuristic. The SP warns (does not fail) when `accounts_processed > 10000`, identical to Plans 2 and 3. The long-term fix is upstream backfill, not a view-layer change.

## Tests
```bash
cd Snowflake_ZoomInfo_Firmographics
pip install -e ".[dev]"
pip install -e ../Snowflake_Cumulus_Common
pytest tests/ -v
```

## Deploy
```bash
snow sql -f schemas/zoominfo_firmographics.sql
snow sql -f procedures/sp_create_procedure.sql
snow sql -f tasks/task_monthly_zoominfo_firmographics.sql
```

DC ingest is configured via the existing federation connector (see Plan 11 Task 7 + the recipe at `../Snowflake_Claritas_Demographics/docs/dc-setup-recipe.md`).
