-- =============================================================================
-- Procedure: GENERATE_HISTORICAL_TRADES(START_DATE DATE, END_DATE DATE)
-- Database:  FINS.PUBLIC
-- Purpose:   Backfills historical trades for a given date range. Supports
--            resume capability by reading existing trade dates per account
--            to initialize frequency gating state. Logs progress every 50
--            business days. Designed for bulk execution on LARGE_LOAD (X-Large)
--            warehouse with chunked date ranges.
-- Usage:     CALL GENERATE_HISTORICAL_TRADES('2024-06-01'::DATE, '2024-12-31'::DATE);
-- Language:  Python 3.11 (Snowpark)
-- Execution: EXECUTE AS OWNER
-- =============================================================================

CREATE OR REPLACE PROCEDURE "GENERATE_HISTORICAL_TRADES"("START_DATE" DATE, "END_DATE" DATE)
RETURNS VARCHAR
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
PACKAGES = ('snowflake-snowpark-python')
HANDLER = 'generate_historical'
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


def _is_due(frequency, last_gen_date, current_date):
    if last_gen_date is None:
        return True
    if frequency == ""DAILY"":
        return last_gen_date < current_date
    if frequency == ""WEEKLY"":
        days_since = (current_date - last_gen_date).days
        return days_since >= 7 or current_date.weekday() == 0
    if frequency == ""MONTHLY"":
        days_since = (current_date - last_gen_date).days
        return days_since >= 28 or current_date.day == 1
    return last_gen_date < current_date


def _risk_params(risk_profile):
    if risk_profile == ""Aggressive"":
        return {""jitter"": 0.12, ""buy_weight"": 5, ""sell_weight"": 5}
    if risk_profile == ""Conservative"":
        return {""jitter"": 0.04, ""buy_weight"": 6, ""sell_weight"": 4}
    return {""jitter"": 0.08, ""buy_weight"": 5, ""sell_weight"": 5}


def _filter_instruments(instruments, preferred_sectors):
    if not preferred_sectors:
        return instruments
    sectors = [s.strip() for s in preferred_sectors.split("","") if s.strip()]
    if not sectors:
        return instruments
    filtered = [i for i in instruments if i[0] in sectors]
    return filtered if filtered else instruments


def generate_historical(session, START_DATE, END_DATE):
    start_time = time.time()
    task_name = ""HISTORICAL_BACKFILL""

    try:
        if isinstance(START_DATE, datetime):
            start_d = START_DATE.date()
        elif isinstance(START_DATE, date):
            start_d = START_DATE
        else:
            start_d = date.fromisoformat(str(START_DATE))

        if isinstance(END_DATE, datetime):
            end_d = END_DATE.date()
        elif isinstance(END_DATE, date):
            end_d = END_DATE
        else:
            end_d = date.fromisoformat(str(END_DATE))

        # Load instruments
        inst_rows = session.sql(
            ""SELECT SECTOR, TICKER, INSTRUMENT_NAME, BASE_PRICE ""
            ""FROM FINS.PUBLIC.INSTRUMENT_UNIVERSE""
        ).collect()
        instruments = [(r[""SECTOR""], r[""TICKER""], r[""INSTRUMENT_NAME""], float(r[""BASE_PRICE""])) for r in inst_rows]

        # Load active accounts
        acct_rows = session.sql(
            ""SELECT ACCOUNT_ID, ACCOUNT_NAME, FREQUENCY, TRADES_PER_PERIOD, ""
            ""PREFERRED_SECTORS, RISK_PROFILE, MAX_TRADE_VALUE ""
            ""FROM FINS.PUBLIC.TRADE_GENERATION_CONFIG WHERE ACTIVE = TRUE""
        ).collect()
        accounts = []
        for r in acct_rows:
            accounts.append({
                ""id"": r[""ACCOUNT_ID""],
                ""freq"": r[""FREQUENCY""],
                ""trades"": int(r[""TRADES_PER_PERIOD""]),
                ""sectors"": r[""PREFERRED_SECTORS""],
                ""risk"": r[""RISK_PROFILE""] or ""Moderate"",
                ""max_val"": float(r[""MAX_TRADE_VALUE""] or 500000),
            })

        # Resume: get last trade date per account from existing data before start_d
        last_gen = {a[""id""]: None for a in accounts}
        resume_rows = session.sql(
            f""SELECT ACCOUNT_ID, MAX(TRADE_DATE)::DATE AS LAST_DATE ""
            f""FROM FINS.PUBLIC.FINANCIAL_TRADES ""
            f""WHERE TRADE_DATE < ''{start_d.isoformat()}''::TIMESTAMP_TZ ""
            f""GROUP BY ACCOUNT_ID""
        ).collect()
        for r in resume_rows:
            aid = r[""ACCOUNT_ID""]
            if aid in last_gen:
                ld = r[""LAST_DATE""]
                if isinstance(ld, datetime):
                    last_gen[aid] = ld.date()
                elif isinstance(ld, date):
                    last_gen[aid] = ld

        # Build business days
        business_days = []
        cur = start_d
        while cur <= end_d:
            if cur.weekday() < 5:
                business_days.append(cur)
            cur += timedelta(days=1)

        total_biz_days = len(business_days)
        total_inserted = 0
        batch = []
        batch_size = 500
        flush_count = 0

        cols = (""TRADE_ID, ORDER_ID, ACCOUNT_ID, TRADE_DATE, TRADE_TIME, ""
                ""SETTLEMENT_DATE, SNAPSHOT_DATE, INSTRUMENT_IDENTIFIER, ""
                ""INSTRUMENT_NAME, INSTRUMENT_CATEGORY, PRICE, QUANTITY, ""
                ""TOTAL_TRADE, FEES, TRADE_SIDE, TRADE_TYPE, TRADE_CONDITION, ""
                ""TRADE_STATUS, EXCHANGE, CURRENCY, SOURCE_SYSTEM, ""
                ""COUNTERPARTY_BROKER_ID, REGULATORY_CODE, COMMENTS, CREATED_AT"")
        n_cols = 25
        placeholders = "", "".join([""?""] * n_cols)

        def flush_batch():
            nonlocal batch, flush_count, total_inserted
            if not batch:
                return
            values_clauses = [f""({placeholders})""] * len(batch)
            params = []
            for row in batch:
                params.extend(row)
            sql = f""INSERT INTO FINS.PUBLIC.FINANCIAL_TRADES ({cols}) VALUES {'', ''.join(values_clauses)}""
            session.sql(sql, params=params).collect()
            total_inserted += len(batch)
            flush_count += 1
            batch = []

        for day_idx, trade_day in enumerate(business_days):
            for acct in accounts:
                if not _is_due(acct[""freq""], last_gen[acct[""id""]], trade_day):
                    continue
                last_gen[acct[""id""]] = trade_day
                risk = _risk_params(acct[""risk""])
                acct_instruments = _filter_instruments(instruments, acct[""sectors""])
                rng = random.Random(hash((acct[""id""], trade_day.toordinal())))

                for _ in range(acct[""trades""]):
                    instrument = rng.choice(acct_instruments)
                    category, ticker, inst_name, base_price = instrument
                    exchange = _pick_exchange(rng, ticker)
                    currency = _pick_currency(rng, exchange)
                    price = _shake_price(rng, base_price, risk[""jitter""])
                    quantity = _pick_quantity(rng, price, acct[""max_val""])
                    total_trade = round(price * quantity, 2)
                    fee = _fees(rng, total_trade)
                    side = _weighted_choice(rng, [""Buy"", ""Sell""], [risk[""buy_weight""], risk[""sell_weight""]])
                    trade_type = rng.choice(TRADE_TYPES)
                    condition = rng.choice(TRADE_CONDITIONS)
                    status = _weighted_choice(rng, TRADE_STATUSES, STATUS_WEIGHTS)
                    source = rng.choice(SOURCE_SYSTEMS)
                    broker = f""BRK{rng.randint(1000, 9999)}""
                    reg_code = f""REG{rng.randint(100, 999)}""

                    trade_hour = rng.randint(9, 15)
                    trade_min = rng.randint(0, 59)
                    trade_sec = rng.randint(0, 59)
                    if trade_hour == 9:
                        trade_min = rng.randint(30, 59)

                    trade_dt = datetime(trade_day.year, trade_day.month, trade_day.day,
                                        trade_hour, trade_min, trade_sec, tzinfo=timezone.utc)
                    trade_time_str = f""{trade_hour:02d}:{trade_min:02d}:{trade_sec:02d}""
                    settlement_d = _add_weekdays(trade_day, 2)
                    settlement_dt = datetime(settlement_d.year, settlement_d.month, settlement_d.day, tzinfo=timezone.utc)
                    snap_hour = rng.randint(16, 21)
                    snapshot_dt = datetime(trade_day.year, trade_day.month, trade_day.day,
                                           snap_hour, rng.randint(0, 59), 0, tzinfo=timezone.utc)
                    created_at = datetime(trade_day.year, trade_day.month, trade_day.day,
                                           rng.randint(20, 23), rng.randint(0, 59), rng.randint(0, 59))

                    row = [
                        str(uuid.uuid4()), str(uuid.uuid4()), acct[""id""],
                        trade_dt.isoformat(), trade_time_str,
                        settlement_dt.isoformat(), snapshot_dt.isoformat(),
                        ticker, inst_name, category,
                        price, quantity, total_trade, fee,
                        side, trade_type, condition, status,
                        exchange, currency, source, broker, reg_code,
                        ""Simulated trade"", created_at.isoformat()
                    ]
                    batch.append(row)
                    if len(batch) >= batch_size:
                        flush_batch()

            if (day_idx + 1) % 50 == 0:
                elapsed = int((time.time() - start_time) * 1000)
                session.sql(
                    ""INSERT INTO FINS.PUBLIC.TASK_EXECUTION_LOG ""
                    ""(TASK_NAME, STATUS, ROWS_INSERTED, ACCOUNTS_PROCESSED, ERROR_MESSAGE, DURATION_MS) ""
                    ""VALUES (?, ?, ?, ?, ?, ?)"",
                    params=[task_name, ""IN_PROGRESS"", total_inserted, len(accounts),
                            f""Chunk {start_d}-{end_d}: Day {day_idx+1}/{total_biz_days}"", elapsed]
                ).collect()

        flush_batch()
        duration_ms = int((time.time() - start_time) * 1000)

        session.sql(
            ""INSERT INTO FINS.PUBLIC.TASK_EXECUTION_LOG ""
            ""(TASK_NAME, STATUS, ROWS_INSERTED, ACCOUNTS_PROCESSED, ERROR_MESSAGE, DURATION_MS) ""
            ""VALUES (?, ?, ?, ?, ?, ?)"",
            params=[task_name, ""SUCCEEDED"", total_inserted, len(accounts), None, duration_ms]
        ).collect()

        return (f""Historical backfill complete. ""
                f""Generated {total_inserted:,} trades across {total_biz_days} business days ""
                f""for {len(accounts)} accounts. ""
                f""Date range: {start_d} to {end_d}. ""
                f""Batches: {flush_count}. Duration: {duration_ms:,}ms."")

    except Exception as e:
        duration_ms = int((time.time() - start_time) * 1000)
        err_msg = str(e)[:2000]
        try:
            session.sql(
                ""INSERT INTO FINS.PUBLIC.TASK_EXECUTION_LOG ""
                ""(TASK_NAME, STATUS, ROWS_INSERTED, ACCOUNTS_PROCESSED, ERROR_MESSAGE, DURATION_MS) ""
                ""VALUES (?, ?, ?, ?, ?, ?)"",
                params=[task_name, ""FAILED"", total_inserted, len(accounts), err_msg, duration_ms]
            ).collect()
        except:
            pass
        raise
';
