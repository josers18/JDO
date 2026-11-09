-- =============================================================================
-- Migration 010 (applied 2026-11-09, ~11:15 ET): backfill the week of Monday 2026-10-12 for
-- the 501 WEEKLY accounts that got no trades that week.
--
-- What happened on 10-12: all three DAILY_TRADE_GENERATOR attempts (00:10,
-- 01:10, 02:10 PT) hit the 3,600 s task timeout. The old code marked
-- LAST_GENERATED_DATE every 500 accounts before their trades were flushed, so
-- the runs left a stranded tail: 1,394 WEEKLY accounts that traded on 10-05
-- had nothing on 10-12. 893 of them caught up on 10-13 (normal next-day
-- catch-up). The other 501 have no trade anywhere in 10-12 .. 10-18 and traded
-- again on 10-19. All 501 were created 2026-05-26 21:00:50-51 and trade
-- WEEKLY/5. They are a different set from the 501 that 008 filled on 09-28.
-- Migration 007 then deduped 10-12's retry passes; it removes duplicates
-- only and doesn't add anything.
--
-- What this migration writes (new synthetic trades, TRADE_DATE 2026-10-12):
--   every WEEKLY account (config before 003-005, ACTIVE, '001%',
--   CREATED_DATE < 2026-10-12) with no trade in 10-12 .. 10-18 gets its full
--   TRADES_PER_PERIOD. Expected 501 accounts, 2,505 trades (dry run of the
--   plan SELECT, 2026-11-09), taking 10-12 from 178,145 to 180,650 rows.
-- Not touched: the 893 accounts that caught up on 10-13, every other day,
-- TRADE_GENERATION_CONFIG (LAST_GENERATED_DATE stays as it is).
--
-- Account profile is read from TRADE_GENERATION_CONFIG_BAK_20261104 (the
-- config before 003-005, i.e. what the account traded under on 10-12).
-- Trades come from generate_trade() copied verbatim from migration 008, which
-- copied it from procedures/generate_daily_trades.sql as deployed 2026-09-01,
-- the version that ran on 10-12.
--
-- Marker: every backfilled row has CREATED_AT = 2026-10-12 12:00:00.000 (naive
-- UTC). No row had that value on 2026-11-09; the real 10-12 rows were written
-- 07:10-09:40 UTC. These accounts have no other 10-12 rows, so 007's pass
-- logic would read each one as a single pass.
--
-- Safety: same as 008. The procedure refuses to run if any marker row exists,
-- stages everything in a TEMPORARY table, checks the stage (row count = plan,
-- account-days = plan, every row carries the marker, no TRADE_ID clash), and
-- only then INSERTs, in one statement.
-- The DC stream BT_Financial_Trades is zero copy (DIRECT_ACCESS), so the new
-- rows show up there with no refresh.
-- Run as ACCOUNTADMIN outside the 03:00-03:10 ET task window, in one session
-- (snow sql --role ACCOUNTADMIN -f ...): the plan and stage are TEMPORARY.
-- Result (2026-11-09): inserted 2,505 trades for 501 accounts; check 1
-- WRONG_COUNT = 0. 10-12 = 180,552 rows / 35,814 accounts (2,505 marked): the
-- expected 180,650 less the 98 TRD rows migration 009 had just deleted from
-- 10-12. 10-05 (185,020) and 10-19 (185,106) unchanged; 10-13 = 7,520 (its
-- 50 TRD rows gone). Backfilled rows match the same cohort's real trades on
-- mean trade value ($61.7K vs $61.6K), fees, buy and confirmed share.
-- Rollback:
--   DELETE FROM DATA_JEDAIS.FINS__PUBLIC.FINANCIAL_TRADES
--   WHERE TRADE_DATE = '2026-10-12' AND CREATED_AT = '2026-10-12 12:00:00';
-- =============================================================================

USE SCHEMA DATA_JEDAIS.FINS__PUBLIC;

-- Plan: one row per account to backfill, with the profile it traded under.
CREATE OR REPLACE TEMPORARY TABLE M010_PLAN AS
WITH cfg AS (
  SELECT ACCOUNT_ID, COALESCE(TRADES_PER_PERIOD, 5) TPP,
         PREFERRED_SECTORS, PREFERRED_EXCHANGES, RISK_PROFILE, MAX_TRADE_VALUE
  FROM TRADE_GENERATION_CONFIG_BAK_20261104
  WHERE ACTIVE AND ACCOUNT_ID LIKE '001%' AND CREATED_DATE < '2026-10-12'
    AND FREQUENCY = 'WEEKLY'
),
wk AS (
  SELECT DISTINCT ACCOUNT_ID FROM FINANCIAL_TRADES
  WHERE TRADE_DATE BETWEEN '2026-10-12' AND '2026-10-18' AND ACCOUNT_ID IS NOT NULL
)
SELECT '2026-10-12'::DATE TRADE_DAY, c.ACCOUNT_ID, c.TPP, c.TPP TO_ADD,
       c.PREFERRED_SECTORS, c.PREFERRED_EXCHANGES, c.RISK_PROFILE, c.MAX_TRADE_VALUE
FROM cfg c
WHERE c.ACCOUNT_ID NOT IN (SELECT ACCOUNT_ID FROM wk);

-- Expected (2026-11-09): 501 accounts, 2,505 trades.
SELECT COUNT(*) ACCOUNTS, SUM(TO_ADD) TRADES_TO_ADD FROM M010_PLAN;

CREATE OR REPLACE TEMPORARY TABLE M010_STAGE LIKE FINANCIAL_TRADES;

WITH M010_BACKFILL AS PROCEDURE ()
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

# TRADE_DATE -> (trade day, CREATED_AT marker as written, marker as SQL literal)
DAYS = {
    "2026-10-12": (date(2026, 10, 12), "2026-10-12T12:00:00.000Z", "2026-10-12 12:00:00"),
}
MARKER_PRED = "(TRADE_DATE = '2026-10-12' AND CREATED_AT = '2026-10-12 12:00:00')"

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
        f"SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.FINANCIAL_TRADES WHERE {MARKER_PRED}")
    if existing:
        raise RuntimeError(f"{existing} marker rows already exist: this migration has run. Roll back first.")
    if _one(session, "SELECT COUNT(*) FROM M010_STAGE"):
        raise RuntimeError("M010_STAGE is not empty.")

    instruments_all = [
        (r["SECTOR"], r["TICKER"], r["INSTRUMENT_NAME"], float(r["BASE_PRICE"]))
        for r in session.sql(
            "SELECT SECTOR, TICKER, INSTRUMENT_NAME, BASE_PRICE "
            "FROM DATA_JEDAIS.FINS__PUBLIC.INSTRUMENT_UNIVERSE").collect()
    ]
    if not instruments_all:
        raise RuntimeError("INSTRUMENT_UNIVERSE is empty.")

    plan = session.sql(
        "SELECT TO_VARCHAR(TRADE_DAY, 'YYYY-MM-DD') TRADE_DAY, ACCOUNT_ID, TO_ADD, PREFERRED_SECTORS, "
        "PREFERRED_EXCHANGES, RISK_PROFILE, MAX_TRADE_VALUE FROM M010_PLAN "
        "ORDER BY TRADE_DAY, ACCOUNT_ID").collect()
    planned = sum(int(r["TO_ADD"]) for r in plan)
    pairs = len(plan)

    rng = random.Random("migration-010-2026-10-12")
    rows = []
    for r in plan:
        trade_day, marker, _ = DAYS[r["TRADE_DAY"]]
        instruments = _filter_instruments(instruments_all, r["PREFERRED_SECTORS"])
        avail_exchanges = _filter_exchanges(EXCHANGES, r["PREFERRED_EXCHANGES"])
        risk = _risk_params(r["RISK_PROFILE"] or "Moderate")
        max_val = float(r["MAX_TRADE_VALUE"] or 500000)
        for _ in range(int(r["TO_ADD"])):
            trade = generate_trade(rng, r["ACCOUNT_ID"], trade_day, rng.choice(instruments),
                                   risk, max_val, avail_exchanges)
            trade["CREATED_AT"] = marker
            rows.append(trade)

    # Same conversions as _flush_batch in the generator, written to the stage.
    df = pd.DataFrame(rows)
    for c in DATE_COLS:
        df[c] = pd.to_datetime(df[c], utc=True).dt.date
    df["CREATED_AT"] = pd.to_datetime(df["CREATED_AT"], utc=True).dt.tz_localize(None)
    session.write_pandas(df, "M010_STAGE", auto_create_table=False, overwrite=False,
                         use_logical_type=True)

    staged, stage_pairs = session.sql(
        "SELECT COUNT(*), COUNT(DISTINCT ACCOUNT_ID, TRADE_DATE) FROM M010_STAGE "
        f"WHERE {MARKER_PRED}").collect()[0]
    total_stage = _one(session, "SELECT COUNT(*) FROM M010_STAGE")
    clash = _one(session,
        "SELECT COUNT(*) FROM M010_STAGE s JOIN DATA_JEDAIS.FINS__PUBLIC.FINANCIAL_TRADES t "
        "ON t.TRADE_ID = s.TRADE_ID")
    if not (staged == total_stage == planned and stage_pairs == pairs and clash == 0):
        raise RuntimeError(
            f"Stage check failed: staged={staged} total={total_stage} planned={planned} "
            f"account-days={stage_pairs}/{pairs} clash={clash}. Nothing was inserted.")

    inserted = session.sql(
        "INSERT INTO DATA_JEDAIS.FINS__PUBLIC.FINANCIAL_TRADES SELECT * FROM M010_STAGE"
    ).collect()[0][0]
    return f"Inserted {inserted} trades for {pairs} account-days on 2026-10-12 (planned {planned})."
$$
CALL M010_BACKFILL();

-- Check 1: every planned account now has exactly TRADES_PER_PERIOD trades on
-- 10-12, all of them marked (expect WRONG_COUNT = 0).
SELECT COUNT(*) ACCOUNTS, COUNT_IF(t.N <> p.TPP OR t.MARKED <> t.N) WRONG_COUNT
FROM M010_PLAN p
JOIN (SELECT ACCOUNT_ID, COUNT(*) N, COUNT_IF(CREATED_AT = '2026-10-12 12:00:00') MARKED
      FROM FINANCIAL_TRADES WHERE TRADE_DATE = '2026-10-12' GROUP BY 1) t
  ON t.ACCOUNT_ID = p.ACCOUNT_ID;

-- Check 2: the day next to its neighbours (expect 10-12 180,650 rows with
-- 2,505 BACKFILLED; 10-05, 10-13 and 10-19 unchanged).
SELECT TRADE_DATE, COUNT(*) N, COUNT(DISTINCT ACCOUNT_ID) ACCOUNTS,
       COUNT_IF(CREATED_AT = '2026-10-12 12:00:00') BACKFILLED
FROM FINANCIAL_TRADES
WHERE TRADE_DATE IN ('2026-10-05', '2026-10-12', '2026-10-13', '2026-10-19')
GROUP BY 1 ORDER BY 1;
