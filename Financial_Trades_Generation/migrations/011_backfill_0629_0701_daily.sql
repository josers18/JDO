-- =============================================================================
-- Migration 011 (applied 2026-11-09, ~11:15 ET): backfill the DAILY accounts for
-- 2026-06-29 (Mon) and 2026-07-01 (Wed), the two days with no trades at all.
--
-- What happened: TASK_HISTORY has no DAILY_TRADE_GENERATOR run for either day.
-- GENERATE_DAILY_TRADES was redeployed twice on 2026-06-29 (11:04 and 12:15
-- PT, QUERY_HISTORY), and around then the task moved from 22:00 PT to 00:10
-- PT. The runs either side are 2026-06-30 22:00 PT (the last 22:00 run) and
-- 2026-07-02 00:10 PT (the first 00:10 run); each run trades one TRADE_DATE.
-- The WEEKLY sets for the week of 06-29 landed on 06-30, the first run where
-- they were due, so only the DAILY accounts lost trades: 315 accounts x 2 days.
--
-- What this migration writes (new synthetic trades):
--   every DAILY account (config before 003-005, ACTIVE, '001%',
--   CREATED_DATE < 2026-06-29) gets its full TRADES_PER_PERIOD on 06-29 and
--   on 07-01. Expected 630 account-days (315 per day), 6,110 trades (3,055 per
--   day, the same as 06-28, 06-30 and 07-02; dry run 2026-11-09).
-- Not touched: WEEKLY / MONTHLY accounts, the old TRD- placeholders (DAILY
-- too, but their rows have a NULL ACCOUNT_ID; see migration 009), every other
-- day, TRADE_GENERATION_CONFIG.
--
-- Account profile is read from TRADE_GENERATION_CONFIG_BAK_20261104 (the
-- config before 003-005). Trades come from generate_trade() copied verbatim
-- from migration 008. The generator deployed 2026-06-29 12:15 PT, which ran on
-- 06-30 and 07-02, has the same generate_trade() as that copy except that it
-- set no CREATED_AT (the table default filled it); the marker below replaces
-- CREATED_AT in either case. Checked 2026-11-09 by diffing the two CREATE
-- PROCEDURE texts from QUERY_HISTORY.
--
-- Markers: CREATED_AT = 2026-06-29 12:00:00.000 on the 06-29 rows and
-- 2026-07-01 12:00:00.000 on the 07-01 rows (naive UTC). Neither value nor
-- either TRADE_DATE had any row on 2026-11-09.
--
-- Safety: same as 008. The procedure refuses to run if any marker row exists,
-- stages everything in a TEMPORARY table, checks the stage (row count = plan,
-- account-days = plan, every row carries its day's marker, no TRADE_ID
-- clash), and only then INSERTs, in one statement.
-- The DC stream BT_Financial_Trades is zero copy (DIRECT_ACCESS), so the new
-- rows show up there with no refresh.
-- Run as ACCOUNTADMIN outside the 03:00-03:10 ET task window, in one session
-- (snow sql --role ACCOUNTADMIN -f ...): the plan and stage are TEMPORARY.
-- Result (2026-11-09): inserted 6,110 trades for 630 account-days; check 1
-- WRONG_COUNT = 0 on both days. 06-29 and 07-01 = 3,055 rows / 315 accounts
-- each, all marked; 06-28, 06-30 (185,146) and 07-02 unchanged. Backfilled
-- rows match the DAILY accounts' real 06-28/06-30/07-02 trades on mean trade
-- value ($98.6K vs $99.0K), fees, buy and confirmed share.
-- Rollback:
--   DELETE FROM DATA_JEDAIS.FINS__PUBLIC.FINANCIAL_TRADES
--   WHERE (TRADE_DATE = '2026-06-29' AND CREATED_AT = '2026-06-29 12:00:00')
--      OR (TRADE_DATE = '2026-07-01' AND CREATED_AT = '2026-07-01 12:00:00');
-- =============================================================================

USE SCHEMA DATA_JEDAIS.FINS__PUBLIC;

-- Plan: one row per (day, account), with the profile it traded under.
CREATE OR REPLACE TEMPORARY TABLE M011_PLAN AS
WITH cfg AS (
  SELECT ACCOUNT_ID, COALESCE(TRADES_PER_PERIOD, 5) TPP,
         PREFERRED_SECTORS, PREFERRED_EXCHANGES, RISK_PROFILE, MAX_TRADE_VALUE
  FROM TRADE_GENERATION_CONFIG_BAK_20261104
  WHERE ACTIVE AND ACCOUNT_ID LIKE '001%' AND CREATED_DATE < '2026-06-29'
    AND FREQUENCY = 'DAILY'
),
days AS (SELECT '2026-06-29'::DATE TRADE_DAY UNION ALL SELECT '2026-07-01'::DATE)
SELECT d.TRADE_DAY, c.ACCOUNT_ID, c.TPP, c.TPP TO_ADD,
       c.PREFERRED_SECTORS, c.PREFERRED_EXCHANGES, c.RISK_PROFILE, c.MAX_TRADE_VALUE
FROM cfg c CROSS JOIN days d
WHERE NOT EXISTS (SELECT 1 FROM FINANCIAL_TRADES t
                  WHERE t.ACCOUNT_ID = c.ACCOUNT_ID AND t.TRADE_DATE = d.TRADE_DAY);

-- Expected (2026-11-09): 315 accounts / 3,055 trades on each day.
SELECT TRADE_DAY, COUNT(*) ACCOUNTS, SUM(TO_ADD) TRADES_TO_ADD
FROM M011_PLAN GROUP BY 1 ORDER BY 1;

CREATE OR REPLACE TEMPORARY TABLE M011_STAGE LIKE FINANCIAL_TRADES;

WITH M011_BACKFILL AS PROCEDURE ()
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
    "2026-06-29": (date(2026, 6, 29), "2026-06-29T12:00:00.000Z", "2026-06-29 12:00:00"),
    "2026-07-01": (date(2026, 7, 1), "2026-07-01T12:00:00.000Z", "2026-07-01 12:00:00"),
}
MARKER_PRED = "(TRADE_DATE = '2026-06-29' AND CREATED_AT = '2026-06-29 12:00:00') OR (TRADE_DATE = '2026-07-01' AND CREATED_AT = '2026-07-01 12:00:00')"

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
    if _one(session, "SELECT COUNT(*) FROM M011_STAGE"):
        raise RuntimeError("M011_STAGE is not empty.")

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
        "PREFERRED_EXCHANGES, RISK_PROFILE, MAX_TRADE_VALUE FROM M011_PLAN "
        "ORDER BY TRADE_DAY, ACCOUNT_ID").collect()
    planned = sum(int(r["TO_ADD"]) for r in plan)
    pairs = len(plan)

    rng = random.Random("migration-011-2026-06-29-07-01")
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
    session.write_pandas(df, "M011_STAGE", auto_create_table=False, overwrite=False,
                         use_logical_type=True)

    staged, stage_pairs = session.sql(
        "SELECT COUNT(*), COUNT(DISTINCT ACCOUNT_ID, TRADE_DATE) FROM M011_STAGE "
        f"WHERE {MARKER_PRED}").collect()[0]
    total_stage = _one(session, "SELECT COUNT(*) FROM M011_STAGE")
    clash = _one(session,
        "SELECT COUNT(*) FROM M011_STAGE s JOIN DATA_JEDAIS.FINS__PUBLIC.FINANCIAL_TRADES t "
        "ON t.TRADE_ID = s.TRADE_ID")
    if not (staged == total_stage == planned and stage_pairs == pairs and clash == 0):
        raise RuntimeError(
            f"Stage check failed: staged={staged} total={total_stage} planned={planned} "
            f"account-days={stage_pairs}/{pairs} clash={clash}. Nothing was inserted.")

    inserted = session.sql(
        "INSERT INTO DATA_JEDAIS.FINS__PUBLIC.FINANCIAL_TRADES SELECT * FROM M011_STAGE"
    ).collect()[0][0]
    return f"Inserted {inserted} trades for {pairs} account-days on 2026-06-29 and 2026-07-01 (planned {planned})."
$$
CALL M011_BACKFILL();

-- Check 1: every planned account-day now has exactly TRADES_PER_PERIOD trades,
-- all carrying that day's marker (expect WRONG_COUNT = 0 on both days).
SELECT p.TRADE_DAY, COUNT(*) ACCOUNTS, COUNT_IF(t.N <> p.TPP OR t.MARKED <> t.N) WRONG_COUNT
FROM M011_PLAN p
JOIN (SELECT ACCOUNT_ID, TRADE_DATE, COUNT(*) N,
             COUNT_IF(CREATED_AT = TO_TIMESTAMP_NTZ(TO_VARCHAR(TRADE_DATE) || ' 12:00:00')) MARKED
      FROM FINANCIAL_TRADES WHERE TRADE_DATE IN ('2026-06-29', '2026-07-01') GROUP BY 1, 2) t
  ON t.ACCOUNT_ID = p.ACCOUNT_ID AND t.TRADE_DATE = p.TRADE_DAY
GROUP BY 1 ORDER BY 1;

-- Check 2: the days next to their neighbours (expect 06-29 and 07-01 3,055
-- rows / 315 accounts each, all BACKFILLED; 06-28, 06-30 and 07-02 unchanged).
SELECT TRADE_DATE, COUNT(*) N, COUNT(DISTINCT ACCOUNT_ID) ACCOUNTS,
       COUNT_IF(CREATED_AT = TO_TIMESTAMP_NTZ(TO_VARCHAR(TRADE_DATE) || ' 12:00:00')) BACKFILLED
FROM FINANCIAL_TRADES
WHERE TRADE_DATE BETWEEN '2026-06-28' AND '2026-07-02'
GROUP BY 1 ORDER BY 1;
