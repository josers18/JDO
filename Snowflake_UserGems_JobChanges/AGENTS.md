# AGENTS.md — Snowflake_UserGems_JobChanges

Synthetic UserGems-style **person-level job-change events** (departures, inbound hires, promotions) for contacts at non-household Cumulus business accounts. This is Plan 15 and the **first event-scoped dataset** in the rollout. The PK is `EVENT_ID`, and most accounts have zero rows in a given week. Weekly cadence.

- Plan: `../docs/superpowers/plans/2026-11-02-cumulus-plan-15-usergems-job-changes.md`
- Rowspec: `../docs/superpowers/plans/attachments/cumulus-plan-15-usergems-job-changes-rowspec.md`

## Status (2026-11-02)

| Task | What | Status |
|---|---|---|
| T1 | Scaffold (this file, README, layout) | Done |
| T2 | DDL `schemas/usergems_job_changes.sql` (+ `_STAGING`) | **Live 2026-11-02**, applied as `ACCOUNTADMIN` (owner of `DATA_JEDAIS.FINS__PUBLIC`; `SYSADMIN` lacks CREATE TABLE, error 003001). |
| T3 | Row factory `procedures/sp_generate_usergems_job_changes.py` + L1 tests | Done. |
| T4 | SP body (`main`, run window, MERGE, `_assert_event_contract`) + `scripts/deploy_sp.py` + `tasks/task_weekly_usergems_job_changes.sql` | Done in repo (2026-11-02). 86 L1 tests pass after the review fix (BoardEx freshness guard + conflicting-duplicate raise). `deploy_sp.py --role ACCOUNTADMIN` forwards the role (Plan 14 pattern). The production SP and TASK are **not deployed** (that is T6). |
| T5 | L2 integration (`tests/integration/`) | Done. Ran live 2026-11-02 in the scratch schema `DEMO_DB.CUMULUS_L2_USERGEMS`: 29/29 checks TRUE, schema dropped. Re-run with the review-fix SP body later the same day: 29/29 TRUE again. |
| T6 | Live deploy of the SP + TASK, then the 104-week backfill | **Live 2026-11-02** (operator, `ACCOUNTADMIN`; the agent passes were refused that role by the session permission policy). Preconditions: BoardEx sticky re-run landed 2026-11-02 (employer audience 2,494 rises / 31,878 stays / 2,452 falls). `CALL ...(104)` → `SUCCEEDED rows=9017 updated=0 accounts=6435 weeks=105 (2024-11-04..2026-11-02)` in ~39 s. `TASK_WEEKLY_USERGEMS_JOB_CHANGES` created and RESUMEd (`0 9 * * 1 UTC`, `MAIN_WH_XS`). |
| T7 | DC stream + DMO | DC mapping pending UI (no live DC work in this pass). Mapping table below. |
| T8 | L3 smoke | **Done 2026-11-02, all checks pass.** 9,017 rows / 9,017 distinct EVENT_IDs over 105 weeks (2024-11-04 → 2026-11-02); complete weeks 61–109 (avg 86.5, 0 outside [30, 200]); 2,123 C-suite departures, gate (i) 0 violations, gate (ii) 1,941 complete rises with 0 ≠ 1; 984 paired rows, 0 self-pairs, 8 orphans all at the window edges (detected 2024-11-04..09 / 2026-11-02..03); mix Departed 48.1 / Joined 30.2 / Promoted 21.7; resolution Existing 11.4 / Prospect 49.8 / Unknown 38.8; champion 12.0% overall / 34.3% finance; liquidity 6.0% of C-suite+VP departures, 0 bad PERSON_ACCOUNT_IDs, 0 flag mismatches; 0 ACCOUNT_IDs outside the audience; size scaling 1.717 vs 0.525 events/acct/yr (3.27×). The offline replay predicted 9,006 rows / 2,119 C-suite departures; live differs by run-date drift only. |

## Boundaries
- Owns: `DATA_JEDAIS.FINS__PUBLIC.USERGEMS_JOB_CHANGES`, `USERGEMS_JOB_CHANGES_STAGING`, `SP_GENERATE_USERGEMS_JOB_CHANGES`, `TASK_WEEKLY_USERGEMS_JOB_CHANGES`, and the DC stream / DLO / DMO `CumulusUserGemsJobChanges__dlm`.
- Reads (does not own): `V_ACCOUNT_ANCHORS` (employers + the Wealth pool) and `BOARDEX_EXEC_INTEL` (Plan 10, a hard dependency).
- Does NOT own `Snowflake_Cumulus_Common`. Do not modify it from here. Helpers this SP needs that Common doesn't export are defined locally in the SP module.
- The tables live in `DATA_JEDAIS.FINS__PUBLIC`, like every sibling. The plan's `FINS.PUBLIC` name is from before the account migration and is stale.

## Conventions
- Two salts:
  - `usergems` feeds `seed_for(ACCOUNT_ID, "usergems", event_month)` and drives which slots fire.
  - `usergems_person` feeds `seed_for(EVENT_ID, "usergems_person", event_month)` and drives every per-event attribute.

  `seed_for` buckets on `%Y-%m`, so the event month is the whole seed period.
- `_events_for(anchor, event_month, boardex_rise, ctx)` is a pure function of its inputs. It returns every event with `EVENT_DATE` in the month, including paired mirrors on other accounts. The SP filters by detection week afterwards (`_rows_for_week`).
- Draw order on the account-month rng is load-bearing:
  1. The hazard loop draws exactly one `random()` per slot, or two when the slot fires.
  2. Only after the loop, on a BoardEx rise, one `rng.choice` picks the C-suite persona.

  There is no probability draw for the C-suite pick, so a rise never shifts the hazard events. `test_gate_does_not_shift_hazard_events` guards this: a mutation check that adds one extra draw on a rise makes it fail.
- `PROFILE_WEEK` is the Monday of `DETECTED_DATE`'s week. `GENERATED_AT` is midnight on that Monday, so re-runs are byte-identical.
- No `&` anywhere in SQL, vocabularies or company-name banks (snow sql template trap).

## Gotchas
- **Event-scoped.** One row per event, not per account-period. About 91% of (anchor, month) pairs emit nothing (L1 measured 9.2% emitting on the 10-anchor fixture), and **that is correct**. Do not "fix" it. The template's `assert_coverage` is replaced by `_assert_event_contract` (plan §2).
- **Generate per event month, filter by detection week.** For run week W the candidate event months are `month(W_end)` and the 3 prior months, because detection lag is 3..45 days plus up to 7 more for mirrors (max 52). Rows are kept when `DETECTED_DATE ∈ [W, min(W+6, run date)]`. L1 checks completeness: every event in the span is returned by exactly one week.
- **EVENT_ID** = `_record_id_for(source ACCOUNT_ID, event_month ISO, slot, kind)` with `kind ∈ {hazard, csuite, pair}`. A mirror uses the *source* event's coordinates with `kind=pair`. It is identical whichever week computes it.
- **`record_id_for` is not exported** from `cumulus_common/__init__.py`. The module carries a byte-identical local `_record_id_for`, and an L1 parity test compares it with `cumulus_common.record_id.record_id_for`.
- **BoardEx gate (bidirectional, 2026-11-02).**
  - The rule: `rise(M) = flag(M) TRUE and flag(M-1) FALSE`. A rise in month M emits **exactly one** C-suite `Departed` in M. A non-rise month emits **zero**.
  - A missing M or M-1 BoardEx row is NOT a rise. That covers pre-history (2024-06 has no M-1) and a month that hasn't been generated yet.
  - The SP reads BoardEx for 5 months per week: the 4 candidate months plus the month before the earliest (`_boardex_months_for_week`).
  - If the table itself is missing, the SP raises.
  - Timing: detection lag is ≥ 3 days, so month M's events are first detected on day 4 of M, after BoardEx's 1st-of-month run.
- **The BoardEx backfill precondition (met 2026-11-02).** The Plan 10 30-month sticky re-run, `CALL SP_GENERATE_BOARDEX_EXEC_INTEL(30, TRUE)`, ran on 2026-11-02 at about 15:36 PST (table LAST_ALTERED 15:39 PST).
  - Re-probed the same evening on the employer audience: 189,214 rows, 6,435 accounts, 2024-06 → 2026-11, TRUE rate 18.76%, **2,494 rises / 31,878 stays / 2,452 falls**. That is an exact match for the offline sticky projection.
  - Before the re-run, the live flag was iid: 26,450 rises / 6,511 stays / 26,433 falls. A backfill against that would have produced about 31K rows and failed contract (a).
  - Evidence to use next time: compare the rise/stay/fall counts. `GENERATED_AT` = month start and ~2,150 TRUE a month are true of both the iid and the sticky table, so neither tells them apart.
  - Live BoardEx has one exact duplicate row (`001am00000qvjs6AAA`, 2026-10, flag FALSE, same RECORD_ID). It is not a rise and doesn't change the gate. It's a Plan 10 data issue: the dedupe and the MERGE uniqueness check are tracked as a follow-up in `Snowflake_BoardEx_ExecIntel/AGENTS.md`. On this side, `_boardex_dict_from_rows` collapses an exact duplicate and **raises on a duplicate key with conflicting flags**, and the contract (d) SQL reads BoardEx through `SELECT DISTINCT`. That keeps the Python gate and the SQL check from ever disagreeing.
- **BoardEx freshness (weekly-run guard, added in the 2026-11-02 review).** A weekly run covers only last week and this week, and those weeks are never revisited. If month M's BoardEx rows were simply missing, rise(M) would read as false and C-suite departures detected in those weeks would be dropped silently. Contract d3 cannot catch this on a weekly run, because no rise month is complete inside a 2-week window.
  - **The guard.** `_load_boardex` calls `_boardex_coverage_violations` and raises when a needed month is missing or thin.
    - A month M is needed once `M + 3 days <= run date`, so its events can already be detected. This covers every month from the table's `MIN(PROFILE_MONTH)` onward.
    - Thin means fewer than `_BOARDEX_MIN_MONTH_COVERAGE` (0.5) × the best month's employer rows. Live counts were 6,299..6,435 per month on 2026-11-02.
  - **When it fires.** `TASK_MONTHLY_BOARDEX_EXEC_INTEL` (`0 3 1 * * America/New_York`) failed or ran late. Once BoardEx catches up, re-run `CALL ...(N)` with N large enough to cover the missed weeks. The MERGE is idempotent, so this repairs the gap.
  - **What it does not cover.**
    - On the 1st to 3rd of a month, a missing current month passes, because no event of that month can be detected yet.
    - A BoardEx month that lands and is later rewritten is out of scope. See the rewrite note under "Contract (d)".
- **Weekly window (implemented in T4: `_run_weeks`).** The TASK fires Monday 09:00 UTC. If the default run processed only the current week, it would see only Monday's detections, and events detected Tuesday through Sunday would never be written. The default run (`BACKFILL_WEEKS=0`) must therefore process **the previous complete week plus the current partial week**. The MERGE on `(ORG_ID, EVENT_ID)` is idempotent, so the overlap is free. Contract (a) [30, 200] applies to complete weeks only. A partial Monday week holds about 9 rows.
- **Contract (d) needs a completeness window.** Check (d) has two parts:
  - Every C-suite `Departed` falls in a rise month.
  - Every rise month that is **complete** (`run_date - month_end > 52` days) and **inside the window** (`month_start + 3 ≥ window_start`) has exactly one.

  Incomplete or edge months are skipped because their departure may not be detected yet, or was detected before the window. `_csuite_gate_violations` is the Python mirror of this check.
  - The SQL is split into d1 (C-suite departure outside a rise), d2 (more than one in an account-month) and d3 (a complete in-window rise with none). All three report as `contract (d)`.
  - **Scope is the run window** (`DETECTED_DATE` in `[first run week, run date]`), not the whole table. A default weekly run therefore effectively checks d1/d2 only, since no rise month is complete inside a 2-week window. The full d3 check happens on the backfill.
  - **If BoardEx history is ever rewritten after the backfill** (as the 2026-11-02 sticky re-run did; it landed before any UserGems row was written, so nothing needs cleaning today), C-suite rows already stored for months that are no longer rises stay in the table (events never delete) and d1 fails. Delete the `C-Suite` `Departed` rows, or the whole table, and re-run `CALL ...(104)`.
- **Paired events write to another account.** The destination comes from the same-INDUSTRY pool when that pool has ≥ 2 members, otherwise from the full employer pool. It is never the source account (index + 1 skip). If the pool is a single member, Existing Client degrades to Prospect. The mirror's detection is up to 7 days later and can land in a later week, so window edges can leave a `PAIRED_EVENT_ID` whose partner is outside the backfill (5 in the simulation). L3 must exempt rows within 7 days of the window edges.
- **Wealth pool.** The SP loads the Wealth Management PERSON `ACCOUNT_ID`s (3,920) sorted ascending, and picks one by `sha256(event_id + "_wealth") % len(pool)`. That is only for C-Suite / VP `Departed`, at 6%. An empty pool returns None.
- **Employer audience predicate** is `ACCOUNT_TYPE_FLAG = 'BUSINESS' AND COALESCE(CLIENT_CATEGORY, '') <> 'Household'` (6,435 anchors). Without `COALESCE`, NULL categories would drop. 661 of the employers have NULL `EMPLOYEE_COUNT`, so they get the 2-slot roster and BoardEx never flags them.
- **write_pandas types.** `write_pandas` mistypes datetimes and all-NULL date columns as NUMBER. In the MERGE source, use `TO_TIMESTAMP_NTZ(GENERATED_AT::NUMBER/1e9)` and `TO_DATE(TO_TIMESTAMP_NTZ(col::NUMBER/1e9))` for the 3 DATE columns. Cast the 3 BOOLEANs with `::BOOLEAN`. `RECORD_ID` has no default, so set it on INSERT **and** UPDATE. Snowflake MERGE has no `NOT MATCHED BY SOURCE`, and events never delete anyway.
- **Deploy connection.** `scripts/deploy_sp.py` must run an unflagged `/opt/homebrew/bin/snow sql -f` (never `-c`). Production deploys add `--role ACCOUNTADMIN`. The SP is `EXECUTE AS CALLER` (same as the BoardEx sibling), so it runs with the caller's rights. The TASK (which is the caller on the weekly schedule) and every sibling procedure, task and table are `ACCOUNTADMIN`-owned, so the SP and TASK are deployed and owned as `ACCOUNTADMIN` too. `SYSADMIN` only has CREATE PROCEDURE / CREATE TASK in the schema, with no CREATE TABLE. On 2026-11-02 the CLI default connection `GSB13421_jwt` returned 404. `SNOWFLAKE_DEFAULT_CONNECTION_NAME=SFDC_DC_TECH_ARCH_jwt` works: it is still JWT, still unflagged, and opens no OAuth popup.
- **Contract (a) is also the BoardEx guard.** If BoardEx ever reverts to a non-sticky flag, a run raises `contract (a)` (about 298 rows a week against [30, 200] under the old iid flag). Don't widen the band to make it pass; fix BoardEx.
- **L2 runs in a scratch schema.** SYSADMIN cannot create fixture tables in `FINS__PUBLIC`, so `scripts/deploy_sp.py --fixture-schema DEMO_DB.CUMULUS_L2_USERGEMS` builds the real SP body retargeted at the scratch schema (the module's `_DB` / `_SCHEMA` lines are swapped and no `DATA_JEDAIS` reference survives). It builds two procs: the loose one with week band (0, 25), and `_STRICT` with the production band. Both read the run clock from `L2_RUN_CLOCK` through the `_RUN_TS_SQL` hook, which is `None` in production. The fixture proc file is gitignored.
- One SP per dataset, with no inter-SP imports. DROP the procedure before redeploying if the signature changes. The TASK runs on `MAIN_WH_XS` via `SP_RETRY_WRAPPER('DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_USERGEMS_JOB_CHANGES()', 2)`.
- DC mapping descriptions must be ≤ 521 characters.
- Snowflake DATE columns auto-discover as `MM/dd/yyyy` in the DC data-stream body.

## Tests
```bash
cd Snowflake_UserGems_JobChanges
python3 -m pytest -q -p no:cacheprovider          # L1: 86 tests

# L2 (live, scratch schema; the last statement drops it)
python3 tests/integration/build_l2.py             # regenerate the .sql after any row-factory change
SNOWFLAKE_DEFAULT_CONNECTION_NAME=SFDC_DC_TECH_ARCH_jwt python3 scripts/deploy_sp.py --fixture-schema DEMO_DB.CUMULUS_L2_USERGEMS
SNOWFLAKE_DEFAULT_CONNECTION_NAME=SFDC_DC_TECH_ARCH_jwt /opt/homebrew/bin/snow sql -f tests/integration/test_usergems_job_changes_sp.sql
```
L2 passes when the final `L2_ALL_PASS` is TRUE. `tests/integration/build_l2.py` computes the expected rows with the same Python row factory and embeds them, so parity covers all 24 columns: the write_pandas staging types, the MERGE casts and the SQL `RECORD_ID` form. The file also covers the BoardEx gate both ways, pair cross-links, the audience, an idempotent re-run, `contract (a)` and both `contract (d)` raises, and the weekly overlap. For the overlap, two default runs a week apart re-derive identical rows for the shared Monday, and their union equals the backfill for those weeks with no gap. An L1 test fails if the committed `.sql` is stale.

The L1 fixture has 10 employers (2 per employee band, with repeated industries and one NULL industry), a boring all-NULL anchor, a 5-id Wealth pool and a synthetic BoardEx dict (`tests/conftest.py`). The property classes follow plan §4 Task 3: schema, determinism, sparsity, gate, 4a-4e, bias, lag-window completeness and the boring case.

## DC mapping (T7) — status: DC mapping pending UI

| Snowflake | DC field | Type |
|---|---|---|
| RECORD_ID | recordId__c | Text (PK) |
| ORG_ID | orgId__c | Text |
| EVENT_ID | eventId__c | Text |
| ACCOUNT_ID | ssot__AccountId__c | Text (KQ → `ssot__Account__dlm`) |
| PROFILE_WEEK | profileWeek__c | Date (MM/dd/yyyy) |
| EVENT_TYPE | eventType__c | Text |
| EVENT_DATE | eventDate__c | Date (MM/dd/yyyy) |
| DETECTED_DATE | detectedDate__c | Date (MM/dd/yyyy) |
| CONTACT_NAME | contactName__c | Text |
| CONTACT_PERSONA | contactPersona__c | Text |
| SENIORITY | seniority__c | Text |
| OLD_TITLE | oldTitle__c | Text (NULLable) |
| NEW_TITLE | newTitle__c | Text (NULLable) |
| NEW_EMPLOYER_NAME | newEmployerName__c | Text (NULLable) |
| NEW_ACCOUNT_ID | newAccountId__c | Text (NULLable; second relationship to `ssot__Account__dlm`) |
| NEW_EMPLOYER_STATUS | newEmployerStatus__c | Text |
| PAIRED_EVENT_ID | pairedEventId__c | Text (NULLable) |
| WAS_CHAMPION | wasChampion__c | Boolean |
| WAS_PRIMARY_CONTACT | wasPrimaryContact__c | Boolean |
| OPPORTUNITY_SCORE | opportunityScore__c | Number |
| RELATIONSHIP_RISK_SCORE | relationshipRiskScore__c | Number |
| PERSON_ACCOUNT_ID | personAccountId__c | Text (NULLable; third relationship to `ssot__Account__dlm`) |
| LIQUIDITY_EVENT_FLAG | liquidityEventFlag__c | Boolean |
| GENERATED_AT | generatedAt__c | DateTime |

This is the first Cumulus DMO with three Account relationships. Create the primary relationship (`ssot__AccountId__c`) via the API. If the API rejects the second and third, add them in the DC Setup UI, and record here which path worked.
