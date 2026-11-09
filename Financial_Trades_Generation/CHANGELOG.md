# Changelog

All notable changes to **Financial_Trades_Generation**: the Snowflake procedures, tasks and migrations that generate synthetic trades into `DATA_JEDAIS.FINS__PUBLIC.FINANCIAL_TRADES`. Data Cloud reads that table zero copy as `BT_Financial_Trades__dlm`, and the React-Headless cockpits read from there.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Entries are grouped by date, because the project ships as live data and migrations rather than as a released library. Newest entries appear first. The full migration list, with rollbacks, is in the [README](README.md#migrations).

<div align="center">

[![Snowflake](https://img.shields.io/badge/Snowflake-FINS__PUBLIC-29B5E8?style=for-the-badge&logo=snowflake&logoColor=white)](README.md)
[![Updated](https://img.shields.io/badge/Updated-Nov_09_2026-2EA44F?style=for-the-badge)](https://github.com/josers18/JDO/commits/main)
[![Monorepo CHANGELOG](https://img.shields.io/badge/Monorepo-CHANGELOG-181717?style=for-the-badge&logo=github&logoColor=white)](../CHANGELOG.md)

</div>

---

## [November 2026]

### 2026-11-09 — Gap backfills and TRD cleanup (migrations 008–011)

All four ran as ACCOUNTADMIN outside the 03:00–03:10 ET task window, and every check passed. Each backfill copies `generate_trade()` verbatim, uses a seeded rng, and is guarded by a marker `CREATED_AT` (that day at 12:00:00) so it can't run twice.

#### Removed

- **Migration 009** deleted the 35,116 NULL-`ACCOUNT_ID` trades of the five old `TRD-` placeholders, including their retry duplicates on 10 Mondays. `FINANCIAL_TRADES` went from 6,642,761 to 6,607,645 rows. No cockpit query, segment or calculated insight read them. The deleted rows were backed up in `FINANCIAL_TRADES_TRD_BAK_20261109`, which was dropped later that day once the checks passed, so 009 can no longer be rolled back.

#### Added

- **Migration 008:** 133,242 trades on 2026-09-28, the Monday cut to 1 trade per account by two manual DELETEs on 09-30. That day went from 32,317 to 165,559 rows.
- **Migration 010:** 2,505 trades on 2026-10-12 for the 501 WEEKLY accounts stranded by that day's timeouts. 10-12 now has 180,552 rows across 35,814 accounts.
- **Migration 011:** 3,055 trades each on 2026-06-29 and 2026-07-01 (6,110 in all) for the 315 DAILY accounts, covering the two days with no generator run.
- **Backfill statistics match real trades.** The daily backfill averages $98,561 per trade against $98,980 for real ones; the October backfill averages $61,736 against $61,598. Buy and Confirmed shares are within about 2 points.

#### Verified

- **Data Cloud** saw the changes at once, since it reads zero copy: 6,616,260 rows and 0 NULL accounts.
- **ReactWealth trading pulse**, after React-Headless PR #166 switched it to calendar weeks: the 10-12 week matches Data Cloud exactly for the default book (10,756 Confirmed USD trades).
- **Not visible in the cockpits:**
  - 06-29 and 07-01 fall outside the pulse's 9-week window.
  - Customer 360 lists each account's 10 latest trades, so none of the backfilled dates show there.

### 2026-11-04 — Config and dedupe hardening (migrations 003–007, PR #153)

#### Changed

- **Migration 003** backfilled `ACCOUNT_NAME` and `ACCOUNT_TYPE` on 31,053 configs. This moved the 5,628 `Partner` rows to Institutional.
- **Migration 004** moved 25,379 `Person` configs from the WEEKLY/5/$150K default to MONTHLY/3/Conservative/$50K.
- **Migration 005** deactivated the 529 accounts from the four non-`Salesforce_Home` orgs. Their trades were kept.
- **Migration 006** has the tasks call their procedures directly, with a 3,000 s generator statement timeout, so the retry layers fit inside the task timeout.

#### Removed

- **Migration 007** deleted 4,195,785 duplicate trades written by retried runs on 12 Mondays (2026-06-15 to 2026-11-02). `FINANCIAL_TRADES` went from 10,619,762 to 6,423,977 rows.
