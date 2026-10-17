# BoardEx Exec Intel — Cumulus Synthetic Dataset (Board & Executive Intelligence)

Synthetic BoardEx / Equilar / ISS-style board director and executive intelligence dataset per account (all anchors, PERSON + BUSINESS) for Cumulus's customer footprint. Mirrors
[Snowflake_MoneyGuidePro_FinancialPlans](../Snowflake_MoneyGuidePro_FinancialPlans) and the Cumulus umbrella spec at
[../docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md](../docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md).

**Plan 10 is account-scoped with monthly cadence and an all-accounts audience (~36,813 anchors).** The original Plan 10 design narrowed to Commercial Banking only (~960 anchors); the rebroadcast widened it to every distinct anchor, with PERSON anchors emitting a "personal household" governance row (see [Audience](#audience)). Each distinct anchor produces one board-and-executive-intelligence row per month. Rows are keyed by composite PK `(ACCOUNT_ID, PROFILE_MONTH)` (~36,813 rows/month at 1:1 anchor:row). Re-runs same calendar month MERGE-replace in place. The DMO is joinable to `ssot__Account__dlm` via FK `ACCOUNT_ID`; DC PK collapses to single-column `profileMonth__c` with `ssot__AccountId__c` as a KQ qualifier (single-column-PK rule from Plan 4).

## Plan
- Plan 10, instantiated from `../docs/superpowers/plans/2026-05-28-cumulus-plan-N-dataset-template.md` (v1.5)
- Per-plan file: `../docs/superpowers/plans/2026-05-28-cumulus-plan-10-boardex-exec-intel.md`
- Rowspec: `../docs/superpowers/plans/attachments/cumulus-plan-10-boardex-exec-intel-rowspec.md`
- Depends on: [Snowflake_Cumulus_Common](../Snowflake_Cumulus_Common) (Plan 0)

## Snowflake objects
- Table: `DATA_JEDAIS.FINS__PUBLIC.BOARDEX_EXEC_INTEL`
- Stored procedure: `DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_BOARDEX_EXEC_INTEL()`
- Task: `DATA_JEDAIS.FINS__PUBLIC.TASK_MONTHLY_BOARDEX_EXEC_INTEL` (MONTHLY, `0 7 1 * * UTC`, warehouse `MAIN_WH_XS`, wrapper `SP_RETRY_WRAPPER` retries=2)
- Egress: DC "Snowflake (Federate / Zero Copy)" connector → DLO `CumulusBoardExExecIntel__dll` → DMO `CumulusBoardExExecIntel__dlm`

## Audience
**All accounts** — every distinct anchor in `V_ACCOUNT_ANCHORS`, PERSON and BUSINESS alike (no `CLIENT_CATEGORY` filter; `SELECT DISTINCT` dedupes MASTER_ACCOUNTS). The audience predicate:

```sql
SELECT DISTINCT * FROM DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS
```

Cardinality: **~36,813 distinct accounts**. The v1 design was Commercial Banking only (`CLIENT_CATEGORY = 'Commercial Banking'`, 960 accounts probed 2026-05-28); the rebroadcast dropped that predicate so every customer has governance data.

**PERSON-anchor fallback.** PERSON anchors have no real board, so the SP emits a "personal household" governance row instead of rejecting them: `BOARD_SIZE = 1`, `BOARD_INDEPENDENCE_PCT = 100.0`, `WOMEN_BOARD_PCT` / `MINORITY_BOARD_PCT` in `{0.0, 100.0}` (deterministic from `ACCOUNT_ID` hash), `BOARD_AVG_TENURE_YEARS = CEO_TENURE_YEARS = 5.0`, `EXEC_TURNOVER_FLAG = False`, `GOVERNANCE_RATING = 'Adequate'`, `INTERLOCK_COUNT = 0`, `KEY_DIRECTOR_NAME = 'Self'`, `RECENT_GOVERNANCE_EVENT_DATE = NULL`. BUSINESS anchors keep the `EMPLOYEE_COUNT` / `INTERLOCK_DEGREE` bias bands.

Each anchor emits exactly one row per month → **~36,813 rows/month**.

## Tests
```bash
cd Snowflake_BoardEx_ExecIntel
pip install -e ".[dev]"
pip install -e ../Snowflake_Cumulus_Common
pytest tests/ -v
```

The L1 conftest uses the full `SAMPLE_ANCHORS` slice as the audience, plus an inline 5-anchor `COMMERCIAL_BANKING_FIXTURE` (mid-market enterprise / regulated bank / family business / recent IPO / large cap) for the enterprise bias-band tests — see AGENTS.md "L1 conftest (all-accounts)". "BoardEx" and "Exec Intel" are both clean tokens, so no `&`-sanitize gymnastics are needed (compare Plan 6's `D&B` workaround).

## Deploy
```bash
snow sql -f schemas/boardex_exec_intel.sql
snow sql -f procedures/sp_create_procedure.sql
snow sql -f tasks/task_monthly_boardex_exec_intel.sql
```

DC ingest is configured via the existing federation connector (see Plan 10 Task 7 + the recipe at `../Snowflake_Claritas_Demographics/docs/dc-setup-recipe.md`).
