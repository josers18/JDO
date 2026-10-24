# Claritas — Cumulus Synthetic Dataset

Synthetic Claritas-style demographics data for Cumulus PERSON accounts and (since 2026-10-24) FSC
Household and business client accounts, profiled as the household of the relationship's principal. Mirrors
[Snowflake_CSAT_NPS](../Snowflake_CSAT_NPS) and the Cumulus umbrella spec at
[../docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md](../docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md).

## Plan
- Plan 1, instantiated from `../docs/superpowers/plans/2026-05-28-cumulus-plan-N-dataset-template.md`
- Per-plan file: `../docs/superpowers/plans/2026-05-28-cumulus-plan-1-claritas-demographics.md`
- Rowspec: `../docs/superpowers/plans/attachments/cumulus-plan-1-claritas-demographics-rowspec.md`
- Depends on: [Snowflake_Cumulus_Common](../Snowflake_Cumulus_Common) (Plan 0)

## Snowflake objects
- Table: `DATA_JEDAIS.FINS__PUBLIC.CLARITAS_DEMOGRAPHICS`
- Stored procedure: `DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_CLARITAS_DEMOGRAPHICS()`
- Task: `DATA_JEDAIS.FINS__PUBLIC.TASK_MONTHLY_CLARITAS_DEMOGRAPHICS` (MONTHLY, `0 7 1 * * UTC`)
- Egress: DC "Snowflake (Federate / Zero Copy)" connector → DLO `CumulusClaritasDemographics__dll` → DMO `CumulusClaritasDemographics__dlm`

## Audience
```sql
SELECT DISTINCT * FROM DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS
WHERE (ACCOUNT_TYPE_FLAG = 'PERSON' OR (ACCOUNT_TYPE_FLAG = 'BUSINESS'
       AND CLIENT_CATEGORY IS NOT NULL AND ACCOUNT_ID LIKE '001%'))
```
- PERSON: 25,424 accounts. BUSINESS (added 2026-10-24): 10,815 accounts, mostly FSC Households (Jose
  Sifontes's book) and Small Business / Commercial Banking clients (Allen Carter's book). The ~700
  ownerless shells with no client category stay out.
- A BUSINESS anchor has no birthdate or personal income, so `_principal_profile` gives the principal's
  household (head of household / owner) a stable age (34–72) and a lognormal household income (median
  $95K for Households, $140K for business owners), from its own salt `claritas-principal`. Everything
  after that is the person path, so the books get comparable PRIZM, life stage and stress mixes.
- History 2026-05 → 2026-10 was inserted for the BUSINESS audience (64,890 rows, insert-only), so every
  month has 36,239 rows. Backup before the insert: `CLARITAS_DEMOGRAPHICS_BAK_20261024c`.

## Financial stress (`FINANCIAL_STRESS_INDICATOR`)
- Retail clients draw it from income each month: ≥ $75K → 10% High, $35–75K → 20%, < $35K → 50%. The draw
  re-rolls monthly, so a single month is noisy (the cockpit's R3 card looks for High in ≥ 4 of 6 months).
- Wealth Management and ≥ $250K clients are never High from income. Since 2026-10-24 a stable 20%
  (`STRAIN_RATE`) of them carry a per-account **liquidity strain** trait (asset-rich, cash-poor). A
  strained client reads High in 50% of months (`STRAIN_HIGH`), otherwise Moderate. The trait uses its own
  salt (`claritas-strain`), so no other column moves. Without it the Wealth books (Kim Johnson, Vince
  West, Adam Watson) had no High clients at all.
- The first pass used 4% / 75% (backup `CLARITAS_DEMOGRAPHICS_BAK_20261024b`, 944 rows); that left the
  Wealth books at ~3% High against ~16% for Retail. The second pass (20% / 50%) rewrote the stress
  value of strained accounts only, 2026-05 → 2026-10 (3,737 rows; backup `CLARITAS_DEMOGRAPHICS_BAK_20261024c`).
- High now (2026-10), by book: Sarah 1,751 (16.6%), Justin 1,763 (16.2%), Jose 743 (14.6%), Allen 644
  (11.4%), Vince 148 (11.2%), Adam 129 (9.7%), Kim 117 (8.9%).

## Tests
```bash
cd Snowflake_Claritas_Demographics
pip install -e ".[dev]"
pytest tests/ -v
```

## Deploy
```bash
snow sql -f schemas/claritas_demographics.sql
snow sql -f procedures/sp_create_procedure.sql   # inlined copy of procedures/sp_generate_claritas_demographics.py
snow sql -f tasks/task_monthly_claritas_demographics.sql
```

DC ingest is configured in DC Setup → Data Streams (see Plan 1 Task 7).
