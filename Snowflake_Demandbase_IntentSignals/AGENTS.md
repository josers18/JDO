# AGENTS.md — Snowflake_Demandbase_IntentSignals

Synthetic Demandbase / G2 / Bombora-style **third-party buying-intent** signals for the Cumulus FSC demo. Plan 14 (one of 16). Weekly cadence. Each non-household business account gets 1–4 topic rows per week showing which commercial-banking products it is researching off-site. **Third 1:N plan (after Plan 6 / Plaid and Plan 9 / Graph) and the first with a variable fan-out per period. It is also the first to derive multi-week trajectory fields by stateless recomputation rather than by reading earlier rows.**

## Status

| Task | State |
|---|---|
| T1 scaffold | done |
| T2 DDL (`schemas/demandbase_intent_signals.sql`, table + `_STAGING`) | written; **live apply pending: needs ACCOUNTADMIN** (see Gotchas → "Deploy connection"). Not yet present on SSC18700 (INFORMATION_SCHEMA re-checked 2026-11-02; default snow CLI connection still 404s on login). Blocks T4/T5 |
| T3 row factory + L1 tests | done; `_rows_for` lives in `procedures/sp_generate_demandbase_intent_signals.py` |
| T4 SP entry point (`main`, DELETE+INSERT, coverage, log) | pending |
| T5 L2 / T6 deploy + TASK + 26-week backfill / T8 L3 smoke | pending |
| T7 DC stream + DMO | **DC mapping pending UI** (mapping table below) |

## Boundaries
- Owns `DATA_JEDAIS.FINS__PUBLIC.DEMANDBASE_INTENT_SIGNALS` and `..._STAGING`, plus `SP_GENERATE_DEMANDBASE_INTENT_SIGNALS`, `TASK_WEEKLY_DEMANDBASE_INTENT_SIGNALS`, and the DC Data Stream / DLO / DMO `CumulusDemandbaseIntentSignals__dlm`.
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
- **L1** (`tests/test_demandbase_intent_signals_row_factory.py`, 46 tests) runs on an inline 12-anchor fixture in `tests/conftest.py`. It does not use the shared SAMPLE_ANCHORS. The fixture covers 8 industries, a NULL industry, a Commercial Banking anchor at $29M, a NULL-revenue anchor and the all-NULL boring anchor. Out-of-audience anchors (Household, PERSON, empty id) must raise.
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
  - Task 4 logs `gong_rows_joined` (accounts with a same-week Gong row) and `gong_competitor_accounts`. If Gong exists but `gong_rows_joined = 0` for the run week, log a warning: the bias silently missed. Task 8 checks that every live week has `gong_rows_joined > 0`.
  - A `Competitor` token (pipe-delimited) raises the competitor probability from 20% to 70% on rows with score ≥50.
  - **Top-row override:** on the IS_TOP_TOPIC row, a Competitor flag also lifts the score ≥50 gate, so p = 0.70 applies at any score.
    - Why: top rows rest at `min(55, 12×aff)` and mostly score below 50. With the gate kept, only 15.3% of top rows got a competitor on the reference sample (791 live anchors × 10 weeks) even when every week was flagged; with the override it is 69.6% flagged vs 4.2% unflagged. The plan's L2 (≥3 of 6 flagged top rows) and L3 (≥55% of top rows in Competitor weeks) gates were unreachable.
    - Non-top rows keep the gate. Recorded in plan §4a and in the rowspec.
  - The gate draw is unconditional, so the flag changes only RESEARCHING_COMPETITOR, SIGNAL_SOURCE (forced to G2) and INTENT_NOTE.
  - Gong's live coverage is all accounts × weeks (36,948 rows for 2026-11-02, one per account).
  - **Schedule: `USING CRON 15 3 * * 1 America/New_York`** (Monday 03:15 ET). Every live Cumulus TASK uses America/New_York 03:xx slots (SHOW TASKS, 2026-11-02): Gong 03:00 (ran 50 s on 2026-11-02), Graph 03:05, WEEKLY_BALANCE_REPORT 03:10, TASK_LOAD_MASTER_ACCOUNTS 03:25 daily. A UTC cron is wrong: `30 5 * * 1 UTC` is 00:30 ET in winter, ~2.5 h *before* Gong writes the week, so every scheduled run would miss the Gong bias and differ from a later backfill of the same week.
- **Household exclusion uses `COALESCE`.** `NULL <> 'Household'` is NULL in SQL and would drop the ~711 NULL-category anchors. Don't "simplify" it.
- **`record_id_for` is NOT exported from `cumulus_common/__init__.py`**, which exports only `seed_for` and `assert_coverage`. Task 4 must `from cumulus_common.record_id import record_id_for` (don't edit Cumulus_Common from this chain). `scripts/deploy_sp.py` must inline `cumulus_common/record_id.py` alongside `seed.py` / `coverage.py`. `RECORD_ID` is `NOT NULL` with **no default** in both tables (the `LIKE`-copied `_STAGING` included), so every staged and inserted row must carry it or the INSERT fails.
- **Write path (Task 4):**
  - Per-week **DELETE + INSERT in one transaction**. Snowflake MERGE has no `NOT MATCHED BY SOURCE`, and topics that fall below threshold must disappear for that week.
  - `SURGE_FLAG::BOOLEAN` / `IS_TOP_TOPIC::BOOLEAN`.
  - `TO_TIMESTAMP_NTZ(GENERATED_AT::NUMBER / 1000000000)`.
  - `TO_DATE(TO_TIMESTAMP_NTZ(col::NUMBER / 1e9))` for PROFILE_WEEK / LAST_SIGNAL_DATE when staging is auto-created by `write_pandas`.
  - Stamp `ORG_ID` (`anchor.ORG_ID or 'JDO'`) and `RECORD_ID = record_id_for(ORG_ID, ACCOUNT_ID, PROFILE_WEEK, INTENT_TOPIC)` on every inserted row. The row factory emits only the 17 data columns.
  - Note: `write_pandas(auto_create_table=True, overwrite=True)` recreates `_STAGING` from DataFrame dtypes, dropping the DDL'd column types. Either keep that path with the casts, or TRUNCATE and `write_pandas(auto_create_table=False)` into the typed staging table.
- **SP signature:** `SP_GENERATE_DEMANDBASE_INTENT_SIGNALS(BACKFILL_WEEKS INTEGER DEFAULT 0)`. `0` runs the current week only (the TASK path). `N` runs weeks W-N … W in ascending order. One SP, no inter-SP imports. DROP the procedure before redeploying if the signature changes.
- **Cost:** ~10 + 13×rows `_score_for` calls per anchor-week. Time the 26-week backfill in L2; memoize `_score_for` per (account, topic, week) inside the backfill loop if it's slow.
- **No bare `&` anywhere in SQL or in the inlined SP body** (snow sql template trap). The topic is `International Payments and FX`, and an L1 test asserts no `&` in any vocabulary string.
- **Deploy connection (2026-11-02).** The default snow CLI connection (`GSB13421_jwt`, account `eob55465`) returns `404 Not Found` on login. The `snowflake` MCP (`SFDC_DC_TECH_ARCH_jwt`, account SSC18700, SYSADMIN) can read `DATA_JEDAIS.FINS__PUBLIC` but gets `Insufficient privileges … CREATE TABLE on SCHEMA DATA_JEDAIS.FINS__PUBLIC`. The DDL is therefore committed but not yet applied live.
  - **Siblings are owned by ACCOUNTADMIN, not SYSADMIN.** `TABLE_OWNER = ACCOUNTADMIN` for `GONG_CALL_SENTIMENT` and `PLAID_HELD_AWAY` (verified 2026-11-02). ACCOUNTADMIN is in the MCP user's available roles.
  - Apply the DDL (and later the SP / TASK) as ACCOUNTADMIN on SSC18700, e.g. `snow sql -f schemas/demandbase_intent_signals.sql --role ACCOUNTADMIN` on a working default connection.
  - Then verify `COUNT(*) = 0` and `DESCRIBE TABLE` on both tables: 19 columns, 2 BOOLEAN, 2 NULLable, 4-column PK.
  - The namespace is settled: every sibling lives in `DATA_JEDAIS.FINS__PUBLIC`, and the plan's `FINS.PUBLIC.*` is stale text.
- DC mapping descriptions must be ≤521 chars (Plan 6 finding).

## DC mapping (Task 7) — status: DC mapping pending UI

Single-column PK `recordId__c` (Plan 4 rule). Booleans are declared **Boolean** in the stream schema. Both DATE columns use `format: "MM/dd/yyyy"`.

| Snowflake | DC field | Type |
|---|---|---|
| RECORD_ID | recordId__c | Text (PK) |
| ORG_ID | orgId__c | Text |
| ACCOUNT_ID | ssot__AccountId__c | Text (KQ → `ssot__Account__dlm`) |
| PROFILE_WEEK | profileWeek__c | Date (MM/dd/yyyy) |
| INTENT_TOPIC | intentTopic__c | Text |
| TOPIC_CATEGORY | topicCategory__c | Text |
| IS_TOP_TOPIC | isTopTopic__c | Boolean |
| INTENT_SCORE | intentScore__c | Number |
| SURGE_FLAG | surgeFlag__c | Boolean |
| WEEKS_SURGING | weeksSurging__c | Number |
| SCORE_DELTA_WOW | scoreDeltaWow__c | Number |
| JOURNEY_STAGE | journeyStage__c | Text |
| UNIQUE_RESEARCHERS | uniqueResearchers__c | Number |
| RESEARCHING_COMPETITOR | researchingCompetitor__c | Text (NULLable) |
| KEYWORD_SAMPLE | keywordSample__c | Text |
| SIGNAL_SOURCE | signalSource__c | Text |
| LAST_SIGNAL_DATE | lastSignalDate__c | Date (MM/dd/yyyy) |
| INTENT_NOTE | intentNote__c | Text (NULLable) |
| GENERATED_AT | generatedAt__c | DateTime |
