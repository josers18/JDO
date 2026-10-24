# Moody's Market Context — Cumulus Synthetic Dataset (Credit Ratings + Market Signals)

Synthetic Moody's Investors Service / Moody's Analytics-style credit-rating + market-context dataset per publicly traded instrument for Cumulus's instrument footprint. Mirrors
[Snowflake_WorldCheck_AML](../Snowflake_WorldCheck_AML) (daily cadence) and the Cumulus umbrella spec at
[../docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md](../docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md).

**Plan 13 is the FINAL Cumulus plan in the rollout (13 of 13).** It is **instrument-scoped (not account-scoped)** with **daily cadence** — the second non-account-scoped plan after Plan 4 (Esri / branch-scoped) and the second daily-cadence plan after Plan 7 (WorldCheck AML). With four structural deviations from the Plan 8 baseline (instrument-scoped audience, daily cadence, two-salt model, hybrid year-stable + daily field model), it is the most-divergent instantiation of the dataset template.

Each instrument in `DATA_JEDAIS.FINS__PUBLIC.INSTRUMENT_UNIVERSE` produces one market-context row per day. Rows are keyed by composite PK `(TICKER, PROFILE_DATE)` (~2,004 rows/day at 1:1 instrument:row). Re-runs same calendar day MERGE-replace in place — no daily history retained, so live storage stays at ~2,004 rows year-round. The DMO is **not** joinable to `ssot__Account__dlm` (instrument-scoped, like Plan 4 was branch-scoped); `TICKER` is the canonical join key for downstream queries, and account ↔ instrument joins go through the existing trades-pipeline `(account, ticker, position)` graph. DC PK collapses to single-column `profileDate__c` with `ticker__c` as a KQ qualifier (single-column-PK rule from Plan 4).

## Plan
- Plan 13 (the final plan), instantiated from `../docs/superpowers/plans/2026-05-28-cumulus-plan-N-dataset-template.md` (v1.5)
- Per-plan file: `../docs/superpowers/plans/2026-05-28-cumulus-plan-13-moodys-market-context.md`
- Rowspec: `../docs/superpowers/plans/attachments/cumulus-plan-13-moodys-market-context-rowspec.md`
- Depends on: [Snowflake_Cumulus_Common](../Snowflake_Cumulus_Common) (Plan 0)

## Snowflake objects
- Table: `DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT`
- Stored procedure: `DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_MOODYS_MARKET_CONTEXT()`
- Task: `DATA_JEDAIS.FINS__PUBLIC.TASK_DAILY_MOODYS_MARKET_CONTEXT` (DAILY, `15 3 * * * America/New_York`, warehouse `MAIN_WH_XS`, wrapper `SP_RETRY_WRAPPER` retries=2)
- Egress: DC "Snowflake (Federate / Zero Copy)" connector → DLO `CumulusMoodysMarketContext__dll` → DMO `CumulusMoodysMarketContext__dlm`

## Audience
**Instrument-scoped, all-rows** — every instrument in `DATA_JEDAIS.FINS__PUBLIC.INSTRUMENT_UNIVERSE` is profiled daily. The audience SQL is the simplest in the Cumulus rollout:

```sql
SELECT * FROM DATA_JEDAIS.FINS__PUBLIC.INSTRUMENT_UNIVERSE
```

Live cardinality (probed 2026-05-28): **2,004 distinct instruments**. Each instrument emits exactly one market-context row per day → **~2,004 rows/day**.

**Spec drift caught at draft time.** The umbrella spec §3.3 documents the audience as `WHERE IS_ACTIVE = TRUE` keyed by `INSTRUMENT_ID`. The actual `INSTRUMENT_UNIVERSE` schema (live-discovered) is `(TICKER VARCHAR(10) PK, INSTRUMENT_NAME VARCHAR(200), SECTOR VARCHAR(50), BASE_PRICE FLOAT)` — there is no `INSTRUMENT_ID` and no `IS_ACTIVE`. Plan 13 keys on `TICKER` and reads the full table unconditionally. No spec amendment needed since this is the only consumer.

**Storage** — re-runs MERGE-replace in place (composite PK `(TICKER, PROFILE_DATE)`, but `PROFILE_DATE` is bucketed to today's date, so re-runs same day overwrite the existing row). No daily history retention — live storage stays at ~2,004 rows.

## Salt strategy — two salts (back to Plan 5 shape)
- `moodys` (daily-bucketed via `_daily_seed(ticker, run_ts)` wrapper inlined per Plan 7) — drives daily-bucketed fields: `DAILY_VOLATILITY_PCT`, `THIRTY_DAY_PRICE_CHANGE_PCT`, `MARKET_CAP_USD` daily noise component.
- `moodys_year` (year-bucketed via `datetime(run_ts.year, 1, 1)`) — drives year-stable editorial / structural fields: `CREDIT_RATING`, `RATING_OUTLOOK`, `OUTLOOK_LAST_CHANGED_DATE`, `FIFTY_TWO_WEEK_HIGH_PRICE`, `FIFTY_TWO_WEEK_LOW_PRICE`, `RATING_AGENCY_FLAG_COUNT`, `LIQUIDITY_TIER`, and the year-stable shares-outstanding base for `MARKET_CAP_USD`.

After Plan 8's single-salt simplification, Plan 13 returns to the two-salt pattern from Plan 5. The hybrid year-stable + daily-bucketed field model mirrors Plan 7 (year-stable RISK_JURISDICTION + daily component flags).

## Snowflake identifier rename — digit-leading column names
Snowflake identifiers cannot begin with a digit, so the rowspec's market-data fields are renamed at the column-name level: `52_WEEK_HIGH_PRICE` → `FIFTY_TWO_WEEK_HIGH_PRICE`, `52_WEEK_LOW_PRICE` → `FIFTY_TWO_WEEK_LOW_PRICE`, `30_DAY_PRICE_CHANGE_PCT` → `THIRTY_DAY_PRICE_CHANGE_PCT`. The DC field-mapping in T7 maps these to `fiftyTwoWeekHighPrice__c`, `fiftyTwoWeekLowPrice__c`, `thirtyDayPriceChangePct__c` accordingly.

## Outlook moves (2026-10-24)
The year-stable baseline outlook never moved inside a calendar year and its `OUTLOOK_LAST_CHANGED_DATE` always fell in
the prior year, so the Commercial cockpit's C2 "outlook changed in the last 90 days" view never fired.
`_apply_outlook_moves` now layers **episodes** on accounts whose baseline is Stable and whose id carries the local
Account key prefix (`001am`):

- Stable -> Negative (65%) or Watch (35%); 30% of Negative starts escalate to Watch 14-45 days later; every episode
  returns to Stable before its slot ends.
- Episodes sit on fixed 180-day slots in absolute time (per-account phase offset, 10% chance per slot, start in the
  first 120 days, no slots before 2025-09-01).
- **Small-book boost:** almost every business account sits in two advisor books (Allen Carter ~5.6k, Jose Sifontes
  ~5.1k), leaving ~100 accounts across ~17 other owners. Accounts whose owner has fewer than 500 business accounts in
  the audience (`_MOVE_SMALL_BOOK_MAX`) use a 50% per-slot rate so those books still see moves. Book sizes come from
  `OWNER_BOOK_SQL` (`ssot__OwnerId__c` on the inbound `FINSDC3_DATASHARE` Account share, same dedup as
  `V_ACCOUNT_ANCHORS`); if that lookup fails the SP uses the base rate for everyone. Base-rate episodes are a subset
  of boosted ones (same seed stream), so an owner change only adds or removes episodes. Salt `moodys_moves` with a fixed seed anchor, so the outlook on any
  `PROFILE_DATE` is a pure function of (account, date): daily runs, `NUM_DAYS` backfills and re-runs agree, and every
  future run keeps producing fresh moves relative to its own date.
- `OUTLOOK_LAST_CHANGED_DATE` = the latest episode event on/before `PROFILE_DATE` (never earlier than the baseline
  date). Every change is dated on the day it happens; the date never moves while the outlook stays put.
- Live 2026-10-24 (latest snapshot, changed in the last 90 days): Allen 89 Negative + 73 Watch (233 back to Stable),
  Jose 77 Negative + 76 Watch (209 back to Stable), other books 9 Negative + 5 Watch (16 back to Stable). About 3 in 4
  accounts are Stable on any day.
- **History:** the generator only writes the day it runs (or `NUM_DAYS` back). Snapshots written before the moves
  shipped (2026-03-01..2026-10-23) still carry the baseline outlook until they are rewritten with the same logic.

Tests: `tests/test_moodys_outlook_moves.py`.

## Tests
```bash
cd Snowflake_Moodys_MarketContext
pip install -e ".[dev]"
pip install -e ../Snowflake_Cumulus_Common
pytest tests/ -v
```

## Deploy
```bash
snow sql -f schemas/moodys_market_context.sql
snow sql -f procedures/sp_create_procedure.sql
snow sql -f tasks/task_daily_moodys_market_context.sql
```

DC ingest is configured via the existing federation connector (see Plan 13 Task 7 + the recipe at `../Snowflake_Claritas_Demographics/docs/dc-setup-recipe.md`).
