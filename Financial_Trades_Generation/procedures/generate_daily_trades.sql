-- =============================================================================
-- Procedure: GENERATE_DAILY_TRADES()
-- Database:  FINS.PUBLIC
-- Purpose:   Generates synthetic trades for all active accounts that are due
--            based on their configured frequency (DAILY/WEEKLY/MONTHLY).
--            Reads from INSTRUMENT_UNIVERSE and TRADE_GENERATION_CONFIG,
--            applies risk-based price jitter, exchange/currency weighting,
--            and batch-inserts into FINANCIAL_TRADES (500 rows per batch).
--            Updates LAST_GENERATED_DATE on each processed account.
-- Called by: DAILY_TRADE_GENERATOR task (1:00 AM ET)
-- Language:  Python 3.11 (Snowpark)
-- Execution: EXECUTE AS OWNER
-- =============================================================================

CREATE OR REPLACE PROCEDURE "GENERATE_DAILY_TRADES"()
RETURNS VARCHAR
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
PACKAGES = ('snowflake-snowpark-python')
HANDLER = 'generate_trades'
EXECUTE AS OWNER
AS '
import random
import uuid
import time
from datetime import date, datetime, timedelta, timezone

EXCHANGES = [""NYSE"", ""NASDAQ"", ""LSE"", ""HKEX"", ""JPX""]
SOURCE_SYSTEMS = [
    ""Bloomberg"", ""E*TRADE"", ""Fidelity Investments"", ""Interactive Brokers"",
    ""Charles Schwab"", ""TD Ameritrade"", ""TradeStation"", ""SimCorp"",
    ""FlexTrade"", ""AlgoTrader"", ""QuantConnect"", ""Rithmic"", ""CQG"",
    ""IG Group"", ""Saxo Bank"", ""Plus500"", ""Robinhood"", ""Reuters"",
    ""X_TRADER"", ""OANDA"",
]
TRADE_TYPES = [""Market Order"", ""Limit Order"", ""Stop Order""]
TRADE_CONDITIONS = [""None"", ""FOK"", ""IOC""]
TRADE_STATUSES = [""Pending"", ""Confirmed"", ""Cancelled""]
STATUS_WEIGHTS = [2, 6, 2]
CURRENCIES = [""USD"", ""EUR"", ""GBP""]


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
    european = {""BP"", ""RDSA""}
    if ticker in european:
        return _weighted_choice(rng, EXCHANGES, [1, 1, 4, 1, 1])
    return _weighted_choice(rng, EXCHANGES, [4, 4, 2, 1, 1])


def _pick_currency(rng, exchange):
    if exchange in (""NYSE"", ""NASDAQ""):
        return _weighted_choice(rng, CURRENCIES, [8, 1, 1])
    if exchange == ""LSE"":
        return _weighted_choice(rng, CURRENCIES, [3, 2, 4])
    if exchange == ""HKEX"":
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
    return dt.strftime(""%Y-%m-%dT%H:%M:%S."") + f""{dt.microsecond // 1000:03d}Z""


def _is_due(frequency, last_gen_date, today):
    if last_gen_date is None:
        return True
    if frequency == ""DAILY"":
        return last_gen_date < today
    if frequency == ""WEEKLY"":
        days_since = (today - last_gen_date).days
        return days_since >= 7 or today.weekday() == 0
    if frequency == ""MONTHLY"":
        days_since = (today - last_gen_date).days
        return days_since >= 28 or today.day == 1
    return last_gen_date < today


def _filter_instruments(instruments, preferred_sectors):
    if not preferred_sectors:
        return instruments
    sectors = [s.strip() for s in preferred_sectors.split("","") if s.strip()]
    if not sectors:
        return instruments
    filtered = [i for i in instruments if i[0] in sectors]
    return filtered if filtered else instruments


def _filter_exchanges(exchanges, preferred_exchanges):
    if not preferred_exchanges:
        return exchanges
    prefs = [e.strip() for e in preferred_exchanges.split("","") if e.strip()]
    filtered = [e for e in exchanges if e in prefs]
    return filtered if filtered else exchanges


def _risk_params(risk_profile):
    if risk_profile == ""Aggressive"":
        return {""jitter"": 0.12, ""buy_weight"": 5, ""sell_weight"": 5}
    if risk_profile == ""Conservative"":
        return {""jitter"": 0.04, ""buy_weight"": 6, ""sell_weight"": 4}
    return {""jitter"": 0.08, ""buy_weight"": 5, ""sell_weight"": 5}


def generate_trade(rng, account_id, trade_day, instrument, risk, max_val, avail_exchanges):
    category, ticker, name, base_price = instrument

    exchange = _pick_exchange(rng, ticker)
    if avail_exchanges and exchange not in avail_exchanges:
        exchange = rng.choice(avail_exchanges)
    currency = _pick_currency(rng, exchange)

    price = _shake_price(rng, base_price, risk[""jitter""])
    qty = _pick_quantity(rng, price, max_val)
    total = round(qty * price, 2)

    if total > max_val:
        qty = max(1, int(max_val / max(price, 0.01)))
        total = round(qty * price, 2)

    fees = _fees(rng, total)
    hour = rng.randint(9, 16)
    minute = rng.randint(0, 59)
    second = rng.randint(0, 59)
    trade_time = f""{hour:02d}:{minute:02d}:{second:02d}""

    trade_dt = datetime(trade_day.year, trade_day.month, trade_day.day,
                        hour, minute, second, tzinfo=timezone.utc)
    settlement_day = _add_weekdays(trade_day, 2)
    settlement_dt = datetime(settlement_day.year, settlement_day.month, settlement_day.day,
                             tzinfo=timezone.utc)
    snap_delay = timedelta(seconds=rng.randint(30, 12 * 3600))
    snapshot_dt = trade_dt + snap_delay

    side = _weighted_choice(rng, [""Buy"", ""Sell""],
                            [risk[""buy_weight""], risk[""sell_weight""]])

    return {
        ""TRADE_ID"": str(uuid.uuid4()),
        ""ORDER_ID"": str(uuid.uuid4()),
        ""ACCOUNT_ID"": account_id,
        ""TRADE_DATE"": _to_iso_z(trade_dt),
        ""TRADE_TIME"": trade_time,
        ""SETTLEMENT_DATE"": _to_iso_z(settlement_dt),
        ""SNAPSHOT_DATE"": _to_iso_z(snapshot_dt),
        ""INSTRUMENT_IDENTIFIER"": ticker,
        ""INSTRUMENT_NAME"": name,
        ""INSTRUMENT_CATEGORY"": category,
        ""PRICE"": price,
        ""QUANTITY"": qty,
        ""TOTAL_TRADE"": total,
        ""FEES"": fees,
        ""TRADE_SIDE"": side,
        ""TRADE_TYPE"": rng.choice(TRADE_TYPES),
        ""TRADE_CONDITION"": rng.choice(TRADE_CONDITIONS),
        ""TRADE_STATUS"": _weighted_choice(rng, TRADE_STATUSES, STATUS_WEIGHTS),
        ""EXCHANGE"": exchange,
        ""CURRENCY"": currency,
        ""SOURCE_SYSTEM"": rng.choice(SOURCE_SYSTEMS),
        ""COUNTERPARTY_BROKER_ID"": f""BRK{rng.randint(1000, 9999)}"",
        ""REGULATORY_CODE"": f""REG{rng.randint(100, 999)}"",
        ""COMMENTS"": ""Simulated trade"",
    }


def log_execution(session, task_name, status, rows_inserted=0,
                  accounts_processed=0, error_message=None, duration_ms=0):
    session.sql(
        ""INSERT INTO FINS.PUBLIC.TASK_EXECUTION_LOG ""
        ""(TASK_NAME, STATUS, ROWS_INSERTED, ACCOUNTS_PROCESSED, ERROR_MESSAGE, DURATION_MS) ""
        ""VALUES (?, ?, ?, ?, ?, ?)"",
        params=[task_name, status, rows_inserted, accounts_processed,
                error_message, duration_ms]
    ).collect()


def generate_trades(session):
    start_time = time.time()
    task_name = ""DAILY_TRADE_GENERATOR""
    today = date.today()
    rng = random.Random()

    try:
        # Load instruments from reference table
        inst_rows = session.sql(
            ""SELECT SECTOR, TICKER, INSTRUMENT_NAME, BASE_PRICE ""
            ""FROM FINS.PUBLIC.INSTRUMENT_UNIVERSE""
        ).collect()
        INSTRUMENTS = [
            (r[""SECTOR""], r[""TICKER""], r[""INSTRUMENT_NAME""], float(r[""BASE_PRICE""]))
            for r in inst_rows
        ]

        if not INSTRUMENTS:
            log_execution(session, task_name, ""FAILED"", 0, 0,
                          ""No instruments in INSTRUMENT_UNIVERSE"", 0)
            return ""ERROR: INSTRUMENT_UNIVERSE table is empty.""

        configs = session.sql(
            ""SELECT ACCOUNT_ID, ACCOUNT_NAME, ACCOUNT_TYPE, FREQUENCY, ""
            ""TRADES_PER_PERIOD, PREFERRED_SECTORS, PREFERRED_EXCHANGES, ""
            ""RISK_PROFILE, MAX_TRADE_VALUE, LAST_GENERATED_DATE ""
            ""FROM FINS.PUBLIC.TRADE_GENERATION_CONFIG ""
            ""WHERE ACTIVE = TRUE""
        ).collect()

        if not configs:
            log_execution(session, task_name, ""SUCCEEDED"", 0, 0, ""No active configs"",
                          int((time.time() - start_time) * 1000))
            return ""No active configurations found.""

        all_trades = []
        accounts_processed = 0

        for row in configs:
            acct_id = row[""ACCOUNT_ID""]
            frequency = row[""FREQUENCY""] or ""DAILY""
            last_gen = row[""LAST_GENERATED_DATE""]

            if isinstance(last_gen, datetime):
                last_gen = last_gen.date()

            if not _is_due(frequency, last_gen, today):
                continue

            accounts_processed += 1
            trades_count = row[""TRADES_PER_PERIOD""] or 5
            pref_sectors = row[""PREFERRED_SECTORS""]
            pref_exchanges = row[""PREFERRED_EXCHANGES""]
            risk_profile = row[""RISK_PROFILE""] or ""Moderate""
            max_val = float(row[""MAX_TRADE_VALUE""] or 500000)

            instruments = _filter_instruments(INSTRUMENTS, pref_sectors)
            avail_exchanges = _filter_exchanges(EXCHANGES, pref_exchanges)
            risk = _risk_params(risk_profile)

            for _ in range(int(trades_count)):
                inst = rng.choice(instruments)
                trade = generate_trade(rng, acct_id, today, inst, risk,
                                       max_val, avail_exchanges)
                all_trades.append(trade)

            session.sql(
                ""UPDATE FINS.PUBLIC.TRADE_GENERATION_CONFIG ""
                ""SET LAST_GENERATED_DATE = ?, LAST_UPDATED = CURRENT_TIMESTAMP() ""
                ""WHERE ACCOUNT_ID = ?"",
                params=[str(today), acct_id]
            ).collect()

        if all_trades:
            cols = list(all_trades[0].keys())
            values_clauses = []
            all_params = []
            for t in all_trades:
                placeholders = "", "".join([""?""] * len(cols))
                values_clauses.append(f""({placeholders})"")
                for c in cols:
                    all_params.append(t[c])

            col_list = "", "".join(cols)
            values_sql = "", "".join(values_clauses)
            insert_sql = (
                f""INSERT INTO FINS.PUBLIC.FINANCIAL_TRADES ({col_list}) ""
                f""VALUES {values_sql}""
            )
            session.sql(insert_sql, params=all_params).collect()

        duration_ms = int((time.time() - start_time) * 1000)
        total_rows = len(all_trades)

        log_execution(session, task_name, ""SUCCEEDED"", total_rows,
                      accounts_processed, None, duration_ms)

        return (f""Generated {total_rows} trades for {accounts_processed} ""
                f""accounts in {duration_ms}ms. ""
                f""Instrument universe: {len(INSTRUMENTS)} tickers."")

    except Exception as e:
        duration_ms = int((time.time() - start_time) * 1000)
        err_msg = str(e)[:2000]
        log_execution(session, task_name, ""FAILED"", 0, 0, err_msg, duration_ms)
        raise
';
