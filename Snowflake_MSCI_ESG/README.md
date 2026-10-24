# MSCI — Cumulus Synthetic Dataset (ESG Scores)

Synthetic MSCI-style ESG ratings for Cumulus BUSINESS accounts. Mirrors
[Snowflake_CSAT_NPS](../Snowflake_CSAT_NPS) and the Cumulus umbrella spec at
[../docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md](../docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md).

## Plan
- Plan 2, instantiated from `../docs/superpowers/plans/2026-05-28-cumulus-plan-N-dataset-template.md` (v1.4)
- Per-plan file: `../docs/superpowers/plans/2026-05-28-cumulus-plan-2-msci-esg.md`
- Rowspec: `../docs/superpowers/plans/attachments/cumulus-plan-2-msci-esg-rowspec.md`
- Depends on: [Snowflake_Cumulus_Common](../Snowflake_Cumulus_Common) (Plan 0)

## Snowflake objects
- Table: `DATA_JEDAIS.FINS__PUBLIC.MSCI_ESG_SCORES`
- Stored procedure: `DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_MSCI_ESG_SCORES(P_PROFILE_MONTH VARCHAR DEFAULT NULL)` (`EXECUTE AS OWNER`; NULL = this month)
- Task: `DATA_JEDAIS.FINS__PUBLIC.TASK_MONTHLY_MSCI_ESG_SCORES` (MONTHLY, `30 3 1 * * America/New_York`, warehouse `MAIN_WH_XS`, wrapper `SP_RETRY_WRAPPER` retries=2)
- Egress: DC "Snowflake (Federate / Zero Copy)" connector → DMO `BT_MSCI_ESG_Scores__dlm` (snake_case fields, key `account_id__c`; read by the Commercial cockpit's C4 ESG-movers card). Originally `CumulusMSCIESG__dll` / `CumulusMSCIESG__dlm`.

## Rating dynamics (sticky, since 2026-10-24)
Each month's row evolves from the account's row for the month before:
- ~90% of accounts keep last month's rating; ~10% move one notch; ~1% two. Never more.
  One-notch odds between neighbouring ratings are set by detailed balance against the
  fresh-draw base mix (AAA..CCC = 5/10/18/25/22/13/7), so the book's rating mix stays steady.
- The overall ESG score moves WITH the rating: 1.0-1.5 points per notch, same direction
  (a move with no score headroom holds instead). Unchanged months drift pillars ±0.2 with
  slow reversion to the industry + rating baseline.
- `LAST_RATING_CHANGE_DIRECTION` (`Upgrade` / `Downgrade` / `Unchanged`) is the actual move
  vs the prior month. An account's first row is a fresh draw flagged `Unchanged`.
- Downgrades add 1-2 controversy flags and nudge carbon intensity up; upgrades clear one
  flag and nudge it down. Industry class re-rolls only on a move; materiality tags hold.

## Rebuild history
Because rows chain, rebuild months **oldest first**, after backing up the table:
```sql
CREATE TABLE DATA_JEDAIS.FINS__PUBLIC.MSCI_ESG_SCORES_BAK_<yyyymmdd> CLONE DATA_JEDAIS.FINS__PUBLIC.MSCI_ESG_SCORES;
CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_MSCI_ESG_SCORES('2026-05-01');  -- no prior month → fresh draw
CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_MSCI_ESG_SCORES('2026-06-01');  -- … one call per month …
CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_MSCI_ESG_SCORES();              -- current month last
```
A past month keeps the account population it already has (and skips the coverage
assertion); the current-month run covers the full audience. Last full rebuild:
2026-10-24 (May-Oct 2026; backup `MSCI_ESG_SCORES_BAK_20261024b`).

## Audience
```sql
SELECT DISTINCT * FROM DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS WHERE ACCOUNT_TYPE_FLAG = 'BUSINESS'
```

## Tests
```bash
cd Snowflake_MSCI_ESG
pip install -e ".[dev]"
pip install -e ../Snowflake_Cumulus_Common
pytest tests/ -v
```

Without a working `.venv`, system Python works: `PYTHONPATH=../Snowflake_Cumulus_Common python3 -m pytest -q`.

## Deploy
```bash
python scripts/deploy_sp.py --no-deploy     # regenerate procedures/sp_create_procedure.sql from the .py
snow sql -c SFDC_DC_TECH_ARCH_jwt --role ACCOUNTADMIN -f procedures/sp_create_procedure.sql
snow sql -c SFDC_DC_TECH_ARCH_jwt --role ACCOUNTADMIN -f tasks/task_monthly_msci_esg_scores.sql   # only if the schedule changes
```
`schemas/msci_esg_scores.sql` is `CREATE OR REPLACE TABLE` — never re-run it against the live table.
The SP signature changed on 2026-10-24 (`()` → `(P_PROFILE_MONTH VARCHAR DEFAULT NULL)`); a further
signature change needs a `DROP PROCEDURE` of the old one first.

DC ingest is configured via the existing federation connector (see Plan 2 Task 7 + the recipe at `../Snowflake_Claritas_Demographics/docs/dc-setup-recipe.md`).
