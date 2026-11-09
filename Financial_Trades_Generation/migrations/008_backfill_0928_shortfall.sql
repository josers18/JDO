-- =============================================================================
-- Migration 008 (written 2026-11-09, NOT YET APPLIED): backfill the trades
-- missing from Monday 2026-09-28.
--
-- What happened on 09-28: all three DAILY_TRADE_GENERATOR attempts hit the
-- 3,600 s task timeout. Their SP_RETRY_WRAPPER retries committed 169
-- 5,000-row batches (845,000 rows), the same retry pile-up migration 007
-- cleaned up on 12 other Mondays. On 2026-09-30 12:04 PT two manual DELETEs
-- (QUERY_HISTORY, user JOSE, role SYSADMIN) deduped the day:
--   1. kept the 5 newest rows per ACCOUNT_ID (rn <= 5)    -> 683,418 deleted
--   2. kept the 1 newest row per ACCOUNT_ID  (rn = 1)     -> 129,265 deleted
-- 845,000 - 683,418 - 129,265 = 32,317, which is the count today. That leaves
-- 32,313 accounts with 1 trade each instead of TRADES_PER_PERIOD (~5), and an
-- ~83% dip on 09-28 next to the ~185K of the Mondays around it. The deleted
-- rows can't be recovered: Time Travel on FINANCIAL_TRADES is 1 day, and the
-- only clones (2026-10-24, 2026-11-04) were taken after 09-30.
--
-- What this migration writes (new synthetic trades, TRADE_DATE 2026-09-28):
--   TOP_UP    every account with 09-28 trades gets TRADES_PER_PERIOD - (rows it
--             has) more: 31,998 WEEKLY (127,997 trades) + 315 DAILY (2,740).
--   NO_TRADE  WEEKLY accounts with no trade on 09-28 or 09-29 get their full
--             set: 501 accounts, 2,505 trades. Their LAST_GENERATED_DATE was set
--             to 09-28 before their batch was written, so the 09-29 run skipped
--             them (the stranded-tail pattern of the old code).
-- Not touched: the 3,893 WEEKLY accounts that caught up on 09-29 (that was the
-- normal next-day catch-up), the 44 MONTHLY accounts (not due), NULL-ACCOUNT_ID
-- rows, TRADE_GENERATION_CONFIG (LAST_GENERATED_DATE stays as it is).
-- Expected total: 133,242 rows for 32,814 accounts, taking 09-28 from 32,317
-- to 165,559.
--
-- Account profile (TRADES_PER_PERIOD, sectors, exchanges, risk, max value) is
-- read from TRADE_GENERATION_CONFIG_BAK_20261104, the config before migrations
-- 003-005, i.e. the profile the account traded under on 09-28. Accounts that
-- existed on 09-28 = ACTIVE, ACCOUNT_ID LIKE '001%', CREATED_DATE < 2026-09-28.
-- Trades come from generate_trade() copied verbatim from
-- procedures/generate_daily_trades.sql (unchanged since the 09-01 deploy that
-- ran on 09-28), with trade_day = 2026-09-28 and the live INSTRUMENT_UNIVERSE.
--
-- Marker: every backfilled row has CREATED_AT = 2026-09-28 12:00:00.000 (naive
-- UTC, like the generator). No existing row has that value (checked
-- 2026-11-09); the real 09-28 rows were written 07:10-10:09 UTC with
-- millisecond noise. The backfilled rows sit more than 600 s from the real ones
-- in each (account, day), so 007's pass logic would read 09-28 as two passes.
-- Don't rerun 007-style dedupe on 09-28 without excluding the marker.
--
-- Safety: the procedure refuses to run if any marker row exists (so a second
-- run can't double the backfill), stages everything in a TEMPORARY table,
-- checks the stage (row count = plan, one TRADE_DATE, one CREATED_AT, no
-- TRADE_ID clash), and only then INSERTs, in one statement.
-- The DC stream BT_Financial_Trades is zero copy (DIRECT_ACCESS), so the new
-- rows show up there with no refresh.
-- Run as ACCOUNTADMIN outside the 03:00-03:10 ET task window, in one session
-- (snow sql --role ACCOUNTADMIN -f ...): the plan and stage are TEMPORARY.
-- Rollback:
--   DELETE FROM DATA_JEDAIS.FINS__PUBLIC.FINANCIAL_TRADES
--   WHERE TRADE_DATE = '2026-09-28' AND CREATED_AT = '2026-09-28 12:00:00';
-- =============================================================================

USE SCHEMA DATA_JEDAIS.FINS__PUBLIC;

-- Plan: one row per account to backfill, with the profile it traded under.
CREATE OR REPLACE TEMPORARY TABLE M008_PLAN AS
WITH cfg AS (
  SELECT ACCOUNT_ID, FREQUENCY, COALESCE(TRADES_PER_PERIOD, 5) TPP,
         PREFERRED_SECTORS, PREFERRED_EXCHANGES, RISK_PROFILE, MAX_TRADE_VALUE
  FROM TRADE_GENERATION_CONFIG_BAK_20261104
  WHERE ACTIVE AND ACCOUNT_ID LIKE '001%' AND CREATED_DATE < '2026-09-28'
    AND FREQUENCY IN ('WEEKLY', 'DAILY')
),
d28 AS (SELECT ACCOUNT_ID, COUNT(*) N FROM FINANCIAL_TRADES WHERE TRADE_DATE = '2026-09-28' GROUP BY 1),
d29 AS (SELECT DISTINCT ACCOUNT_ID FROM FINANCIAL_TRADES WHERE TRADE_DATE = '2026-09-29')
SELECT c.ACCOUNT_ID, c.FREQUENCY, c.TPP, COALESCE(d28.N, 0) HAVE, c.TPP - COALESCE(d28.N, 0) TO_ADD,
       IFF(d28.ACCOUNT_ID IS NULL, 'NO_TRADE', 'TOP_UP') REASON,
       c.PREFERRED_SECTORS, c.PREFERRED_EXCHANGES, c.RISK_PROFILE, c.MAX_TRADE_VALUE
FROM cfg c
LEFT JOIN d28 ON d28.ACCOUNT_ID = c.ACCOUNT_ID
LEFT JOIN d29 ON d29.ACCOUNT_ID = c.ACCOUNT_ID
WHERE (d28.ACCOUNT_ID IS NOT NULL OR d29.ACCOUNT_ID IS NULL)
  AND c.TPP - COALESCE(d28.N, 0) > 0;

-- Expected (2026-11-09): TOP_UP DAILY 315 / 2,740; TOP_UP WEEKLY 31,998 /
-- 127,997; NO_TRADE WEEKLY 501 / 2,505 (dry run of this SELECT, 2026-11-09).
SELECT REASON, FREQUENCY, COUNT(*) ACCOUNTS, SUM(TO_ADD) TRADES_TO_ADD
FROM M008_PLAN GROUP BY 1, 2 ORDER BY 1, 2;

CREATE OR REPLACE TEMPORARY TABLE M008_STAGE LIKE FINANCIAL_TRADES;

WITH M008_BACKFILL AS PROCEDURE ()
RETURNS VARCHAR
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
PACKAGES = ('snowflake-snowpark-python', 'pandas')
HANDLER = 'run'
AS $$
import random
import uuid
from datetime import date, datetime, timedelta, timezone

import pandas as pd

TRADE_DAY = date(2026, 9, 28)
MARKER = "2026-09-28T12:00:00.000Z"
MARKER_SQL = "2026-09-28 12:00:00"

# ---- copied verbatim from procedures/generate_daily_trades.sql -------------
EXCHANGES = ["NYSE", "NASDAQ", "LSE", "HKEX", "JPX"]
SOURCE_SYSTEMS = [
    "Bloomberg", "E*TRADE", "Fidelity Investments", "Interactive Brokers",
    "Charles Schwab", "TD Ameritrade", "TradeStation", "SimCorp",
    "FlexTrade", "AlgoTrader", "QuantConnect", "Rithmic", "CQG",
    "IG Group", "Saxo Bank", "Plus500", "Robinhood", "Reuters",
    "X_TRADER", "OANDA",
]
TRADE_TYPES = ["Market Order", "Limit Order", "Stop Order"]
TRADE_CONDITIONS = ["None", "FOK", "IOC"]
TRADE_STATUSES = ["Pending", "Confirmed", "Cancelled"]
STATUS_WEIGHTS = [2, 6, 2]
CURRENCIES = ["USD", "EUR", "GBP"]


def _weighted_choice(rng, population, weights):
    return rng.choices(population, weights=weights, k=1)[0]


def _add_weekdays(d, n):
    cur = d
    added = 0
    while added < n:
        cur += timedelta(days=1)
        if cur.weekday() < 5:
            added += 1
    return cur


def _pick_exchange(rng, ticker):
    european = {"BP", "RDSA"}
    if ticker in european:
        return _weighted_choice(rng, EXCHANGES, [1, 1, 4, 1, 1])
    return _weighted_choice(rng, EXCHANGES, [4, 4, 2, 1, 1])


def _pick_currency(rng, exchange):
    if exchange in ("NYSE", "NASDAQ"):
        return _weighted_choice(rng, CURRENCIES, [8, 1, 1])
    if exchange == "LSE":
        return _weighted_choice(rng, CURRENCIES, [3, 2, 4])
    if exchange == "HKEX":
        return _weighted_choice(rng, CURRENCIES, [6, 1, 1])
    return _weighted_choice(rng, CURRENCIES, [5, 2, 1])


def _shake_price(rng, base, jitter_pct):
    lo = 1.0 - jitter_pct
    hi = 1.0 + jitter_pct
    return round(base * rng.uniform(lo, hi), 2)


def _pick_quantity(rng, price, max_notional):
    target = rng.uniform(8000, min(350000, max_notional))
    q = max(1, int(target / max(price, 0.01)))
    return min(q, 2000)


def _fees(rng, total):
    bps = rng.uniform(1.5, 25)
    return round(total * (bps / 10000.0), 2)


def _to_iso_z(dt):
    micro = dt.microsecond - dt.microsecond % 1000
    dt = dt.replace(microsecond=micro)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"


def _filter_instruments(instruments, preferred_sectors):
    if not preferred_sectors:
        return instruments
    sectors = [s.strip() for s in preferred_sectors.split(",") if s.strip()]
    if not sectors:
        return instruments
    filtered = [i for i in instruments if i[0] in sectors]
    return filtered if filtered else instruments


def _filter_exchanges(exchanges, preferred_exchanges):
    if not preferred_exchanges:
        return exchanges
    prefs = [e.strip() for e in preferred_exchanges.split(",") if e.strip()]
    filtered = [e for e in exchanges if e in prefs]
    return filtered if filtered else exchanges


def _risk_params(risk_profile):
    if risk_profile == "Aggressive":
        return {"jitter": 0.12, "buy_weight": 5, "sell_weight": 5}
    if risk_profile == "Conservative":
        return {"jitter": 0.04, "buy_weight": 6, "sell_weight": 4}
    return {"jitter": 0.08, "buy_weight": 5, "sell_weight": 5}


def generate_trade(rng, account_id, trade_day, instrument, risk, max_val, avail_exchanges):
    category, ticker, name, base_price = instrument

    exchange = _pick_exchange(rng, ticker)
    if avail_exchanges and exchange not in avail_exchanges:
        exchange = rng.choice(avail_exchanges)
    currency = _pick_currency(rng, exchange)

    price = _shake_price(rng, base_price, risk["jitter"])
    qty = _pick_quantity(rng, price, max_val)
    total = round(qty * price, 2)

    if total > max_val:
        qty = max(1, int(max_val / max(price, 0.01)))
        total = round(qty * price, 2)

    fees = _fees(rng, total)
    hour = rng.randint(9, 16)
    minute = rng.randint(0, 59)
    second = rng.randint(0, 59)
    trade_time = f"{hour:02d}:{minute:02d}:{second:02d}"

    trade_dt = datetime(trade_day.year, trade_day.month, trade_day.day,
                        hour, minute, second, tzinfo=timezone.utc)
    settlement_day = _add_weekdays(trade_day, 2)
    settlement_dt = datetime(settlement_day.year, settlement_day.month, settlement_day.day,
                             tzinfo=timezone.utc)
    snap_delay = timedelta(seconds=rng.randint(30, 12 * 3600))
    snapshot_dt = trade_dt + snap_delay

    side = _weighted_choice(rng, ["Buy", "Sell"],
                            [risk["buy_weight"], risk["sell_weight"]])

    return {
        "TRADE_ID": str(uuid.uuid4()),
        "ORDER_ID": str(uuid.uuid4()),
        "ACCOUNT_ID": account_id,
        "TRADE_DATE": _to_iso_z(trade_dt),
        "TRADE_TIME": trade_time,
        "SETTLEMENT_DATE": _to_iso_z(settlement_dt),
        "SNAPSHOT_DATE": _to_iso_z(snapshot_dt),
        "INSTRUMENT_IDENTIFIER": ticker,
        "INSTRUMENT_NAME": name,
        "INSTRUMENT_CATEGORY": category,
        "PRICE": price,
        "QUANTITY": qty,
        "TOTAL_TRADE": total,
        "FEES": fees,
        "TRADE_SIDE": side,
        "TRADE_TYPE": rng.choice(TRADE_TYPES),
        "TRADE_CONDITION": rng.choice(TRADE_CONDITIONS),
        "TRADE_STATUS": _weighted_choice(rng, TRADE_STATUSES, STATUS_WEIGHTS),
        "EXCHANGE": exchange,
        "CURRENCY": currency,
        "SOURCE_SYSTEM": rng.choice(SOURCE_SYSTEMS),
        "COUNTERPARTY_BROKER_ID": f"BRK{rng.randint(1000, 9999)}",
        "REGULATORY_CODE": f"REG{rng.randint(100, 999)}",
        "COMMENTS": "Simulated trade",
        "CREATED_AT": _to_iso_z(datetime.now(timezone.utc)),
    }


DATE_COLS = ("TRADE_DATE", "SETTLEMENT_DATE", "SNAPSHOT_DATE")
# ---- end of verbatim copy ---------------------------------------------------


def _one(session, sql):
    return session.sql(sql).collect()[0][0]


def run(session):
    existing = _one(session,
        "SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.FINANCIAL_TRADES "
        f"WHERE TRADE_DATE = '2026-09-28' AND CREATED_AT = '{MARKER_SQL}'")
    if existing:
        raise RuntimeError(f"{existing} marker rows already exist: 008 has run. Roll back first.")
    if _one(session, "SELECT COUNT(*) FROM M008_STAGE"):
        raise RuntimeError("M008_STAGE is not empty.")

    instruments_all = [
        (r["SECTOR"], r["TICKER"], r["INSTRUMENT_NAME"], float(r["BASE_PRICE"]))
        for r in session.sql(
            "SELECT SECTOR, TICKER, INSTRUMENT_NAME, BASE_PRICE "
            "FROM DATA_JEDAIS.FINS__PUBLIC.INSTRUMENT_UNIVERSE").collect()
    ]
    if not instruments_all:
        raise RuntimeError("INSTRUMENT_UNIVERSE is empty.")

    plan = session.sql(
        "SELECT ACCOUNT_ID, TO_ADD, PREFERRED_SECTORS, PREFERRED_EXCHANGES, "
        "RISK_PROFILE, MAX_TRADE_VALUE FROM M008_PLAN ORDER BY ACCOUNT_ID").collect()
    planned = sum(int(r["TO_ADD"]) for r in plan)

    rng = random.Random("migration-008-2026-09-28")
    rows = []
    for r in plan:
        instruments = _filter_instruments(instruments_all, r["PREFERRED_SECTORS"])
        avail_exchanges = _filter_exchanges(EXCHANGES, r["PREFERRED_EXCHANGES"])
        risk = _risk_params(r["RISK_PROFILE"] or "Moderate")
        max_val = float(r["MAX_TRADE_VALUE"] or 500000)
        for _ in range(int(r["TO_ADD"])):
            trade = generate_trade(rng, r["ACCOUNT_ID"], TRADE_DAY, rng.choice(instruments),
                                   risk, max_val, avail_exchanges)
            trade["CREATED_AT"] = MARKER
            rows.append(trade)

    # Same conversions as _flush_batch in the generator, written to the stage.
    df = pd.DataFrame(rows)
    for c in DATE_COLS:
        df[c] = pd.to_datetime(df[c], utc=True).dt.date
    df["CREATED_AT"] = pd.to_datetime(df["CREATED_AT"], utc=True).dt.tz_localize(None)
    session.write_pandas(df, "M008_STAGE", auto_create_table=False, overwrite=False,
                         use_logical_type=True)

    staged, dates, stamps, accts = session.sql(
        "SELECT COUNT(*), COUNT(DISTINCT TRADE_DATE), COUNT(DISTINCT CREATED_AT), "
        "COUNT(DISTINCT ACCOUNT_ID) FROM M008_STAGE "
        f"WHERE TRADE_DATE = '2026-09-28' AND CREATED_AT = '{MARKER_SQL}'").collect()[0]
    total_stage = _one(session, "SELECT COUNT(*) FROM M008_STAGE")
    clash = _one(session,
        "SELECT COUNT(*) FROM M008_STAGE s JOIN DATA_JEDAIS.FINS__PUBLIC.FINANCIAL_TRADES t "
        "ON t.TRADE_ID = s.TRADE_ID")
    if not (staged == total_stage == planned and dates == 1 and stamps == 1
            and accts == len(plan) and clash == 0):
        raise RuntimeError(
            f"Stage check failed: staged={staged} total={total_stage} planned={planned} "
            f"dates={dates} stamps={stamps} accounts={accts}/{len(plan)} clash={clash}. "
            "Nothing was inserted.")

    inserted = session.sql(
        "INSERT INTO DATA_JEDAIS.FINS__PUBLIC.FINANCIAL_TRADES SELECT * FROM M008_STAGE"
    ).collect()[0][0]
    return f"Inserted {inserted} trades for {len(plan)} accounts on 2026-09-28 (planned {planned})."
$$
CALL M008_BACKFILL();

-- Check 1: every planned account now has exactly TRADES_PER_PERIOD trades on
-- 09-28 (expect WRONG_COUNT = 0).
SELECT p.REASON, p.FREQUENCY, COUNT(*) ACCOUNTS,
       COUNT_IF(t.N <> p.TPP) WRONG_COUNT
FROM M008_PLAN p
JOIN (SELECT ACCOUNT_ID, COUNT(*) N FROM FINANCIAL_TRADES
      WHERE TRADE_DATE = '2026-09-28' GROUP BY 1) t ON t.ACCOUNT_ID = p.ACCOUNT_ID
GROUP BY 1, 2 ORDER BY 1, 2;

-- Check 2: the day next to its neighbours (expect 09-28 165,559 with 133,242 BACKFILLED, others unchanged).
SELECT TRADE_DATE, COUNT(*) N, COUNT(DISTINCT ACCOUNT_ID) ACCOUNTS,
       COUNT_IF(CREATED_AT = '2026-09-28 12:00:00') BACKFILLED
FROM FINANCIAL_TRADES
WHERE TRADE_DATE IN ('2026-09-21', '2026-09-28', '2026-09-29', '2026-10-05')
GROUP BY 1 ORDER BY 1;
