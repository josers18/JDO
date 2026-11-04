# AGENTS.md — Snowflake_Demandbase_IntentSignals

Synthetic Demandbase / G2 / Bombora-style **third-party buying-intent** signals for the Cumulus FSC demo. Plan 14 (one of 16). Weekly cadence. Each non-household business account gets 1–4 topic rows per week showing which commercial-banking products it is researching off-site. **Third 1:N plan (after Plan 6 / Plaid and Plan 9 / Graph) and the first with a variable fan-out per period. It is also the first to derive multi-week trajectory fields by stateless recomputation rather than by reading earlier rows.**

## Status

| Task | State |
|---|---|
| T1 scaffold | done |
| T2 DDL (`schemas/demandbase_intent_signals.sql`, table + `_STAGING`) | **LIVE 2026-11-02** (applied as ACCOUNTADMIN). Both tables: 19 columns, 2 BOOLEAN, 2 NULLable, PK `PK_DEMANDBASE_INTENT_SIGNALS`, 0 rows at creation. The `LIKE`-copied `_STAGING` had the PK only until the first SP run: `write_pandas(auto_create_table=True, overwrite=True)` replaces `_STAGING` on every run with auto-inferred types and no PK (confirmed: `SHOW PRIMARY KEYS` on `_STAGING` returns nothing after the backfill) |
| T3 row factory + L1 tests | done; `_rows_for` lives in `procedures/sp_generate_demandbase_intent_signals.py` |
| T4 SP entry point (`main`, DELETE+INSERT, coverage, log) | done; **deployed 2026-11-02** as `SP_GENERATE_DEMANDBASE_INTENT_SIGNALS(BACKFILL_WEEKS NUMBER DEFAULT 0)` (SHOW PROCEDURES: `(DEFAULT NUMBER)`), owner ACCOUNTADMIN |
| T5 L2 (`tests/integration/test_demandbase_intent_signals_sp.sql`) | **run live 2026-11-02: 38 of 38 assertion columns TRUE** (Passes A–D 34, Pass E 4). `c09` was rewritten after a false FALSE (see Gotchas); `c10` is its new negative control. Pass D split (flagged/unflagged hits per week): 5/1, 5/0, 5/0, 5/0, 3/1 → 5 of 5 weeks pass; `gong_rows_joined=6` all 5 weeks. Pass E (real audience, `CALL (25)` on the `_TIMING` clone): 26 weeks, 6,435 accounts and 6,435 top rows every week, 274,143 rows, DURATION_MS 201,818 (3.4 min) |
| T6 deploy (`scripts/deploy_sp.py`) + TASK (`tasks/task_weekly_demandbase_intent_signals.sql`) | **SP + TASK LIVE 2026-11-02.** `TASK_WEEKLY_DEMANDBASE_INTENT_SIGNALS`: state `started`, owner ACCOUNTADMIN, MAIN_WH_XS, `USING CRON 15 3 * * 1 America/New_York`, body `SP_RETRY_WRAPPER('…SP_GENERATE_DEMANDBASE_INTENT_SIGNALS()', 2)`. First scheduled run: Monday 2026-11-09 03:15 ET |
| T6 one-time backfill `CALL …(25)` | **RUN 2026-11-02** (logged 2026-11-03 00:07:49 UTC): `SUCCEEDED rows=274143 accounts=6435 weeks=26`, DURATION_MS 217,113 (3.6 min). Real table: 274,143 rows, 26 distinct weeks 2026-05-11 … 2026-11-02 |
| T8 L3 smoke (`tests/integration/l3_smoke_demandbase_intent_signals.sql`) | **run on the real table 2026-11-02: 18 of 18 `l3_*` checks TRUE**, figures below. The checks are scoped to the 26-week window of the latest 26-week backfill run, so weeks the TASK adds later don't break them |
| T7 DC stream + DMO | **LIVE 2026-11-04** via REST (`BT_Demandbase_Intent_Signals`, category Other; see below) |

**L3 figures (2026-11-02, real `DEMANDBASE_INTENT_SIGNALS`, window 2026-05-11 … 2026-11-02):**
- 26 weeks; 6,435 accounts and 6,435 IS_TOP_TOPIC rows every week (audience = the backfill run's ACCOUNTS_PROCESSED, 6,435); 10,469–10,659 rows/week (avg 10,544); 274,143 rows total.
- 0 duplicate RECORD_IDs, 0 duplicate 4-part keys, 0 Household or non-business rows, 0 rows with `SURGE_FLAG = FALSE AND WEEKS_SURGING > 0`.
- Surging rows 13.5–14.8% per week (band 8–15%); accounts with ≥1 surging topic 20.1–22.1% per week (band 15–25%).
- Restaurant top topic in {Merchant, Payroll, Equipment, Cards}: 91.7% (≥75%). Real Estate / RE Holdings with CRE as top topic or top-2 by score: 92.6% (≥70%). Logistics / Wholesale Distribution rows that are FX or AP Automation: 57.8% (≥50%).
- Revenue tilt (rows per anchor-week): Treasury Management 0.545 at ≥$10M vs 0.014 at <$1M; SBA Lending 0.436 at <$1M vs 0.015 at ≥$10M (both ≥2×). The <$1M band includes NULL-revenue anchors (`COALESCE(ANNUAL_REVENUE, 0)`), matching the SP's `_revenue_tilt`, which treats NULL as main street. The earlier clone dry run read 0.013 / 0.437; the small shift comes from the bands being joined to today's `V_ACCOUNT_ANCHORS`.
- Trajectory: every surging row whose run fits in the window (35,966 rows, 18,943 of them multi-week) has WEEKS_SURGING equal to the consecutive surge run in the table. This checks all rows, not a sample of 20.
- Gong coherence (top rows): 69.7% have a competitor in Gong-Competitor account-weeks (16,436 rows, gate ≥55%) vs 4.7% elsewhere (150,874 rows, gate ≤30%).
- Run log (backfill run): `gong=present`, `gong_rows_joined` 1,564–1,679 per week (> 0 for all 26 weeks), no WARN.
- Demo pick (week 2026-11-02, Commercial Banking, longest Treasury Management surge): Powell-Wood Holdings `001am00002AYRiwAAH` (8 weeks, score 91), Sloan-Mccullough Industries (7, 93), Myers Industries (6, 98), Yates Corp (6, 98), Bell Industries (6, 72), Flores PLC Enterprises (5), Christensen-Blair Corp (5), Clark Enterprises (5), Hopkins PLC Industries (5), Hayden-Jordan Enterprises (5).
- Still to check after the first scheduled run (2026-11-09 03:15 ET): `TASK_HISTORY` and `TASK_EXECUTION_LOG` show a `TASK_WEEKLY_DEMANDBASE_INTENT_SIGNALS` entry for week 2026-11-09 (the TASK → `SP_RETRY_WRAPPER` → SP path has never run unattended; every run so far was a direct CALL), and that week is byte-identical (HASH_AGG) to a no-arg re-run of the same week.

## Boundaries
- Owns `DATA_JEDAIS.FINS__PUBLIC.DEMANDBASE_INTENT_SIGNALS` and `..._STAGING`, plus `SP_GENERATE_DEMANDBASE_INTENT_SIGNALS`, `TASK_WEEKLY_DEMANDBASE_INTENT_SIGNALS`, and the DC Data Stream / DLO / DMO `BT_Demandbase_Intent_Signals__dlm`.
- Does NOT own `V_ACCOUNT_ANCHORS`, `MASTER_ACCOUNTS`, `GONG_CALL_SENTIMENT` (read-only soft dependency) or the `seed_for` / `assert_coverage` / `record_id_for` helpers. Those belong to `Snowflake_Cumulus_Common`, and `scripts/deploy_sp.py` inlines them. Don't edit Cumulus_Common from here.
- **Account-scoped, sparse 1:N.** PK `(ORG_ID, ACCOUNT_ID, PROFILE_WEEK, INTENT_TOPIC)`. FK `ACCOUNT_ID` points to `ssot__Account__dlm`. The DC PK is the single column `recordId__c`.

## Conventions
- **Audience:** `ACCOUNT_TYPE_FLAG = 'BUSINESS' AND COALESCE(CLIENT_CATEGORY, '') <> 'Household'`, which is **6,435 anchors** (re-probed 2026-11-02 against `DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS`). It lives in `_AUDIENCE_PREDICATE`, which feeds both `AUDIENCE_SQL` and `COVERAGE_SQL`, plus the Python mirror `_anchor_in_audience`. Keep the three in sync.
- **Two salts**, both keyed `account_id + "_" + topic`:
  - `demandbase` (week-bucketed) drives score noise, the surge bump, UNIQUE_RESEARCHERS, KEYWORD_SAMPLE, SIGNAL_SOURCE, LAST_SIGNAL_DATE and the competitor gate.
  - `demandbase_year` (year-stable, `datetime(year, 1, 1)`) drives base affinity and competitor identity. The surge-episode block draws also use this salt, keyed by block index.
- **Week anchor:** `week_start = (run_ts - timedelta(days=run_ts.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)`. `GENERATED_AT = week_start`, so every run_ts in a week gives a byte-identical list.
- `accounts_processed` = audience size (distinct accounts). The row count is ~1.6× that.

## Tests
- **L1 totals: 77 tests** = row factory 46 + SP write path 23 (`tests/test_demandbase_intent_signals_sp.py`: week list, epoch-ns and RECORD_ID pinned to live Snowflake results, casts, transaction order, idempotency, stale-topic delete, rollback, Gong absent / probe error / duplicates / empty-week WARN, PK and coverage guards, backfill == standalone, memo keying, timing budget) + deploy 8 (`tests/test_deploy_sp.py`: signature, self-contained inlined body that executes and matches the module, committed SQL == generator, no `&` in any SQL file, TASK cron / wrapper, snow command never carries `-c` and forwards `--role`).
- **L3** (`tests/integration/l3_smoke_demandbase_intent_signals.sql`): SELECT-only Task 8 smoke over the real table (or the Pass E clone, by editing its two `SET` lines). Every `l3_*` column must be TRUE. It reads only the 26-week window of the latest successful 26-week backfill run in `TASK_EXECUTION_LOG` and compares per-week coverage with that run's `ACCOUNTS_PROCESSED`, so it stays valid after the TASK adds weeks and after `MASTER_ACCOUNTS` refreshes. Run it with `SNOWFLAKE_DEFAULT_CONNECTION_NAME=SFDC_DC_TECH_ARCH_jwt snow sql --role ACCOUNTADMIN -f …`.
- **L2** (`tests/integration/test_demandbase_intent_signals_sp.sql`): fixture-clone pattern (GET_DDL + sentinel REPLACE). Pass A runs with no Gong (12 anchors, exclusions, PK / RECORD_ID, NOT NULLs, vocab, surge semantics). Pass B is an idempotent re-run (HASH_AGG). Pass C covers `CALL (4)` / `CALL (1)` byte-identity per week. Pass D adds a Gong fixture (6 flagged anchors × 5 weeks plus a duplicate row): the ≥4-of-5-weeks split, PK unique, `gong_rows_joined=6` every week. Pass E runs the real-audience 26-week timing clone.
- **L1 row factory** (`tests/test_demandbase_intent_signals_row_factory.py`, 46 tests) runs on an inline 12-anchor fixture in `tests/conftest.py`. It does not use the shared SAMPLE_ANCHORS. The fixture covers 8 industries, a NULL industry, a Commercial Banking anchor at $29M, a NULL-revenue anchor and the all-NULL boring anchor. Out-of-audience anchors (Household, PERSON, empty id) must raise.
  - Determinism (same week, any weekday)
  - Fan-out (1–4 rows, exactly one IS_TOP_TOPIC, unique topics)
  - 50-week top-topic stability
  - 4a range
  - 4b vocabulary
  - 4c trajectory coherence: `SCORE_DELTA_WOW == score(W) - score(W-1)`; `WEEKS_SURGING(W) == min(WEEKS_SURGING(W-1)+1, 12)`, asserted non-vacuous (`checked_chain > 0`); `SURGE_FLAG` false ⇒ 0; brute-force consecutive count. Also a Dec→Jan year-boundary case, where `_base_affinity` reshuffles.
  - 4d bias bands: Restaurant top topic ≥80% over 200 samples; Real Estate has CRE in its top 2 ≥75%; Logistics + Wholesale Distribution mid-market book carries FX or AP Automation in ≥55% of rows (each industry ≥52%) so the L3 ≥50% gate keeps margin; revenue tilt; researcher scaling
  - 4e schema (17 keys)
  - Gong soft-dep:
    - competitor rate rises with the flag
    - NULL below 50, except a flagged top row
    - G2 forced; year-stable rival; the flag touches only competitor/source/note
    - **top-row metrics that mirror L2/L3:** flagged top rows ≥55% non-NULL vs unflagged ≤30% (L1 measures 72% / 4.2%); and the Task 5 split, 6 of 12 fixture anchors flagged ⇒ ≥3 flagged hits and ≤3 unflagged hits on the run week, and on ≥80% of 26 weeks (25 of 26 pass; 101 of 104 over two years). Because a single calendar week fails ~3% of the time, L2 evaluates the split over the 5 weeks of its `CALL SP(4)` pass and needs ≥4 of 5; L1 asserts every 5-week window over 104 weeks meets that
    - Gong dedup: `gong_flags_sql` aggregates per account; `_merge_gong_flags` unions duplicate rows' tokens order-independently; `_assert_unique_pk` rejects duplicate staged PKs
  - Numeric coercion (int / Decimal / str)
  - Boring case (top score <50 in ≥85% of 52 weeks, in [5, 25] in ≥75%, median in [5, 25])
  - A no-self-read guard
- Run with `pytest tests/ -v`. `pyproject.toml` adds `../Snowflake_Cumulus_Common` to `pythonpath`, so no `pip install` of Cumulus_Common is needed.

## Gotchas
- **1:N row factory.** `_rows_for(anchor, run_ts, gong_flags=None)` returns `list[dict]` of length 1–4 and **never `[]`**. The year-stable top-affinity topic always emits, even at score 5, which keeps distinct accounts equal to the audience. Up to 3 other topics emit when `score >= 40`, highest score first.
- **IS_TOP_TOPIC is year-stable affinity, not this week's max score.** It must not flicker. The tie-break is the topic name.
- **Trajectory is recomputed, never read.** `WEEKS_SURGING` and `SCORE_DELTA_WOW` call the pure `_score_for(anchor, topic, week)` for W-1 … W-12. The SP must **never `SELECT` from `DEMANDBASE_INTENT_SIGNALS`**; a self-read would make backfill order-dependent. An L1 guard test greps the module for it.
- **`seed_for` buckets on `%Y-%m` only.** Weekly seeds therefore put the ISO date into the key (`_week_seed`, Plan 12 pattern). Episode seeds put the block index into the key with a fixed epoch datetime. Without this, every week in a month would draw identical noise.
- **Surge-episode scheme (tuned from the rowspec's illustrative one):**
  - 12-week blocks counted from a Monday epoch (1970-01-05).
  - Each block is shifted by a fixed per-(account, topic) phase, so the whole book doesn't surge on a synchronized 12-week sawtooth.
  - At most one episode per block, 2–8 weeks long. Episodes truncate at the block end.
  - Hazard is `min(0.70, 0.15 × affinity)`. The bump is `U(35, 50)`.
  - **Reference sample (use these figures everywhere):** 791 live audience anchors (`MOD(ABS(HASH(ACCOUNT_ID)), 8) = 0`), 10 weeks ending 2026-11-02, current constants: 1.634 rows per anchor-week (~10.5K rows/week, ~273K over 26 weeks), 13.9% surging rows, 20.6% of accounts surging per week. The rowspec values gave ~1.3 rows and ~6–7% surging, below every L3 band. The constants are `_EPISODE_HAZARD_PER_AFF`, `_EPISODE_HAZARD_CAP` and `_SURGE_BUMP`.
- **Restaurant SBA Lending multiplier is 1.2 (the rowspec says 1.5).** With the <$1M tilt (×1.8), 1.5 put SBA at 2.7 against Merchant Services at 3.0. On all 876 live Restaurant anchors (2026 affinity year) only 77.2% then got a top topic in {Merchant, Payroll, Equipment, Cards}, failing the ≥80% L1 band. 1.2 gives 91.7%.
- **Logistics / Wholesale Distribution FX and AP multipliers are raised.** Logistics FX 2.0→2.2, AP 1.8→2.4; Wholesale Distribution FX 2.5→2.8, AP 2.0→2.8. The rowspec values put FX-or-AP in 49.6% of rows for the 313 live Logistics + WD anchors over 26 weeks, a coin flip against the L3 ≥50% band (the ≥$10M tilt lifts Treasury and Commercial Lending, which crowd FX/AP out). Re-tuned: 57.8% on live IDs (Logistics 58.5%, WD 56.6%), 57.7–59.7% on three random ID sets. Book-wide volume and surge rates moved by <0.5 pt.
- **Unmapped industries fall back to 1.0.** `Professional Services Mid-Market` (124 anchors), Healthcare and Life Sciences (25), `Financial Services` (33), the long tail and `''`/NULL have no `_INDUSTRY_AFFINITY` entry; only the revenue tilt shapes them. This is deliberate.
- **Effective SIGNAL_SOURCE mix is not 55/30/15.** Competitor rows force G2, so on the reference sample with no Gong flags the mix is Demandbase 49.7% / Bombora 27.8% / G2 22.6%; with every account Competitor-flagged it would be 20% / 11% / 69%. Live Gong flags Competitor on ~6% of accounts a week, so expect roughly 49/27/24.
- **LAST_SIGNAL_DATE falls in the 7 days *ending* on PROFILE_WEEK** (`PROFILE_WEEK - 0..6`), not `[PROFILE_WEEK, PROFILE_WEEK+6]`. The TASK runs Monday 03:15 ET, so any later day would be in the future. The rowspec's "≤ run_ts.date()" clamp would break same-week determinism. This follows the Plan 12 `LAST_CALL_DATE` precedent.
- **NULL ANNUAL_REVENUE is treated as main street** (`rev or 0`, per the rowspec). The boring anchor therefore leans toward SBA Lending and Business Credit Cards. It emits exactly one Awareness row in most weeks (≥60% asserted; 71% observed over 52 weeks) and occasionally a second row when a topic episode crosses 40.
- **Anchor numerics are coerced through `float()`** (`_num`). Snowpark returns NUMBER as int or Decimal, and JSON exports return it as str.
- **Gong soft-dep.** Probe `INFORMATION_SCHEMA.TABLES` for `GONG_CALL_SENTIMENT`.
  - If it's present, read same-week flags with `gong_flags_sql(week)` (one row per ACCOUNT_ID via `GROUP BY` + `LISTAGG(DISTINCT …)`), build a dict with `_merge_gong_flags`, and pass `flags.get(account_id)` to `_rows_for`. If it's absent, pass `None`; never fail.
  - **Gong is NOT unique on `(ACCOUNT_ID, PROFILE_WEEK)` live.** Its PK is a random `RECORD_ID` (`DEFAULT UUID_STRING()`) and the UNIQUE is unenforced; `001am00000qvjs6AAA` / 2026-09-28 has two rows today, inside the 26-week backfill. **Never plain-LEFT-JOIN Gong onto the anchor query**: it fans that anchor out into duplicate 4-part PKs with identical RECORD_IDs, which Snowflake accepts and which collide on DC `recordId__c` and break the one-IS_TOP_TOPIC check. Task 4 must call `_assert_unique_pk(staged_rows)` before DELETE+INSERT.
  - Task 4 logs `gong_rows_joined` (audience accounts with non-NULL Gong `KEY_TOPICS_FLAGS` that week; `gong_flags_sql` filters `KEY_TOPICS_FLAGS IS NOT NULL`, so this is ~1,560–1,680 of 6,435 per week even though Gong has a row for ~6,430 audience accounts per week) and `gong_competitor_accounts`. If Gong exists but `gong_rows_joined = 0` for the run week, log a warning: the bias silently missed. Task 8 checks that every live week has `gong_rows_joined > 0`.
  - A `Competitor` token (pipe-delimited) raises the competitor probability from 20% to 70% on rows with score ≥50.
  - **Top-row override:** on the IS_TOP_TOPIC row, a Competitor flag also lifts the score ≥50 gate, so p = 0.70 applies at any score.
    - Why: top rows rest at `min(55, 12×aff)` and mostly score below 50. With the gate kept, only 15.3% of top rows got a competitor on the reference sample (791 live anchors × 10 weeks) even when every week was flagged; with the override it is 69.6% flagged vs 4.2% unflagged. The plan's L2 (≥3 of 6 flagged top rows) and L3 (≥55% of top rows in Competitor weeks) gates were unreachable.
    - Non-top rows keep the gate. Recorded in plan §4a and in the rowspec.
  - The gate draw is unconditional, so the flag changes only RESEARCHING_COMPETITOR, SIGNAL_SOURCE (forced to G2) and INTENT_NOTE.
  - Gong's live coverage is all accounts × weeks (36,948 rows for 2026-11-02, one per account).
  - **Schedule: `USING CRON 15 3 * * 1 America/New_York`** (Monday 03:15 ET). Every live Cumulus TASK uses America/New_York 03:xx slots (SHOW TASKS, 2026-11-02): Gong 03:00 (ran 50 s on 2026-11-02), Graph 03:05, WEEKLY_BALANCE_REPORT 03:10, TASK_LOAD_MASTER_ACCOUNTS 03:25 daily. A UTC cron is wrong: `30 5 * * 1 UTC` is 00:30 ET in winter, ~2.5 h *before* Gong writes the week, so every scheduled run would miss the Gong bias and differ from a later backfill of the same week.
- **Household exclusion uses `COALESCE`.** `NULL <> 'Household'` is NULL in SQL and would drop the ~711 NULL-category anchors. Don't "simplify" it.
- **`record_id_for` is NOT exported from `cumulus_common/__init__.py`**, which exports only `seed_for` and `assert_coverage`. Task 4 must `from cumulus_common.record_id import record_id_for` (don't edit Cumulus_Common from this chain). `scripts/deploy_sp.py` must inline `cumulus_common/record_id.py` alongside `seed.py` / `coverage.py`. `RECORD_ID` is `NOT NULL` with **no default** in the target table, so every inserted row must carry it or the INSERT fails. (`_STAGING` is recreated by `write_pandas` on each run, so its DDL'd constraints don't survive the first run; the INSERT into the target is what enforces this.)
- **Write path (Task 4):**
  - Per-week **DELETE + INSERT in one transaction**. Snowflake MERGE has no `NOT MATCHED BY SOURCE`, and topics that fall below threshold must disappear for that week.
  - `SURGE_FLAG::BOOLEAN` / `IS_TOP_TOPIC::BOOLEAN`.
  - `TO_TIMESTAMP_NTZ(GENERATED_AT::NUMBER / 1000000000)`.
  - `TO_DATE(TO_TIMESTAMP_NTZ(col::NUMBER / 1e9))` for PROFILE_WEEK / LAST_SIGNAL_DATE when staging is auto-created by `write_pandas`.
  - Stamp `ORG_ID` (`anchor.ORG_ID or 'JDO'`) and `RECORD_ID = record_id_for(ORG_ID, ACCOUNT_ID, PROFILE_WEEK, INTENT_TOPIC)` on every inserted row. The row factory emits only the 17 data columns.
  - Note: `write_pandas(auto_create_table=True, overwrite=True)` recreates `_STAGING` from DataFrame dtypes, dropping the DDL'd column types. Either keep that path with the casts, or TRUNCATE and `write_pandas(auto_create_table=False)` into the typed staging table.
- **SP signature:** `SP_GENERATE_DEMANDBASE_INTENT_SIGNALS(BACKFILL_WEEKS NUMBER DEFAULT 0)` (INTEGER is NUMBER(38,0) in Snowflake). `0` runs the current week only (the TASK path). `N` runs weeks W-N … W in ascending order. One SP, no inter-SP imports. DROP the procedure before redeploying if the signature changes.
- **Cost / memo:** ~10 + 13×rows `_score_for` calls per anchor-week. Memoized with `functools.lru_cache` (16,384 entries each) on pure kernels keyed by the anchor fields the score reads, `(ACCOUNT_ID, INDUSTRY, ANNUAL_REVENUE, topic, week|year)`: `_base_affinity_k`, `_episode_phase`, `_score_k`. Keying on attributes, not just ACCOUNT_ID, keeps a stale entry from leaking across anchors (L1 test). Output is byte-identical to the unmemoized factory. The loop is anchor-outer / week-inner so the W-1 and surge-lookback scores hit the cache. Local timing (Apple Silicon, Python 3.14): the 6,435 × 26 backfill row build went from ~84 s to ~34 s (~0.2 ms per anchor-week); a single week takes ~1.3 s. L1 enforces < 5 ms per anchor-week; L2 Pass E measures the live `CALL (25)` via `TASK_EXECUTION_LOG.DURATION_MS` (< 30 min gate).
- **Write path as built (T4):** `write_pandas(auto_create_table=True, overwrite=True)` stages each week **before** `BEGIN`, because its DDL would implicitly commit an open transaction. Then `BEGIN; DELETE week; INSERT … SELECT casts FROM _STAGING; COMMIT`, with `ROLLBACK` on error. Dates ship as int64 epoch-ns so the staging column is deterministically NUMBER. Per week, in order: `_assert_unique_pk`, one IS_TOP_TOPIC per account, write, then `assert_coverage`. Only the DELETE and the coverage COUNT reference the target table (L1 self-read guard). The run summary (weeks, gong present/absent, per-week `rows` / `gong_rows_joined` / `gong_competitor_accounts`, plus any WARN) goes into `TASK_EXECUTION_LOG.ERROR_MESSAGE` on success. `BACKFILL_WEEKS` must be in [0, 104].
- **No bare `&` anywhere in SQL or in the inlined SP body** (snow sql template trap). The topic is `International Payments and FX`, and an L1 test asserts no `&` in any vocabulary string.
- **Deploy connection (resolved 2026-11-02).** `~/.snowflake/config.toml` sets `default_connection_name` to `GSB13421_jwt` (account `eob55465`), which returns `404 Not Found` on login. Select the SSC18700 JWT connection through the environment and pass the role. Never pass `-c` (it opens an OAuth popup):
  ```bash
  export SNOWFLAKE_DEFAULT_CONNECTION_NAME=SFDC_DC_TECH_ARCH_jwt
  snow sql --role ACCOUNTADMIN -f schemas/demandbase_intent_signals.sql
  python scripts/deploy_sp.py --role ACCOUNTADMIN
  snow sql --role ACCOUNTADMIN -f tasks/task_weekly_demandbase_intent_signals.sql
  ```
  - **Siblings are owned by ACCOUNTADMIN, not SYSADMIN.** The `snowflake` MCP runs as SYSADMIN: it can read `DATA_JEDAIS.FINS__PUBLIC` but has no CREATE TABLE there, and `SHOW` statements are disabled in its config. Use it for read-only checks only.
  - Every sibling lives in `DATA_JEDAIS.FINS__PUBLIC`; there is no `FINS` database.
- **L2 SQL: no `EXISTS (...) OR EXISTS (...)` in a WHERE clause.** Live on 2026-11-02 the original `c09` check (correlated EXISTS OR EXISTS) flagged `001DB0000000001AAA` / Equipment Finance / 2026-10-26 even though both EXISTS were FALSE for that row when projected in the SELECT list, and the row's history (63 → 71 surging/1 → 63) is correct. `c09` and the L3 trajectory check use JOIN + `GROUP BY` / `HAVING COUNT_IF` instead, and `c10` is a negative control that must catch an off-by-one.
- DC mapping descriptions must be ≤521 chars (Plan 6 finding).

## DC mapping (Task 7) — status: LIVE 2026-11-04 (REST API path)

Created through the Connect REST API (no UI steps), on the BT_ convention: connection `BT_Managed_Snowflake`, DIRECT_ACCESS zero copy (never needs a Full Refresh), `TOTAL_REPLACE`, category **Other** (DLO) / **OTHER** (DMO), not Profile.

| Asset | Name | Id |
|---|---|---|
| Data stream | `BT_Demandbase_Intent_Signals` | `1dsam000000Q2ar` |
| DLO | `BT_Demandbase_Intent_Signals__dll` | `0gOam000000awThEAI` |
| DMO | `BT_Demandbase_Intent_Signals__dlm` | `0gjam000001Ejr7AAC` |

Account relationships (ManyToOne → `ssot__Account__dlm.ssot__Id__c`, all ACTIVE): `account_id__c` (`0geam000003B3gnAAC`).

Verified 2026-11-04: DMO `COUNT(*)` = 274,143 = Snowflake; every row's `account_id__c` matches an Account. DMO field names are the lowercased Snowflake column + `__c` (the camelCase names in the original plan are superseded). The PK is `record_id__c`.

Single-column PK `record_id__c` (Plan 4 rule). Booleans are declared **Boolean** in the stream schema. Both DATE columns use `format: "MM/dd/yyyy"`.

| Snowflake | DC field | Type |
|---|---|---|
| RECORD_ID | record_id__c | Text (PK) |
| ORG_ID | org_id__c | Text |
| ACCOUNT_ID | account_id__c | Text (relationship → `ssot__Account__dlm.ssot__Id__c`) |
| PROFILE_WEEK | profile_week__c | Date (MM/dd/yyyy) |
| INTENT_TOPIC | intent_topic__c | Text |
| TOPIC_CATEGORY | topic_category__c | Text |
| IS_TOP_TOPIC | is_top_topic__c | Boolean |
| INTENT_SCORE | intent_score__c | Number |
| SURGE_FLAG | surge_flag__c | Boolean |
| WEEKS_SURGING | weeks_surging__c | Number |
| SCORE_DELTA_WOW | score_delta_wow__c | Number |
| JOURNEY_STAGE | journey_stage__c | Text |
| UNIQUE_RESEARCHERS | unique_researchers__c | Number |
| RESEARCHING_COMPETITOR | researching_competitor__c | Text (NULLable) |
| KEYWORD_SAMPLE | keyword_sample__c | Text |
| SIGNAL_SOURCE | signal_source__c | Text |
| LAST_SIGNAL_DATE | last_signal_date__c | Date (MM/dd/yyyy) |
| INTENT_NOTE | intent_note__c | Text (NULLable) |
| GENERATED_AT | generated_at__c | DateTime |
