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
- Table: `DATA_JEDAIS.FINS__PUBLIC.USERGEMS_JOB_CHANGES`, plus `USERGEMS_JOB_CHANGES_STAGING`. DDL is in `schemas/usergems_job_changes.sql`. Live 2026-11-02 (applied as `ACCOUNTADMIN`); 9,017 rows after the 104-week backfill.
- Stored procedure: `DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_USERGEMS_JOB_CHANGES(BACKFILL_WEEKS INTEGER DEFAULT 0)`. Built in repo by `scripts/deploy_sp.py` (`procedures/sp_create_procedure.sql`), deployed 2026-11-02 as `ACCOUNTADMIN`. `BACKFILL_WEEKS=0` processes last week plus the current partial week; `104` is the 24-month backfill. The row factory is in `procedures/sp_generate_usergems_job_changes.py`.
- Task: `TASK_WEEKLY_USERGEMS_JOB_CHANGES` (`0 9 * * 1 UTC`, `MAIN_WH_XS`, `SP_RETRY_WRAPPER` retries=2). SQL is in `tasks/task_weekly_usergems_job_changes.sql`; live and RESUMEd 2026-11-02.
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

## Expected volume (offline replay against live inputs, 2026-11-02)
These figures predate the deploy; the live table (9,017 rows, 2,123 C-suite departures) replicates them within run-date drift. They come from replaying the row factory (`_rows_for_window`, the SP's own path) over live inputs pulled read-only on 2026-11-02: the 6,435-employer audience, the 3,920-id Wealth pool, and the live sticky BoardEx rows for 2024-07 → 2026-11 (after the Plan 10 30-month re-run). The window is the 104 weeks from 2024-11-04 plus the current partial week, with run date 2026-11-02.

| Metric | Simulated |
|---|---|
| Backfill rows (104 weeks + partial week) | 9,006 |
| Rows per complete week | min 61 / median 86 / max 109 (partial week: 9) |
| Per month | about 266 hazard + 88 C-suite + 20 mirrors ≈ 375 |
| C-suite departures | 2,119 (1,941 complete in-window rises; 0 gate violations) |
| Mix | Departed 48.0%, Joined 30.2%, Promoted 21.8% |
| Departed resolution | Existing Client 11.3%, Prospect 49.9%, Unknown 38.8% |
| Champion | 12.0% overall, 34.3% on finance personas |
| Liquidity | 6.0% of C-Suite and VP departures |
| Size scaling | 3.28× (events per account, 201+ employees vs the 1-10 band including NULL-count anchors; 3.13× excluding them) |

Before the BoardEx re-run, the same replay against the old iid flag gave 31,081 rows, about 298 per week, which would have failed contract (a). The re-run landed on 2026-11-02 and live BoardEx is now sticky (2,494 rises / 31,878 stays / 2,452 falls on the employer audience).

## Tests
```bash
cd Snowflake_UserGems_JobChanges
python3 -m pytest -q -p no:cacheprovider   # 86 L1 tests
```
L2 runs live in a scratch schema that it drops at the end (29 checks, all TRUE on 2026-11-02):
```bash
SNOWFLAKE_DEFAULT_CONNECTION_NAME=SFDC_DC_TECH_ARCH_jwt python3 scripts/deploy_sp.py --fixture-schema DEMO_DB.CUMULUS_L2_USERGEMS
SNOWFLAKE_DEFAULT_CONNECTION_NAME=SFDC_DC_TECH_ARCH_jwt /opt/homebrew/bin/snow sql -f tests/integration/test_usergems_job_changes_sp.sql
```
`tests/integration/test_usergems_job_changes_sp.sql` is generated by `tests/integration/build_l2.py`. Regenerate it after any row-factory change.
`pyproject.toml` puts `procedures/` and `../Snowflake_Cumulus_Common` on the path, so no pip install is needed for L1.

## Deploy (Task 6; precondition: ACCOUNTADMIN)
Run as `ACCOUNTADMIN`, which owns `DATA_JEDAIS.FINS__PUBLIC` and every sibling object. `SYSADMIN` has no CREATE TABLE there.
```bash
export SNOWFLAKE_DEFAULT_CONNECTION_NAME=SFDC_DC_TECH_ARCH_jwt   # JWT, unflagged; never -c
/opt/homebrew/bin/snow sql -f schemas/usergems_job_changes.sql --role ACCOUNTADMIN
python3 scripts/deploy_sp.py --role ACCOUNTADMIN
# BoardEx precondition met 2026-11-02 (sticky re-run landed; re-probe matched). Re-check the
# plan section 2 rise/stay/fall probe if BoardEx has been re-run since:
/opt/homebrew/bin/snow sql --role ACCOUNTADMIN -q "CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_USERGEMS_JOB_CHANGES(104)"
/opt/homebrew/bin/snow sql -f tasks/task_weekly_usergems_job_changes.sql --role ACCOUNTADMIN   # creates + RESUMEs
```
Run the backfill before creating the TASK. Then run the L3 smoke checks in AGENTS.md.
