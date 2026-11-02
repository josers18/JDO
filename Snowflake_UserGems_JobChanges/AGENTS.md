# AGENTS.md — Snowflake_UserGems_JobChanges

Synthetic UserGems-style **person-level job-change events** (departures, inbound hires, promotions) for contacts at non-household Cumulus business accounts. This is Plan 15 and the **first event-scoped dataset** in the rollout. The PK is `EVENT_ID`, and most accounts have zero rows in a given week. Weekly cadence.

- Plan: `../docs/superpowers/plans/2026-11-02-cumulus-plan-15-usergems-job-changes.md`
- Rowspec: `../docs/superpowers/plans/attachments/cumulus-plan-15-usergems-job-changes-rowspec.md`

## Status (2026-11-02)

| Task | What | Status |
|---|---|---|
| T1 | Scaffold (this file, README, layout) | Done |
| T2 | DDL `schemas/usergems_job_changes.sql` (+ `_STAGING`) | Done in repo. **Live apply pending:** `SYSADMIN` lacks CREATE TABLE on `DATA_JEDAIS.FINS__PUBLIC` (error 003001, 2026-11-02). The sibling tables are owned by `ACCOUNTADMIN`, so an operator has to apply it. |
| T3 | Row factory `procedures/sp_generate_usergems_job_changes.py` + L1 tests | Done. 44 L1 tests pass. |
| T4 | SP body (`main`, MERGE, `_assert_event_contract`) | Pending. See the "Weekly window" gotcha first. |
| T5 | L2 integration (`tests/integration/`) | Pending |
| T6 | Deploy (`scripts/deploy_sp.py`, `tasks/task_weekly_usergems_job_changes.sql`) + 104-week backfill | Pending. **Blocked:** the backfill must wait for the BoardEx 30-month re-run (see "BoardEx gate"). |
| T7 | DC stream + DMO | DC mapping pending UI (no live DC work in this pass). Mapping table below. |
| T8 | L3 smoke | Pending |

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
- **The BoardEx backfill precondition.** Live `BOARDEX_EXEC_INTEL` is **still the iid flag** (re-probed 2026-11-02 on the employer audience: 189,212 rows, 6,433 accounts, 2024-06 → 2026-11, TRUE rate 18.0%, **26,450 rises / 6,511 stays / 26,433 falls**). Under the bidirectional gate that means about 910 C-suite departures a month. An offline simulation of the 104-week backfill against live iid BoardEx gave 31,081 rows (about 298 a week, range 258-344), which would fail contract (a) [30, 200].
  - The Plan 10 sticky fix is deployed but its `CALL SP_GENERATE_BOARDEX_EXEC_INTEL(30, TRUE)` re-run has not happened.
  - Offline replay of the sticky logic over the 6,435 employers projects 2,494 rises / 31,878 stays / 2,452 falls, 69-110 rises a month (mean 86), TRUE rate 18.4%.
  - **Do not run the T6 backfill until the BoardEx re-run lands and a re-probe matches the projection.**
- **Weekly window (design issue for T4).** The TASK fires Monday 09:00 UTC. If the default run processed only the current week, it would see only Monday's detections, and events detected Tuesday through Sunday would never be written. The default run (`BACKFILL_WEEKS=0`) must therefore process **the previous complete week plus the current partial week**. The MERGE on `(ORG_ID, EVENT_ID)` is idempotent, so the overlap is free. Contract (a) [30, 200] applies to complete weeks only. A partial Monday week holds about 9 rows.
- **Contract (d) needs a completeness window.** Check (d) has two parts:
  - Every C-suite `Departed` falls in a rise month.
  - Every rise month that is **complete** (`run_date - month_end > 52` days) and **inside the window** (`month_start + 3 ≥ window_start`) has exactly one.

  Incomplete or edge months are skipped because their departure may not be detected yet, or was detected before the window. `_csuite_gate_violations` is the Python mirror of this check.
- **Paired events write to another account.** The destination comes from the same-INDUSTRY pool when that pool has ≥ 2 members, otherwise from the full employer pool. It is never the source account (index + 1 skip). If the pool is a single member, Existing Client degrades to Prospect. The mirror's detection is up to 7 days later and can land in a later week, so window edges can leave a `PAIRED_EVENT_ID` whose partner is outside the backfill (5 in the simulation). L3 must exempt rows within 7 days of the window edges.
- **Wealth pool.** The SP loads the Wealth Management PERSON `ACCOUNT_ID`s (3,920) sorted ascending, and picks one by `sha256(event_id + "_wealth") % len(pool)`. That is only for C-Suite / VP `Departed`, at 6%. An empty pool returns None.
- **Employer audience predicate** is `ACCOUNT_TYPE_FLAG = 'BUSINESS' AND COALESCE(CLIENT_CATEGORY, '') <> 'Household'` (6,435 anchors). Without `COALESCE`, NULL categories would drop. 661 of the employers have NULL `EMPLOYEE_COUNT`, so they get the 2-slot roster and BoardEx never flags them.
- **write_pandas types.** `write_pandas` mistypes datetimes and all-NULL date columns as NUMBER. In the MERGE source, use `TO_TIMESTAMP_NTZ(GENERATED_AT::NUMBER/1e9)` and `TO_DATE(TO_TIMESTAMP_NTZ(col::NUMBER/1e9))` for the 3 DATE columns. Cast the 3 BOOLEANs with `::BOOLEAN`. `RECORD_ID` has no default, so set it on INSERT **and** UPDATE. Snowflake MERGE has no `NOT MATCHED BY SOURCE`, and events never delete anyway.
- **Deploy connection.** `scripts/deploy_sp.py` must run an unflagged `/opt/homebrew/bin/snow sql -f` (never `-c`). On 2026-11-02 the CLI default connection `GSB13421_jwt` returned 404. `SNOWFLAKE_DEFAULT_CONNECTION_NAME=SFDC_DC_TECH_ARCH_jwt` works: it is still JWT, still unflagged, and opens no OAuth popup.
- One SP per dataset, with no inter-SP imports. DROP the procedure before redeploying if the signature changes. The TASK runs on `MAIN_WH_XS` via `SP_RETRY_WRAPPER('DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_USERGEMS_JOB_CHANGES()', 2)`.
- DC mapping descriptions must be ≤ 521 characters.
- Snowflake DATE columns auto-discover as `MM/dd/yyyy` in the DC data-stream body.

## Tests
```bash
cd Snowflake_UserGems_JobChanges
python3 -m pytest -q -p no:cacheprovider
```
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
