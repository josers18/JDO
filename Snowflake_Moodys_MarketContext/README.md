# Moody's Market Context — Cumulus Synthetic Dataset (Credit Ratings + Market Signals)

Synthetic Moody's Investors Service / Moody's Analytics-style credit-rating + market-context dataset, one row per Cumulus **business account** per day. Mirrors
[Snowflake_WorldCheck_AML](../Snowflake_WorldCheck_AML) (daily cadence) and the Cumulus umbrella spec at
[../docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md](../docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md).

**Plan 13 is the FINAL Cumulus plan in the rollout (13 of 13).** It is **business-account-scoped** with **daily cadence**, the second daily-cadence plan after Plan 7 (WorldCheck AML). Its structural deviations from the Plan 8 baseline are the daily cadence, the two-salt model and the hybrid year-stable + daily field model.

Each business account in `V_ACCOUNT_ANCHORS` (`ACCOUNT_TYPE_FLAG = 'BUSINESS'`, 11,529 on 2026-11-09) gets one row per `PROFILE_DATE`. The table PK is `RECORD_ID` (a UUID row id); the MERGE keeps rows unique on `(ORG_ID, ACCOUNT_ID, PROFILE_DATE)`, so a same-day re-run replaces that day in place while each new day adds rows. History accumulates: 2,809,350 rows over 246 days (2026-03-01 to 2026-11-09). `ACCOUNT_ID` joins `ssot__Account__dlm.ssot__Id__c`, and the DMO carries that relationship.

> **History.** Plan 13 shipped first as an instrument-scoped table (one row per `INSTRUMENT_UNIVERSE` ticker, 2,004 rows/day, keyed `(TICKER, PROFILE_DATE)`, not joinable to Account). The v2 schema re-scoped it to business accounts; nothing instrument-based is live.

## Plan
- Plan 13 (the final plan), instantiated from `../docs/superpowers/plans/2026-05-28-cumulus-plan-N-dataset-template.md` (v1.5)
- Per-plan file: `../docs/superpowers/plans/2026-05-28-cumulus-plan-13-moodys-market-context.md`
- Rowspec: `../docs/superpowers/plans/attachments/cumulus-plan-13-moodys-market-context-rowspec.md`
- Depends on: [Snowflake_Cumulus_Common](../Snowflake_Cumulus_Common) (Plan 0)

## Snowflake objects
- Table: `DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT`
- Stored procedure: `DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_MOODYS_MARKET_CONTEXT(NUM_DAYS INT DEFAULT 1)` (`CALL …(N)` backfills the last N days for every current business account)
- Task: `DATA_JEDAIS.FINS__PUBLIC.TASK_DAILY_MOODYS_MARKET_CONTEXT` (DAILY, `15 3 * * * America/New_York`, warehouse `MAIN_WH_XS`, wrapper `SP_RETRY_WRAPPER` retries=2)
- Egress: DC "Snowflake (Federate / Zero Copy)" connector → DMO `BT_Moodys_Market_Context__dlm` (PK `record_id__c`; `account_id__c` → `ssot__Account__dlm`, N:1)

## Audience
**Business accounts** — every BUSINESS anchor is profiled daily:

```sql
SELECT DISTINCT * FROM DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS
WHERE ACCOUNT_TYPE_FLAG = 'BUSINESS'
```

Live cardinality (2026-11-09): **11,529 business accounts**, so ~11.5K rows/day at 1:1. The row factory reads `INDUSTRY` (rating bias), `ANNUAL_REVENUE` (valuation base) and `EMPLOYEE_COUNT` (passthrough). Coverage asserts `COUNT(DISTINCT ACCOUNT_ID)` in the table matches the audience.

**Derived fields.**
- `CREDIT_RATING` is a year-stable draw from a per-industry distribution, picked by case-insensitive substring match on `INDUSTRY` (Baa-cluster default).
- `MARKET_CAP_USD` = annual revenue × a year-stable 3–7× multiple × (1 + 30-day change), clamped to $5M–$500B.
- The 52-week high/low band and `LIQUIDITY_TIER` (Tier 1 ≥ $50B, Tier 2 ≥ $5B, Tier 3 ≥ $500M, else Illiquid) come from the year-stable base without daily drift.

## Salt strategy — two salts (back to Plan 5 shape)
- `moodys` (daily-bucketed via `_daily_seed(account_id, run_ts)` wrapper inlined per Plan 7) — drives daily-bucketed fields: `DAILY_VOLATILITY_PCT`, `THIRTY_DAY_PRICE_CHANGE_PCT`, `MARKET_CAP_USD` daily noise component.
- `moodys_year` (year-bucketed via `datetime(run_ts.year, 1, 1)`) — drives year-stable editorial / structural fields: `CREDIT_RATING`, `RATING_OUTLOOK`, `OUTLOOK_LAST_CHANGED_DATE`, `FIFTY_TWO_WEEK_HIGH_USD`, `FIFTY_TWO_WEEK_LOW_USD`, `RATING_AGENCY_FLAG_COUNT`, and the year-stable revenue multiple behind `MARKET_CAP_USD` and `LIQUIDITY_TIER`.

After Plan 8's single-salt simplification, Plan 13 returns to the two-salt pattern from Plan 5. The hybrid year-stable + daily-bucketed field model mirrors Plan 7 (year-stable RISK_JURISDICTION + daily component flags).

## Snowflake identifier rename — digit-leading column names
Snowflake identifiers cannot begin with a digit, so the rowspec's `52_WEEK_HIGH_PRICE`, `52_WEEK_LOW_PRICE` and `30_DAY_PRICE_CHANGE_PCT` live as `FIFTY_TWO_WEEK_HIGH_USD`, `FIFTY_TWO_WEEK_LOW_USD` and `THIRTY_DAY_PRICE_CHANGE_PCT`. The `_USD` suffix came with the account re-scope, because the band is an implied market-cap valuation, not a share price. The DMO fields are `fifty_two_week_high_usd__c`, `fifty_two_week_low_usd__c` and `thirty_day_price_change_pct__c`.

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

L2 integration test (live Snowflake, cleans up after itself; every result column must be TRUE):
```bash
snow sql -c SFDC_DC_TECH_ARCH_jwt --role ACCOUNTADMIN -f tests/integration/test_moodys_market_context_sp.sql
```

## Deploy
```bash
snow sql -c SFDC_DC_TECH_ARCH_jwt --role ACCOUNTADMIN -f schemas/moodys_market_context.sql
python3 scripts/deploy_sp.py   # regenerate procedures/sp_create_procedure.sql and create the SP as ACCOUNTADMIN
snow sql -c SFDC_DC_TECH_ARCH_jwt --role ACCOUNTADMIN -f tasks/task_daily_moodys_market_context.sql
```

Deploy as ACCOUNTADMIN, because the SP is `EXECUTE AS OWNER` and its `write_pandas` staging table needs CREATE TABLE. `scripts/deploy_sp.py` passes `--role ACCOUNTADMIN` by default (`--role` overrides it; `--no-deploy` only regenerates the SQL). `schemas/moodys_market_context.sql` is the current multi-org DDL; `_v2.sql` is the pre-ORG_ID re-scope version.

DC ingest is configured via the existing federation connector (see Plan 13 Task 7 + the recipe at `../Snowflake_Claritas_Demographics/docs/dc-setup-recipe.md`).
