# UserGems Job Changes — Cumulus Synthetic Dataset (Person-level Job-change Events)

This is a synthetic, UserGems-style feed of **job-change events** for finance-function and owner/operator contacts at Cumulus's non-household business accounts. Each event is a departure, an inbound hire or a promotion, and carries:
- champion and primary-contact flags
- the new employer's resolution: Existing Client, Prospect or Unknown
- an opportunity score and a relationship-risk score
- a Wealth tie-in that flags departing executives who are themselves Cumulus Wealth Management clients (a liquidity event)

The repo follows the Cumulus template v1.5 and the umbrella spec at
[../docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md](../docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md).

**Plan 15 is the first event-scoped dataset.** The PK is `(ORG_ID, EVENT_ID)`, a deterministic UUID per event. `PROFILE_WEEK` is the week the event was detected and is not part of the PK. Most accounts have no rows in a given week. The DMO joins to `ssot__Account__dlm` three ways:
- `ACCOUNT_ID`: the employer
- `NEW_ACCOUNT_ID`: the destination employer
- `PERSON_ACCOUNT_ID`: the Wealth client

Status and gotchas are in [AGENTS.md](AGENTS.md).

## Plan
- Plan 15: `../docs/superpowers/plans/2026-11-02-cumulus-plan-15-usergems-job-changes.md`
- Rowspec: `../docs/superpowers/plans/attachments/cumulus-plan-15-usergems-job-changes-rowspec.md`
- Depends on [Snowflake_Cumulus_Common](../Snowflake_Cumulus_Common) (Plan 0) and, as a **hard dependency**, [Snowflake_BoardEx_ExecIntel](../Snowflake_BoardEx_ExecIntel) (Plan 10).

## Snowflake objects
- Table: `DATA_JEDAIS.FINS__PUBLIC.USERGEMS_JOB_CHANGES`, plus `USERGEMS_JOB_CHANGES_STAGING`. DDL is in `schemas/usergems_job_changes.sql`. **Live apply pending:** it needs a role with CREATE TABLE on the schema.
- Stored procedure: `DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_USERGEMS_JOB_CHANGES(BACKFILL_WEEKS INTEGER DEFAULT 0)`. Task 4, pending. The row factory is in `procedures/sp_generate_usergems_job_changes.py`.
- Task: `TASK_WEEKLY_USERGEMS_JOB_CHANGES` (`0 9 * * 1 UTC`, `MAIN_WH_XS`, `SP_RETRY_WRAPPER` retries=2). Task 6, pending.
- Egress: DC "Snowflake (Federate / Zero Copy)" connector → DMO `CumulusUserGemsJobChanges__dlm`. DC mapping pending UI.

## Audience
```sql
-- Employers (ACCOUNT_ID, NEW_ACCOUNT_ID): 6,435 anchors, probed 2026-11-02
SELECT DISTINCT * FROM DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS
WHERE ACCOUNT_TYPE_FLAG = 'BUSINESS' AND COALESCE(CLIENT_CATEGORY, '') <> 'Household';
-- Wealth pool (PERSON_ACCOUNT_ID): 3,920 PERSON anchors
SELECT DISTINCT ACCOUNT_ID FROM DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS
WHERE CLIENT_CATEGORY = 'Wealth Management' ORDER BY ACCOUNT_ID;
```

## Event model
- Tracked contacts per account scale with `EMPLOYEE_COUNT`: 2, 3, 5, 8 or 12, by band. Each non-C-suite slot moves with a 1.4% monthly hazard. The kind split is 60% Departed, 25% Promoted, 15% Joined.
- **BoardEx gate:** a FALSE→TRUE rise of `EXEC_TURNOVER_FLAG` in month M emits **exactly one** C-suite `Departed` in M. A month without a rise gets none, and a missing M or M-1 row is not a rise.
- Detection lag is 3..45 days. Each week's run keeps the events whose `DETECTED_DATE` falls in that week.
- A Departed contact that resolves to an Existing Client gets a mirrored `Joined` row on the destination account, cross-linked through `PAIRED_EVENT_ID` and detected 0..7 days later.

## Expected volume (offline simulation, 2026-11-02)
This is **not live data.** The row factory was replayed over the real 6,435-employer audience for the 104-week window starting 2024-11-04, using a sticky BoardEx flag projected from the deployed Plan 10 logic. The live BoardEx table is still the iid flag; see AGENTS.md.

| Metric | Simulated |
|---|---|
| Backfill rows (104 weeks) | 9,000 |
| Rows per complete week | min 61 / median 86 / max 109 |
| Per month | about 266 hazard + 88 C-suite + 20 mirrors ≈ 375 |
| C-suite departures | 2,119 (0 gate violations) |
| Mix | Departed 48.0%, Joined 30.2%, Promoted 21.7% |
| Departed resolution | Existing Client 11.3%, Prospect 49.9%, Unknown 38.8% |
| Champion | 12.0% overall, 34.3% on finance personas |
| Liquidity | 6.0% of C-Suite and VP departures |
| Size scaling | 3.28× (events per account per year, 201+ vs 1-10) |

The same simulation run against the current iid live BoardEx gave 31,081 rows, about 298 per week. That is why the backfill waits for the BoardEx re-run.

## Tests
```bash
cd Snowflake_UserGems_JobChanges
python3 -m pytest -q -p no:cacheprovider   # 44 L1 tests
```
`pyproject.toml` puts `procedures/` and `../Snowflake_Cumulus_Common` on the path, so no pip install is needed for L1.

## Deploy (after Tasks 4-6)
```bash
SNOWFLAKE_DEFAULT_CONNECTION_NAME=SFDC_DC_TECH_ARCH_jwt /opt/homebrew/bin/snow sql -f schemas/usergems_job_changes.sql
SNOWFLAKE_DEFAULT_CONNECTION_NAME=SFDC_DC_TECH_ARCH_jwt python3 scripts/deploy_sp.py
SNOWFLAKE_DEFAULT_CONNECTION_NAME=SFDC_DC_TECH_ARCH_jwt /opt/homebrew/bin/snow sql -f tasks/task_weekly_usergems_job_changes.sql
```
