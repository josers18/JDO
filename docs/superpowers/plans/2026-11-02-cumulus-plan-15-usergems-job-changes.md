# Cumulus Plan 15 — UserGems Job Changes Implementation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Stand up the fifteenth per-dataset Cumulus pipeline: UserGems-style **person-level job-change events** for contacts at non-household business accounts. It covers departures, inbound hires and promotions. Each event carries champion/primary-contact flags, a new-employer resolution (existing client / prospect / unknown), opportunity and relationship-risk scores, and a Wealth tie-in. That tie-in flags departing executives who are themselves Cumulus Wealth Management clients (liquidity event). Weekly cadence. The SP emits the events **detected** in the run week into `DATA_JEDAIS.FINS__PUBLIC.USERGEMS_JOB_CHANGES`, roughly 86 events/week and ~9K events with the 24-month backfill (offline replay of the row factory against the live sticky BoardEx flag; see §2). The table is federated as `CumulusUserGemsJobChanges__dlm`.

**Why this dataset:** the 2026-11-02 vendor-gap assessment found that executive movement exists only as an **account-level** flag (BoardEx `EXEC_TURNOVER_FLAG`, `CEO_TENURE_YEARS`). No dataset says *who* moved, *where they went*, or *whether they were our champion*. That person-level answer is the whole UserGems value proposition. It powers two demo stories:
- **Commercial:** "your CFO champion at Acme just joined Beta Corp, a prospect. Warm intro."
- **Wealth:** "a Wealth client just left a C-suite role. Rollover and liquidity conversation."

**Architecture:** Instantiates the dataset template (v1.5). There are **five structural deviations**, making this the most event-shaped instantiation in the rollout:

1. **Event-scoped, not period-scoped (first in the rollout).** The PK is `EVENT_ID`, a deterministic UUID, not `(ACCOUNT_ID, PROFILE_*)`. Most accounts emit **zero** rows in a given week. `PROFILE_WEEK` is the *detection* week and is a partition attribute, not part of the PK.
2. **Coverage assertion replaced by a volume band + audience-membership check.** "Distinct accounts = audience" can't hold for a sparse event stream. See §2.
3. **Hard cross-plan read of BoardEx (Plan 10), with a bidirectional consistency rule.** `rise(M)` = BoardEx `EXEC_TURNOVER_FLAG` TRUE in month M and FALSE in M-1; a missing M-1 row (pre-history) is not a rise. A rise in month M emits **exactly one** C-suite `Departed` in M, and a non-rise month emits **zero**. See "BoardEx gate" in §2.
4. **Paired events.** When a departing contact resolves to another audience anchor (`NEW_EMPLOYER_STATUS='Existing Client'`), the row factory also emits a mirrored `Joined` event on the destination account, cross-linked via `PAIRED_EVENT_ID`. The row factory emits rows for accounts *other than* the anchor it's processing, which is a first.
5. **Wealth tie-in reads a second audience.** About 6% of C-suite/VP departures link `PERSON_ACCOUNT_ID` to a deterministic Wealth Management PERSON anchor (3,920 available) and set `LIQUIDITY_EVENT_FLAG`.

**Depends on:** Plan 0, **Plan 10 (BoardEx) — hard dependency**. The SP fails fast if `BOARDEX_EXEC_INTEL` is absent. Independent of Plans 14 and 16.

---

## §1 Placeholder values

| Placeholder | Value |
|---|---|
| `<<PLAN_N>>` | `15` |
| `<<DATASET_SLUG>>` | `usergems-job-changes` |
| `<<DATASET_SLUG_UNDERSCORE>>` | `usergems_job_changes` |
| `<<MIMICS_VENDOR>>` | `UserGems` |
| `<<DATASET_TABLE>>` | `USERGEMS_JOB_CHANGES` |
| `<<DATASET_TABLE_LOWER>>` | `usergems_job_changes` |
| `<<REPO_DIR>>` | `Snowflake_UserGems_JobChanges` |
| `<<DC_DMO>>` | `CumulusUserGemsJobChanges__dlm` |
| `<<DATASET_SALT>>` | `usergems` (per account-month event draw) + `usergems_person` (names, titles, champion flags — keyed by EVENT_ID) — two salts |
| `<<CADENCE>>` | `WEEKLY` |
| `<<TASK_NAME>>` | `TASK_WEEKLY_USERGEMS_JOB_CHANGES` |
| `<<TASK_NAME_LOWER>>` | `task_weekly_usergems_job_changes` |
| `<<SP_NAME>>` | `SP_GENERATE_USERGEMS_JOB_CHANGES` |
| `<<CRON>>` | `'USING CRON 0 9 * * 1 UTC'` (Monday 09:00 UTC; after BoardEx's 1st-of-month 03:00 America/New_York run (07:00/08:00 UTC by DST), so a Monday-the-1st sees the new BoardEx month) |
| `<<AUDIENCE_PREDICATE>>` | `ACCOUNT_TYPE_FLAG = 'BUSINESS' AND COALESCE(CLIENT_CATEGORY, '') <> 'Household'` (employers); secondary pool `CLIENT_CATEGORY = 'Wealth Management'` (PERSON_ACCOUNT_ID targets) |
| `<<COVERAGE_RULE>>` | **Volume band + membership + BoardEx gate** (see §2): rows per *complete* week in [30, 200]; 100% of `ACCOUNT_ID` and non-NULL `NEW_ACCOUNT_ID` ∈ employer audience; 100% of non-NULL `PERSON_ACCOUNT_ID` ∈ Wealth pool; C-suite departures one-to-one with BoardEx rises |
| `<<ROW_PK>>` | `EVENT_ID` |
| `<<COLUMN_LIST>>` | See rowspec — 22 data columns (+ `ORG_ID`, `RECORD_ID`) including 6 NULLable, 3 BOOLEAN |

## §2 Audience-predicate probe

**Employer audience:** `ACCOUNT_TYPE_FLAG = 'BUSINESS' AND COALESCE(CLIENT_CATEGORY, '') <> 'Household'`, which is **6,435 anchors** (probed 2026-11-02; same audience as Plan 14, with the same `COALESCE` rationale). **Wealth pool:** `CLIENT_CATEGORY = 'Wealth Management'`, which is **3,920 PERSON anchors**.

**Coverage deviation.** A job-change feed is sparse by nature: in a given week ~98.7% of accounts have no detected move. Padding with "no-change" rows would turn an event stream into a dense snapshot and destroy the shape. The template's `assert_coverage(audience_sql, actual_sql)` call is replaced by `_assert_event_contract(session, week)`, which raises if any of these fail:
- (a) a **complete** week's row count is outside [30, 200] (the run's current partial week is exempt; see Task 4 "Weekly window");
- (b) any `ACCOUNT_ID` / `NEW_ACCOUNT_ID` falls outside the employer audience;
- (c) any `PERSON_ACCOUNT_ID` falls outside the Wealth pool;
- (d) the BoardEx gate fails in either direction:
  - any C-suite `Departed` falls in a month that is not a BoardEx rise for its account;
  - any rise month that is **complete** (more than 52 days between month end and the run date) and **inside the backfill window** (`month_start + 3 days ≥ window start`) does not have exactly one C-suite `Departed`.

  Incomplete and edge months are skipped because their departure may not be detected yet, or was detected before the window. `_csuite_gate_violations` in the row-factory module is the Python mirror of this check.

`SP_RETRY_WRAPPER` retry semantics are unchanged.

**Expected volume.** Tracked contacts per account scale with EMPLOYEE_COUNT (2 / 3 / 5 / 8 / 12 by band). The monthly move hazard per tracked non-C-suite contact is 1.4% (≈16%/yr, in line with UserGems' published ~20% annual B2B contact churn). On top of that, every BoardEx rise adds exactly one C-suite departure. The audience is ~76% 1–10-employee firms (4,921 of 6,435 by EMPLOYEE_COUNT band, with the 661 NULL-count anchors in that band).

The table below comes from an **offline replay against live inputs**, made before the deploy. The live table (9,017 rows, 2,123 C-suite departures; see Task 8) replicates it within run-date drift. The row factory's own window path (`_rows_for_window`) was replayed over the live 6,435-employer audience, the live 3,920-id Wealth pool and the **live sticky** BoardEx rows for 2024-07 → 2026-11, all pulled read-only on 2026-11-02 after the Plan 10 re-run. The window is the 104 weeks from 2024-11-04 plus the current partial week, with run date 2026-11-02. These figures are confirmed against the live rise counts below. They agree with the earlier replay against the projected sticky flag (about 9,000 rows, 2,119 C-suite departures), as expected, since the projection matched live exactly.

| Source | Events / month |
|---|---|
| Non-C-suite hazard (Departed / Promoted / Joined) | ~266 |
| C-suite departures (one per BoardEx rise) | ~88 |
| Paired `Joined` mirrors (~11% of departures) | ~20 |
| **Total** | **~375 / month ≈ 86 / week → 9,006 over 104 weeks + the partial week** |

Weekly rows over the 104 complete weeks were min 61, median 86, max 109, and the partial week (2026-11-02) had 9. The replay had 2,119 C-suite departures against 1,941 complete in-window rises, and 0 gate violations. L3 accepts **7K–11K** for the backfill.

**BoardEx gate (bidirectional, tightened 2026-11-02).**
- **Rule.** `rise(M)` = `EXEC_TURNOVER_FLAG(M)` TRUE and `EXEC_TURNOVER_FLAG(M-1)` FALSE. A missing M or M-1 row is NOT a rise: 2024-06 has no M-1, and a month may not be generated yet. A rise in M emits exactly one C-suite `Departed` in M, and a non-rise month emits zero.
- **What the SP reads.** For each week it reads BoardEx for the 4 candidate months plus the month before the earliest (5 months).
- **Draws.** On a rise, `_events_for(..., boardex_rise, ...)` picks the C-suite persona with one `rng.choice` on the account-month rng, after the hazard loop. There is no probability draw.
- **Why it needed the Plan 10 fix.** The tightening only makes sense once the flag is trailing-12-month sticky (Plan 10 C-suite timeline). Under the old iid flag, rises were so frequent that this rule forced a C-suite departure at ~14% of accounts every month.

**Live BoardEx rise counts (re-probed 2026-11-02 evening, employer audience): sticky.** Plan 10's `CALL SP_GENERATE_BOARDEX_EXEC_INTEL(30, TRUE)` ran 2026-11-02 at about 15:36 PST (table LAST_ALTERED 15:39 PST).
- 189,214 rows over 6,435 accounts, 2024-06 → 2026-11, TRUE rate 18.76%.
- **2,494 FALSE→TRUE rises / 31,878 TRUE→TRUE stays / 2,452 TRUE→FALSE falls** over 29 transition months, with 2,179 rises in 2024-11 → 2026-11.
- This is an exact match for the offline replay of the deployed Plan 10 logic over the same 6,435 employers, which projected 2,494 / 31,878 / 2,452 and 69–110 rises a month (mean 86). The 661 NULL-EMPLOYEE_COUNT employers are always FALSE.
- One exact duplicate BoardEx row existed (`001am00000qvjs6AAA`, 2026-10, FALSE, same RECORD_ID). It was not a rise and didn't affect the gate. Removed 2026-11-02; BoardEx is now unique on its PK.

These numbers drive the volume table above and the L3 bands in Task 8.

**History.** Before the re-run, the first probe that day found the iid flag: 189,212 rows over 6,433 accounts, TRUE rate 18.0%, 26,450 rises / 6,511 stays / 26,433 falls. The same replay against that table gave 31,081 backfill rows (~298 a week), which would have failed contract (a). A probe in the first Task 6 pass also reported "still iid", but it ran before the re-run landed. Its other evidence (`GENERATED_AT` = month start, ~2,150 TRUE a month) holds for the sticky table too, so it can't tell iid from sticky. Compare rise/stay/fall counts instead.

**Backfill precondition: met (2026-11-02).** The BoardEx re-run landed and the re-probe matches the sticky projection. If BoardEx is ever re-run again before the Task 6 backfill, repeat the rise/stay/fall probe first.

## §3 Rowspec attachment

`docs/superpowers/plans/attachments/cumulus-plan-15-usergems-job-changes-rowspec.md`

The attachment contains:
- 22-data-column DDL (16 NOT NULL + 6 NULLable) plus `ORG_ID` + `RECORD_ID`, and PK `EVENT_ID`.
- The event-generation model: per (account, event_month) draws, detection lag and week filtering.
- The BoardEx C-suite gate and paired-event construction.
- The persona/title vocabulary by employee band and new-employer resolution.
- Champion / primary-contact logic, opportunity and relationship-risk scoring, and the Wealth liquidity tie-in.
- `_events_for(anchor, event_month, boardex_rise, ctx)` skeleton.
- L1 targets.

## §4 What changes from the v1.5 template

1. **Task 1 (scaffold).** AGENTS.md gotchas:
   - **Event-scoped.** One row per event, not per account-period. Most anchors return `[]` for most months, and **that is correct**. Do not "fix" it.
   - **Events are generated per event month and filtered by detection week.** For run week W, candidate event months are `month(W_end)` and the 3 prior months, because detection lag is up to 52 days (45, plus the 7-day mirror offset) and a week can straddle a month boundary. The SP keeps events with `DETECTED_DATE ∈ [W, W+6]` and `DETECTED_DATE ≤ run_ts.date()`. The same event is always generated with the same EVENT_ID, whichever week computes it.
   - **`record_id_for` is not exported** from `cumulus_common/__init__.py`. The SP module defines a local `_record_id_for`, and an L1 parity test compares it with `cumulus_common.record_id.record_id_for`. `Snowflake_Cumulus_Common` is not modified.
   - **EVENT_ID** = `record_id_for(account_id, event_month, slot, kind)`, where `kind ∈ {hazard, csuite, pair}`. Paired mirrors use `kind='pair'` with the *source* event's coordinates, so they're deterministic too.
   - **BoardEx hard dependency.** Read `BOARDEX_EXEC_INTEL` once per run, restricted to the 4 candidate months **plus the month before the earliest** (5 months): `{(ACCOUNT_ID, PROFILE_MONTH): EXEC_TURNOVER_FLAG}`. `rise(M)` = flag(M) TRUE and flag(M-1) FALSE. If either row is missing (pre-history, or the new month not yet generated), M is not a rise and **no** C-suite departure is emitted. A rise emits exactly one. If the table itself is missing, raise.
   - **Paired events write to another account.** The destination is a different employer-audience anchor, picked deterministically from a same-INDUSTRY-preferred pool. It must never be the source account.
   - **Wealth pool read.** Load the Wealth Management PERSON `ACCOUNT_ID`s sorted ascending once per run. Pick by `int(sha256(event_id)) % len(pool)` so the choice is stable as long as the pool is stable.
   - DC mapping descriptions ≤521 chars.

2. **Task 2 (table DDL).**
   - Leading `ORG_ID VARCHAR(18) NOT NULL DEFAULT 'JDO'`, then `RECORD_ID VARCHAR(36) NOT NULL` = `record_id_for(org_id, event_id)`.
   - PK `(ORG_ID, EVENT_ID)`.
   - `_STAGING` sibling.
   - Cluster key `(PROFILE_WEEK)` is optional; the table is small.
   - Schema at `Snowflake_UserGems_JobChanges/schemas/usergems_job_changes.sql`.

3. **Task 3 (L1 tests).** Inline **10-anchor** employer fixture across all 5 employee bands, plus a 5-anchor Wealth pool and a synthetic BoardEx dict. Property #4 classes:
   - **4a Range:** OPPORTUNITY_SCORE and RELATIONSHIP_RISK_SCORE in [0,100]; `EVENT_DATE ≤ DETECTED_DATE ≤ EVENT_DATE + 45d`, or `+ 52d` for paired `Joined` mirrors (the 0..7-day mirror offset).
   - **4b Vocabulary:** EVENT_TYPE ∈ {Departed, Joined, Promoted}; SENIORITY ∈ {C-Suite, VP, Director, Manager}; CONTACT_PERSONA ∈ the 9-value set; NEW_EMPLOYER_STATUS ∈ {Existing Client, Prospect, Unknown, Not Applicable}.
   - **4c BoardEx gate (load-bearing, bidirectional):**
     - A FALSE→TRUE rise in month M gives **exactly one** C-suite departure in M.
     - A non-rise month (TRUE→TRUE, TRUE→FALSE, FALSE→FALSE, or missing M-1) gives **zero**.
     - BoardEx all-FALSE and all-TRUE both give 0 over 24 months × 10 anchors, because neither has a rise.
     - Known rises driven through `_rows_for_week` give a C-suite departure per rise and nothing else.
     - A rise does not shift any hazard event (draw-order discipline).
   - **4d Pairing:**
     - Every `Existing Client` departure has a `PAIRED_EVENT_ID` pointing to a `Joined` row on `NEW_ACCOUNT_ID`, with the same CONTACT_NAME and `EVENT_DATE`.
     - The mirror's `PAIRED_EVENT_ID` points back.
     - `NEW_ACCOUNT_ID != ACCOUNT_ID`.
   - **4e Cross-field:**
     - `Promoted` gives `NEW_EMPLOYER_STATUS='Not Applicable'` and NULL NEW_EMPLOYER_NAME/NEW_ACCOUNT_ID.
     - `Departed` + `Unknown` gives NULL NEW_TITLE.
     - `LIQUIDITY_EVENT_FLAG` ⇒ `PERSON_ACCOUNT_ID IS NOT NULL AND EVENT_TYPE='Departed' AND SENIORITY IN ('C-Suite','VP')`.
   - **Schema:** dict keys = 22 data columns.
   - **Determinism:** generating month M from week W1 and from week W2 yields an identical EVENT_ID set and identical rows.

4. **Task 4 (SP).**
   - Signature: `SP_GENERATE_USERGEMS_JOB_CHANGES(BACKFILL_WEEKS INTEGER DEFAULT 0)`, using the Plan 14 pattern; one SP, no inter-SP imports.
   - MERGE `ON (ORG_ID, EVENT_ID)` with `WHEN MATCHED THEN UPDATE` / `WHEN NOT MATCHED THEN INSERT`. Events are immutable in practice, and the UPDATE only exists so a rowspec fix can be re-run.
   - Boolean casts on 3 columns; the v1.4 `TO_TIMESTAMP_NTZ(... / 1e9)` fix on GENERATED_AT.
   - `TO_DATE(TO_TIMESTAMP_NTZ(col::NUMBER/1e9))` on 3 DATE columns. EVENT_DATE and DETECTED_DATE are never NULL, but use the same cast for uniformity.
   - Then `_assert_event_contract` (§2 checks a–d; (d) per `_csuite_gate_violations`).
     - (d) runs as three SQL checks: d1 no C-suite departure outside a rise, d2 at most one per account-month, d3 each complete in-window rise has one. All are scoped to the run window (`DETECTED_DATE` in `[first run week, run date]`).
     - BoardEx is read for the union of the run weeks' 5-month spans (2024-07 → 2026-11 for the backfill at 2026-11-02).
   - `_rows_for_window` generates each (anchor, month) once over the window. L1 proves it equals the concatenation of `_rows_for_week`.
   - L2 hook: `_RUN_TS_SQL` (None in production) lets the fixture build pin the clock.
   - **Weekly window.** The TASK fires Monday 09:00 UTC, so the current week then holds only Monday's detections. If the default run processed only the current week, events detected Tuesday through Sunday would never be written. With `BACKFILL_WEEKS=0` the SP must process **the previous complete week plus the current partial week**. The MERGE is idempotent, so the overlap is free. Contract (a) applies only to complete weeks; a partial week holds only the days up to the run date (about 9 rows for a Monday; the live backfill, whose UTC run date was 2026-11-03, held 20).

5. **Task 5 (L2).**
   - **Where (as built):** a scratch schema `DEMO_DB.CUMULUS_L2_USERGEMS`, not `_FIXTURE` objects in `FINS__PUBLIC`, because SYSADMIN has no CREATE TABLE there. `scripts/deploy_sp.py --fixture-schema` builds the real SP body retargeted at the scratch schema with a pinned clock (`L2_RUN_CLOCK`). The L2 SQL is generated by `tests/integration/build_l2.py` and drops the schema at the end.
   - Fixtures: `V_ACCOUNT_ANCHORS` (10 employers + 1 NULL-attribute employer + 5 Wealth + 1 Household) and `BOARDEX_EXEC_INTEL` for 2024-07 → 2026-11. The rises are designed: 7 complete, 2 incomplete, plus a no-M-1 case and an out-of-audience case.
   - **Assertions:**
     - `CALL SP(104)` (24 months) gives row count within the fixture's expected band.
     - C-suite departures appear exactly once in each complete fixture rise month and nowhere else.
     - Every pair is cross-linked.
     - An idempotent re-run leaves the count and checksum unchanged.
   - **Overlap proof:** run two default (`BACKFILL_WEEKS=0`) runs a week apart. Their windows share one week, and every EVENT_ID that both runs write is detected on the shared Monday with identical rows. Their union equals the backfill's rows for those weeks, with no gap.
   - **As run (2026-11-02):** 29/29 checks TRUE. The fixture backfill has 37 rows, with parity both ways on all 24 columns. Contract (a) raises against the production band, and contract (d) raises on a flipped rise and on a duplicate departure.

6. **Task 6 (deploy).**
   - Clone Plan 12's `deploy_sp.py`, then swap the coverage inline for `_assert_event_contract`.
   - Cron `0 9 * * 1 UTC`, `MAIN_WH_XS`, `SP_RETRY_WRAPPER('DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_USERGEMS_JOB_CHANGES()', 2)`.
   - After deploy: `CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_USERGEMS_JOB_CHANGES(104)` once, for the 24-month backfill. That stays inside BoardEx's 2024-06 → present history (2024-10, the M-1 of the earliest candidate month, exists). **Precondition:** the BoardEx 30-month re-run has landed and the §2 re-probe matches the sticky projection.
   - Run every step as `ACCOUNTADMIN`, which owns `DATA_JEDAIS.FINS__PUBLIC` and every sibling (`snow sql ... --role ACCOUNTADMIN`, `deploy_sp.py --role ACCOUNTADMIN`).
   - **Done 2026-11-02 (operator, ACCOUNTADMIN).** DDL applied, `deploy_sp.py --role ACCOUNTADMIN`, `CALL ...(104)` → `SUCCEEDED rows=9017 updated=0 accounts=6435 weeks=105 (2024-11-04..2026-11-02)` (logged 31 s; started 2026-11-03 02:33 UTC, so the UTC run date was 2026-11-03 and max `DETECTED_DATE` is 2026-11-03), then the TASK SQL created and RESUMEd `TASK_WEEKLY_USERGEMS_JOB_CHANGES` (`0 9 * * 1 UTC`). The earlier agent passes were refused `ACCOUNTADMIN` by the session permission policy; the operator ran the sequence from the main session.

7. **Task 7 (DC stream + DMO).** Mapping table:

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
   | PERSON_ACCOUNT_ID | personAccountId__c | Text (NULLable; third relationship to `ssot__Account__dlm` — the Wealth client) |
   | LIQUIDITY_EVENT_FLAG | liquidityEventFlag__c | Boolean |
   | GENERATED_AT | generatedAt__c | DateTime |

   **Three relationships to the Account DMO** (employer, new employer, Wealth person). This is the first Cumulus DMO with more than one. Create the primary `ssot__AccountId__c` relationship via the API path. If the API rejects the second and third, add them through the DC Setup UI (DMO → Relationships), and record which path worked in AGENTS.md.

8. **Task 8 (L3 smoke).** **Done 2026-11-02 — all checks pass:** 9,017 rows / 9,017 distinct EVENT_IDs over 105 weeks (2024-11-04 → 2026-11-02); complete weeks 61–109 (avg 86.5, 0 outside [30, 200]); 2,123 C-suite departures, gate (i) 0 violations, gate (ii) 1,941 complete rises with 0 ≠ 1; 984 paired rows, 0 self-pairs, 8 orphans all at the window edges (detected 2024-11-04..09 / 2026-11-02..03); mix Departed 48.1 / Joined 30.2 / Promoted 21.7; resolution Existing 11.4 / Prospect 49.8 / Unknown 38.8; champion 12.0% overall / 34.3% finance; liquidity 6.0% of C-suite+VP departures, 0 bad PERSON_ACCOUNT_IDs, 0 flag mismatches; 0 ACCOUNT_IDs outside the audience; size scaling 1.717 vs 0.525 events/acct/yr (3.27×). Backfill rows in **7K–11K**; rows per complete week in [30, 200]. The bands come from the §2 replay against live sticky BoardEx (9,006 rows; weeks 61–109). Spot-check:
   - **BoardEx gate, both directions:**
     - Both checks must restrict BoardEx to the employer audience (BoardEx covers 36,949 accounts) and read it with `SELECT DISTINCT` to collapse the known duplicate row, as the SP does. Unrestricted, (ii) reports false violations.
     - (i) C-suite `Departed` grouped by `(ACCOUNT_ID, DATE_TRUNC('month', EVENT_DATE))`, joined to BoardEx M and M-1, where it is not `flag(M) AND NOT flag(M-1)` (both rows present): must be **0**.
     - (ii) BoardEx rise months that are complete (`DATEADD(day, 52, LAST_DAY(M)) < CURRENT_DATE`) and in the window (`DATEADD(day, 3, M) ≥` backfill start), left-joined to the C-suite departure counts, with count ≠ 1: must be **0**.
     - The C-suite departure total should be ~1.7K–2.6K (replay: 2,119; 1,941 complete in-window rises).
   - **Pairs:** 0 self-pairs. 0 orphan `PAIRED_EVENT_ID`s, except rows whose `DETECTED_DATE` is within 7 days of the window start or the run date, where the partner can fall outside the window (5 in the replay).
   - **Mix:** Departed 42–54%, Promoted 17–27%, Joined 25–36% (inbound + mirrors). The replay gave 48.0 / 21.8 / 30.2.
   - **Resolution:** among Departed rows, `Existing Client` 10–15%, `Prospect` 45–55%, `Unknown` the rest. The replay gave 11.3 / 49.9 / 38.8.
   - **Champion:** WAS_CHAMPION 9–16% overall, and ≥30% on Finance personas (CFO / Controller / Treasurer / VP Finance). The replay gave 12.0 and 34.3.
   - **Wealth tie-in:** `LIQUIDITY_EVENT_FLAG` rows are 5–8% of C-suite+VP departures (replay: 6.0%), and every `PERSON_ACCOUNT_ID` resolves to a Wealth Management anchor.
   - **Size scaling:** events per account per year for 201+ employee anchors are ≥ 3× the 1–10 cohort (replay: 3.28× with the NULL-count anchors in the 1–10 cohort, 3.13× without).
   - **Demo pick:** list the Commercial Banking `Departed` + `WAS_CHAMPION` + `Prospect` events in the last 90 days, ordered by OPPORTUNITY_SCORE desc. That's the warm-intro list.

## §5 Self-review checklist

- [x] PK `EVENT_ID`; `PROFILE_WEEK` = detection week, not in PK.
- [x] EVENT_ID derives from `(account, event_month, slot, kind)` only, so recomputing from any week gives the same ID.
- [x] BoardEx gate bidirectional: a rise (flag(M) TRUE, flag(M-1) FALSE) emits exactly one C-suite departure, a non-rise month zero; missing M or M-1 row = not a rise; 5 BoardEx months read per week; missing table raises.
- [x] Default run covers the previous complete week plus the current partial week; contract (a) on complete weeks only.
- [x] Paired mirror: different account, cross-linked both ways, same contact + date.
- [x] `_assert_event_contract` replaces `assert_coverage`; all 4 checks implemented.
- [x] Wealth pool pick via sha256 mod over sorted IDs; LIQUIDITY flag only on C-suite/VP departures with PERSON_ACCOUNT_ID.
- [x] 6 NULLable / 3 BOOLEAN handled in the MERGE casts.
- [ ] DMO: three Account relationships documented (API or UI path recorded). *(Documented in the repo AGENTS.md mapping table; the path that worked (API vs UI) is still to be recorded, because the DC mapping is pending UI, same as Plans 1–13.)*
- [x] No `<<` placeholders left.

## §6 Out of scope

- Real UserGems / LinkedIn data, contact PII fidelity, emails or phone numbers. CONTACT_NAME is synthetic, drawn from the same name banks as Plan 10.
- Writing back to CRM `Contact` records, or creating Leads/Tasks from events. Downstream Flow/Agentforce work.
- **Making BoardEx `EXEC_TURNOVER_FLAG` trailing-12-month sticky.** Done in Plan 10 on 2026-11-02: code landed and deployed (C-suite timeline), and the live 30-month in-place re-run landed the same day. The §2 re-probe matches the sticky projection exactly.
- `SYNTH_RELATIONSHIP_GRAPH` `TALENT_FLOW` edges (source employer → destination employer from paired events). Natural Plan 9 extension once this table is LIVE. Plan 9's soft-dep pattern supports adding it as a new edge type.
- A persistent contact roster (the same named person across multiple events over years). Names are seeded per event.
- PERSON-anchor employers (Retail/Wealth individuals as companies).

## §7 Status

**LIVE** (2026-11-02): 9,017 events over 105 weeks; every Task 8 check passes. Drafted 2026-11-02 from the vendor-gap assessment. Tasks 1–5 done 2026-11-02 (86 L1 tests, L2 29/29 live in a scratch schema). Task 6 done 2026-11-02 by the operator as ACCOUNTADMIN after three refused agent attempts.
- The BoardEx precondition is met. Plan 10's 30-month re-run landed 2026-11-02, and live BoardEx on the employer audience is sticky: 2,494 rises / 31,878 stays / 2,452 falls (N=189,214, 6,435 accounts). That matches the projection exactly.
- The volume table and L3 bands are confirmed by replaying against the live inputs: 9,006 rows, complete weeks 61–109, 2,119 C-suite departures, 0 gate violations.
- Second review-fix pass (2026-11-02 late evening):
  - The SP gained a **BoardEx freshness guard**. `_load_boardex` raises if a needed month is missing or has fewer than 0.5 × the best month's employer rows. A month M is needed when `M + 3 days <= run date`, from the table's first month onward. Without the guard, a failed or late `TASK_MONTHLY_BOARDEX_EXEC_INTEL` would silently read as "no rise" and drop C-suite departures from weekly windows that are never revisited, and d3 can't see that on a weekly run.
  - The SP also gained a **conflicting-duplicate raise** in the BoardEx loader, plus `SELECT DISTINCT` in the contract (d) SQL. Live BoardEx had one exact duplicate key (a Plan 10 follow-up), removed on 2026-11-02.
  - L1 is now 86/86. L2 was re-run live: 29/29.

Task 7: DC mapping pending UI (mapping table in §4 and AGENTS.md). Task 8 L3: done, all checks pass (see §4 Task 8).

Operator sequence (README "Deploy"), done 2026-11-02: as ACCOUNTADMIN, apply the DDL, run `deploy_sp.py --role ACCOUNTADMIN`, `CALL ...(104)`, then the TASK SQL (creates + RESUMEs). L3 is recorded in §4 Task 8 and AGENTS.md.

See `Snowflake_UserGems_JobChanges/AGENTS.md`.

Plan 15 is the **first event-scoped dataset** (PK is an event ID, sparse per account). It's the first to **replace the coverage assertion** with an event contract, the first to emit rows on **accounts other than the anchor being processed** (paired mirrors), and the first DMO with **three relationships** to `ssot__Account__dlm`.
