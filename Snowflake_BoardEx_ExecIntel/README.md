# BoardEx Exec Intel — Cumulus Synthetic Dataset (Board & Executive Intelligence)

Synthetic BoardEx / Equilar / ISS-style board director and executive intelligence dataset per Commercial Banking account for Cumulus's customer footprint. Mirrors
[Snowflake_MoneyGuidePro_FinancialPlans](../Snowflake_MoneyGuidePro_FinancialPlans) and the Cumulus umbrella spec at
[../docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md](../docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md).

**Plan 10 is account-scoped with monthly cadence — the smallest Cumulus audience of all 13 plans (Commercial Banking only, ~960 anchors), dethroning Plan 8 (MGP Financial Plans, 3,920) by 4.1×. It is also the first Cumulus dataset where the standard `SAMPLE_ANCHORS` L1 fixture has *zero* relevant cohort members, forcing an inline synthetic-fixture override in the L1 conftest.** Each distinct Commercial Banking anchor produces one board-and-executive-intelligence row per month. Rows are keyed by composite PK `(ACCOUNT_ID, PROFILE_MONTH)` (~960 rows/month at 1:1 anchor:row). Re-runs same calendar month MERGE-replace in place. The DMO is joinable to `ssot__Account__dlm` via FK `ACCOUNT_ID`; DC PK collapses to single-column `profileMonth__c` with `ssot__AccountId__c` as a KQ qualifier (single-column-PK rule from Plan 4).

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
**Commercial Banking only** — every distinct anchor in `V_ACCOUNT_ANCHORS` whose `CLIENT_CATEGORY = 'Commercial Banking'`. BoardEx-style governance intelligence is a Commercial / Corporate Banking product: Retail customers don't have boards, Wealth clients are individuals, and Small Business is too small to maintain formal governance structures. Commercial Banking is the only audience where every anchor is plausibly an enterprise with a board. The audience predicate:

```sql
SELECT DISTINCT * FROM DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS
WHERE CLIENT_CATEGORY = 'Commercial Banking'
```

Live cardinality (probed 2026-05-28): **960 distinct accounts** with no MASTER_ACCOUNTS duplicates. **Smallest Cumulus dataset of all 13 plans by 4.1×, dethroning Plan 8 (MGP Financial Plans, 3,920)** from that title and 11.9× smaller than the next-after-that (MSCI ESG / D&B Business Credit at 11,389). Both `EMPLOYEE_COUNT` and `ANNUAL_REVENUE` expected ~100% populated for this BUSINESS-skewed cohort.

Each anchor emits exactly one row per month → **~960 rows/month**.

## Tests
```bash
cd Snowflake_BoardEx_ExecIntel
pip install -e ".[dev]"
pip install -e ../Snowflake_Cumulus_Common
pytest tests/ -v
```

The L1 conftest builds an inline 5-anchor `COMMERCIAL_BANKING_FIXTURE` (mid-market enterprise / regulated bank / family business / recent IPO / large cap) rather than filtering `SAMPLE_ANCHORS` — see AGENTS.md "L1 conftest synthetic-fixture-override pattern" for the full rationale. "BoardEx" and "Exec Intel" are both clean tokens, so no `&`-sanitize gymnastics are needed (compare Plan 6's `D&B` workaround).

## Deploy
```bash
snow sql -f schemas/boardex_exec_intel.sql
snow sql -f procedures/sp_create_procedure.sql
snow sql -f tasks/task_monthly_boardex_exec_intel.sql
```

DC ingest is configured via the existing federation connector (see Plan 10 Task 7 + the recipe at `../Snowflake_Claritas_Demographics/docs/dc-setup-recipe.md`).
