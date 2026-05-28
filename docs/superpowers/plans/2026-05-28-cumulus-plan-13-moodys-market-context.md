# Cumulus Plan 13 — Moody's Market Context Implementation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Stand up the thirteenth and **final** per-dataset Cumulus pipeline — Moody's-style credit-rating + market-context records per publicly traded instrument. **Instrument-scoped, not account-scoped** (second non-account-scoped Cumulus plan after Plan 4 / Esri branch-scoped). **Daily cadence** (second daily-cadence plan after Plan 7 / WorldCheck). SP emits one row per instrument per market-context day into `FINS.PUBLIC.MOODYS_MARKET_CONTEXT` (~2,004 rows, MERGE-replaces in place), federated as `CumulusMoodysMarketContext__dlm`.

**Architecture:** Instantiates the dataset template (v1.5) with **four structural deviations** from Plan 8 — the most-divergent instantiation in the rollout:

1. **Instrument-scoped, not account-scoped.** No V_ACCOUNT_ANCHORS read; reads `INSTRUMENT_UNIVERSE` directly. PK is `(TICKER, PROFILE_DATE)` not `(ACCOUNT_ID, PROFILE_MONTH)`. No `_anchor_in_audience` predicate.
2. **Daily cadence** (second daily-cadence plan after Plan 7). Reuses Plan 7's `_daily_seed` wrapper inlined into the SP module to fold day-of-month into the seed.
3. **Two salts** (`moodys` daily + `moodys_year` year-stable) — back to Plan 5's two-salt shape after Plan 8's single-salt simplification.
4. **Hybrid year-stable + daily model** like Plan 7 — CREDIT_RATING and outlook fields are year-stable; DAILY_VOLATILITY_PCT and THIRTY_DAY_PRICE_CHANGE_PCT are daily-bucketed. Different from Plan 8's all-monthly cadence.

**Depends on:** Plan 0 only. Independent of Plans 1-12 — no shared Snowflake objects beyond the Foundation tables.

---

## §1 Placeholder values

| Placeholder | Value |
|---|---|
| `<<PLAN_N>>` | `13` |
| `<<DATASET_SLUG>>` | `moodys-market-context` |
| `<<DATASET_SLUG_UNDERSCORE>>` | `moodys_market_context` |
| `<<MIMICS_VENDOR>>` | `Moody's` |
| `<<DATASET_TABLE>>` | `MOODYS_MARKET_CONTEXT` |
| `<<DATASET_TABLE_LOWER>>` | `moodys_market_context` |
| `<<REPO_DIR>>` | `Snowflake_Moodys_MarketContext` |
| `<<DC_DMO>>` | `CumulusMoodysMarketContext__dlm` |
| `<<DATASET_SALT>>` | `moodys` (daily) + `moodys_year` (year-stable) — two salts |
| `<<CADENCE>>` | `DAILY` |
| `<<TASK_NAME>>` | `TASK_DAILY_MOODYS_MARKET_CONTEXT` |
| `<<TASK_NAME_LOWER>>` | `task_daily_moodys_market_context` |
| `<<SP_NAME>>` | `SP_GENERATE_MOODYS_MARKET_CONTEXT` |
| `<<CRON>>` | `'USING CRON 0 1 * * * UTC'` (01:00 UTC daily — pre-open in Asia) |
| `<<AUDIENCE_PREDICATE>>` | **N/A — instrument-scoped; see §2 below** |
| `<<COVERAGE_RULE>>` | rows = `COUNT(DISTINCT TICKER)` from INSTRUMENT_UNIVERSE |
| `<<ROW_PK>>` | `(TICKER, PROFILE_DATE)` — **not ACCOUNT_ID** |
| `<<COLUMN_LIST>>` | See rowspec — 13 columns including 1 NULLable, 0 BOOLEAN |

## §2 Audience-predicate probe — instrument-scoped (key deviation)

**Plan 13 does not read V_ACCOUNT_ANCHORS.** The audience is the full `INSTRUMENT_UNIVERSE` table populated by the existing trades pipeline:

```sql
-- AUDIENCE_SQL (the SP reads this)
SELECT * FROM FINS.PUBLIC.INSTRUMENT_UNIVERSE

-- COVERAGE_SQL
SELECT COUNT(DISTINCT TICKER) FROM FINS.PUBLIC.INSTRUMENT_UNIVERSE

-- ACTUAL_SQL
SELECT COUNT(DISTINCT TICKER) FROM FINS.PUBLIC.MOODYS_MARKET_CONTEXT
```

**Live cardinality (probed 2026-05-28):** **2,004 instruments**. Every row is in audience — there is no IS_ACTIVE filter.

**Spec drift caught at draft time.** The umbrella spec §3.3 and the manifest §3.3 both describe the audience as `WHERE IS_ACTIVE = TRUE` keyed by `INSTRUMENT_ID`. The actual `INSTRUMENT_UNIVERSE` schema (live-discovered) is:

| Column | Type | Null? | Notes |
|---|---|---|---|
| `TICKER` | VARCHAR(10) | NOT NULL | **Primary key** |
| `INSTRUMENT_NAME` | VARCHAR(200) | NULL | Display name |
| `SECTOR` | VARCHAR(50) | NULL | Used as bias signal for CREDIT_RATING distribution |
| `BASE_PRICE` | FLOAT | NULL | Used as bias signal for FIFTY_TWO_WEEK_HIGH/LOW + MARKET_CAP_USD |

There is no `INSTRUMENT_ID` and no `IS_ACTIVE`. Plan 13 keys on `TICKER` and reads the full table unconditionally — same shape of fix as Plan 8's `run_ts.date()` vs `month_start.date()` rowspec drift, noted at draft time. **No fix needed in the umbrella spec since this is the only consumer**; the spec text is wrong about column names but the structural intent (instrument-scoped, full-table audience) is correct.

The L2 fixture in `tests/integration/test_moodys_market_context_sp.sql` materializes a small `INSTRUMENT_UNIVERSE_FIXTURE` with ~10 distinct tickers across the 7 SECTOR values used by `_SECTOR_RATING_BIAS`.

## §3 Rowspec attachment

`docs/superpowers/plans/attachments/cumulus-plan-13-moodys-market-context-rowspec.md`

Contains: 13-column DDL (12 NOT NULL + 1 NULLable OUTLOOK_LAST_CHANGED_DATE), PK `(TICKER, PROFILE_DATE)`, two-salt strategy (`moodys` daily + `moodys_year` year-stable), `_daily_seed` wrapper reused from Plan 7, SECTOR → CREDIT_RATING bias map (7 sectors + default), hybrid year-stable + daily field model, per-field synthesis Python skeletons, `_row_for(instrument, run_ts)` skeleton (instrument record input, not anchor dict), L1 test targets (range / vocabulary / year-stable / cross-field / schema).

## §4 What changes from the v1.5 template (Plan 8 baseline)

1. **Task 1 (scaffold).** AGENTS.md gotchas:
   - **Instrument-scoped, not account-scoped.** Row factory takes an instrument record `(TICKER, INSTRUMENT_NAME, SECTOR, BASE_PRICE)`, not an account anchor. **Don't read BIRTHDATE / ANNUAL_INCOME / CLIENT_CATEGORY** — none of those exist on instrument records.
   - **No `_anchor_in_audience` predicate.** Every instrument is in audience; the input-shape check is "TICKER is non-empty".
   - **Daily cadence.** `PROFILE_DATE` not `PROFILE_MONTH`. Seed bucket is day-start via `_daily_seed` wrapper inlined from Plan 7 (bound to salt `"moodys"`).
   - **Two salts.** `moodys` for daily-bucketed fields (volatility, 30d-change, market-cap daily noise). `moodys_year` for year-stable fields (rating, outlook, 52W band, flags, liquidity tier, market-cap shares-outstanding base).
   - **Hybrid year-stable + daily model** like Plan 7 — editorial signals year-stable; market signals daily-bucketed; MARKET_CAP_USD hybrid (year-stable shares × daily price drift).
   - **0 BOOLEAN, 1 NULLable** (OUTLOOK_LAST_CHANGED_DATE) — simplest NULL/Boolean footprint of any Cumulus dataset. DC Boolean-declaration ceremony not needed.
   - DC mapping descriptions ≤521 chars (Plan 6 finding).

2. **Task 2 (table DDL).** PK `(TICKER, PROFILE_DATE)`. 12 NOT NULL + 1 NULLable. **No `ACCOUNT_ID` column** in DDL or output dict. Schema lives at `Snowflake_Moodys_MarketContext/sql/create_moodys_market_context.sql`.

3. **Task 3 (L1 tests).** **Per-plan conftest reads `INSTRUMENT_UNIVERSE` schema, not V_ACCOUNT_ANCHORS / SAMPLE_ANCHORS.** Synthetic 10-instrument fixture inside the conftest covering 7 SECTOR values + 2 edge cases (very-low BASE_PRICE; None SECTOR). Property #4 has FIVE classes:
   - **Range** (per-row): DAILY_VOLATILITY_PCT in [0,25]; THIRTY_DAY_PRICE_CHANGE_PCT in [-25,25]; MARKET_CAP_USD>0; RATING_AGENCY_FLAG_COUNT in [0,3].
   - **Vocabulary** (per-row): CREDIT_RATING in 23-value set; RATING_OUTLOOK in 5-value set; LIQUIDITY_TIER in 4-value set.
   - **Year-stable** (cross-day, same year): same TICKER on day D and D+30 → CREDIT_RATING, RATING_OUTLOOK, FIFTY_TWO_WEEK_HIGH/LOW, RATING_AGENCY_FLAG_COUNT, LIQUIDITY_TIER identical. **Load-bearing test for the daily + year-stable hybrid.**
   - **Cross-field** (per-row): HIGH≥LOW; HIGH≥BASE_PRICE*0.5; LAST_DATA_REFRESH_AT.date()==PROFILE_DATE.
   - **Schema contract**: output dict keys match the 13 DDL columns.

4. **Task 4 (SP).** Implement `_row_for(instrument, run_ts)` per the rowspec. Three structural points:
   - **Daily-bucketed seed** for daily fields: `_daily_seed(ticker + "_vol", run_ts)` etc.
   - **Year-stable seeds** for editorial fields: `seed_for(ticker + "_rating", "moodys_year", datetime(run_ts.year, 1, 1))`.
   - The MERGE handles 1 NULLable column (`OUTLOOK_LAST_CHANGED_DATE`) and no BOOLEAN casts. PK on `(TICKER, PROFILE_DATE)`. Source SELECT cast pattern unchanged from Plan 7 (just renamed columns + dropped Boolean casts). `TO_TIMESTAMP_NTZ(GENERATED_AT::NUMBER / 1000000000)` for the v1.4 datetime fix.

5. **Task 5 (L2).** 10-instrument `INSTRUMENT_UNIVERSE_FIXTURE` covering all 7 SECTOR values. Assertions: `COUNT(DISTINCT TICKER)=10`, all 13 columns populated, ≥6 rows RATING_OUTLOOK='Stable' (78% target with binomial variance), idempotent re-run ROWS_INSERTED=0, **day-2 re-run** (run_ts +1 day, same year) has identical year-stable fields (rating, outlook, 52W band) but DAILY_VOLATILITY_PCT may differ.

6. **Task 6 (deploy).** Clone Plan 7's `scripts/deploy_sp.py` (cadence + salt-shape match). Inline two salts (`moodys`, `moodys_year`) and the `_daily_seed` wrapper. "Moody's" apostrophe — verify the deploy script's identifier sanitizer handles `'`; strip in build step if not. Daily cron `0 1 * * * UTC`, warehouse `MAIN_WH_XS`, wrapper `SP_RETRY_WRAPPER('FINS.PUBLIC.SP_GENERATE_MOODYS_MARKET_CONTEXT()', 2)`.

7. **Task 7 (DC stream + DMO).** API path identical to Plans 1-12. Mapping table:

   | Snowflake | DC field | Type |
   |---|---|---|
   | TICKER | ticker__c | Text (PK / KQ) |
   | PROFILE_DATE | profileDate__c | Date (PK; format MM/dd/yyyy) |
   | CREDIT_RATING | creditRating__c | Text |
   | RATING_OUTLOOK | ratingOutlook__c | Text |
   | OUTLOOK_LAST_CHANGED_DATE | outlookLastChangedDate__c | Date (NULLable; format MM/dd/yyyy) |
   | MARKET_CAP_USD | marketCapUsd__c | Number |
   | DAILY_VOLATILITY_PCT | dailyVolatilityPct__c | Number |
   | THIRTY_DAY_PRICE_CHANGE_PCT | thirtyDayPriceChangePct__c | Number |
   | FIFTY_TWO_WEEK_HIGH_PRICE | fiftyTwoWeekHighPrice__c | Number |
   | FIFTY_TWO_WEEK_LOW_PRICE | fiftyTwoWeekLowPrice__c | Number |
   | RATING_AGENCY_FLAG_COUNT | ratingAgencyFlagCount__c | Number |
   | LIQUIDITY_TIER | liquidityTier__c | Text |
   | LAST_DATA_REFRESH_AT | lastDataRefreshAt__c | DateTime |
   | GENERATED_AT | generatedAt__c | DateTime |

   `PROFILE_DATE` and `OUTLOOK_LAST_CHANGED_DATE` (DATE columns) need `format: "MM/dd/yyyy"` per v1.4.1.

   **No `ssot__AccountId__c`** — DMO is not joinable to `ssot__Account__dlm` (instrument-scoped, like Plan 4 was branch-scoped). Use `TICKER` as the canonical join key for downstream queries; joins to account-level data go through the existing trades-pipeline `(account, ticker, position)` graph.

   DC PK collapses to `profileDate__c` + KQ on `ticker__c` (single-column-PK rule from Plan 4).

8. **Task 8 (L3 smoke).** Verify SP run, ~2,004 rows. Spot-check:
   - 5 random rows for plausibility across ratings / outlooks / sectors.
   - **CREDIT_RATING by SECTOR** matches `_SECTOR_RATING_BIAS`: Financials ≥60% in {A1..Baa3}; Utilities ≥70% in {Aa3..Baa1}; Technology spans Aaa to Caa1.
   - RATING_OUTLOOK: ~78% Stable, ~16% Positive+Negative, ~6% Developing+Watch.
   - **Year-stable invariant** spot-check: 5 tickers across day-1 and day-2 (same year) → identical CREDIT_RATING / RATING_OUTLOOK / FIFTY_TWO_WEEK_HIGH/LOW / LIQUIDITY_TIER.
   - **Cross-field**: 0 rows with HIGH<LOW; 0 rows with MARKET_CAP_USD≤0; all rows have LAST_DATA_REFRESH_AT.date()==PROFILE_DATE.
   - LIQUIDITY_TIER: most Tier 2 / Tier 3, few Tier 1, long tail Illiquid.
   - OUTLOOK_LAST_CHANGED_DATE NULL rate ~62% (80% of the ~78% Stable cohort).

## §5 Self-review checklist

- [ ] Audience SQL is `SELECT * FROM FINS.PUBLIC.INSTRUMENT_UNIVERSE` (no WHERE clause); no `_anchor_in_audience`.
- [ ] Row factory reads `instrument["TICKER"]`, `instrument["SECTOR"]`, `instrument["BASE_PRICE"]` — not V_ACCOUNT_ANCHORS columns.
- [ ] PK `(TICKER, PROFILE_DATE)` in DDL and MERGE ON; no `ACCOUNT_ID` column.
- [ ] Two salts: `"moodys"` daily, `"moodys_year"` year-stable. `_daily_seed` wrapper inlined per Plan 7 pattern.
- [ ] 1 NULLable (OUTLOOK_LAST_CHANGED_DATE), 0 BOOLEAN.
- [ ] L1 conftest defines `SAMPLE_INSTRUMENTS`; does not import `SAMPLE_ANCHORS`. Coverage uses `COUNT(DISTINCT TICKER)`.
- [ ] DC field mapping has no `ssot__AccountId__c`. DMO description ≤521 chars.
- [ ] No `<<` placeholders left.

## §6 Out of scope

- Real Moody's Investors Service / Moody's Analytics license / data fidelity.
- Full credit watch event timelines (multi-row history per rating action).
- Multi-rating-agency consensus (S&P + Fitch + Moody's combined view).
- Option-implied volatility surfaces; only realized DAILY_VOLATILITY_PCT.
- Sector-specific signals (CDS spreads, default probabilities, ESG composite scores — Plan 2 covers ESG at issuer level).
- Daily history retention (MERGE-replace; no point-in-time backtesting on this dataset).
- Joins to account-level data through this DMO — accounts ↔ instruments live in the existing trades-pipeline graph, not in `MOODYS_MARKET_CONTEXT`.

## §7 Status

Pending implementation. Plans 1-8 shipping live (8 of 13 Plans LIVE; 171,363 rows total). Plans 9-12 being drafted in parallel.

Plan 13 is the **final** Cumulus plan; **second daily cadence** (after Plan 7 — reuses Plan 7's `_daily_seed` wrapper); **second non-account-scoped plan** (after Plan 4 / Esri branch-scoped — reads `INSTRUMENT_UNIVERSE` directly with no V_ACCOUNT_ANCHORS dependency). With 4 structural deviations from the Plan 8 baseline, it is the most-divergent instantiation of the dataset template.
