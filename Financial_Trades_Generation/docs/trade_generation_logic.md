# Trade Generation Logic

## Overview

The trade generation engine produces realistic synthetic trades by combining configurable account parameters with randomized market data. Both the daily (`GENERATE_DAILY_TRADES`) and historical (`GENERATE_HISTORICAL_TRADES`) procedures share the same core logic.

## Frequency Gating

Each account has a `FREQUENCY` setting that determines how often trades are generated:

| Frequency | Rule | Typical Result |
|---|---|---|
| **DAILY** | Generate if `last_gen < today` | Every business day |
| **WEEKLY** | Generate if `last_gen < today` AND (7+ days since last gen OR it's Monday) | ~52 periods/year |
| **MONTHLY** | Generate if `last_gen < today` AND (28+ days since last gen OR it's the 1st) | ~12 periods/year |

The `_is_due()` function in `GENERATE_DAILY_TRADES` implements this logic:

```python
def _is_due(frequency, last_gen_date, today):
    if last_gen_date is None:
        return True
    if last_gen_date >= today:
        return False
    if frequency == "DAILY":
        return True
    if frequency == "WEEKLY":
        days_since = (today - last_gen_date).days
        return days_since >= 7 or today.weekday() == 0
    if frequency == "MONTHLY":
        days_since = (today - last_gen_date).days
        return days_since >= 28 or today.day == 1
    return last_gen_date < today
```

The `last_gen_date >= today` check (added 2026-11-04) makes a same-day rerun skip accounts already done. Before it, the Monday and 1st-of-month rules ignored `LAST_GENERATED_DATE`, so every rerun re-traded all WEEKLY / MONTHLY accounts. A Monday run that hit the 1,800 s timeout and was retried therefore wrote 2–6 full trade sets per account. [Migration 007](../migrations/007_dedupe_monday_retry_trades.sql) removed the extra sets (4,195,785 rows) on 2026-11-04; see [AGENTS.md § Idempotency](../AGENTS.md#idempotency).

A `None` value for `last_gen_date` means the account has never generated trades and is always due.

## Risk Profiles

Each account has a `RISK_PROFILE` that affects price volatility and buy/sell balance:

| Profile | Price Jitter | Buy Weight | Sell Weight | Effect |
|---|---|---|---|---|
| **Aggressive** | +/- 12% | 50% | 50% | High volatility, equal buy/sell |
| **Moderate** | +/- 8% | 50% | 50% | Standard volatility |
| **Conservative** | +/- 4% | 60% | 40% | Low volatility, buy-biased |

### Price Jitter

The execution price is derived from the instrument's `BASE_PRICE` with random jitter:

```python
def _shake_price(rng, base, jitter_pct):
    lo = 1.0 - jitter_pct
    hi = 1.0 + jitter_pct
    return round(base * rng.uniform(lo, hi), 2)
```

For example, an instrument with a base price of $100:
- **Aggressive**: price ranges from $88.00 to $112.00
- **Moderate**: price ranges from $92.00 to $108.00
- **Conservative**: price ranges from $96.00 to $104.00

## Exchange and Currency Weighting

### Exchange Selection

Exchanges are selected with weighted randomness based on the instrument:

| Instrument Type | NYSE | NASDAQ | LSE | HKEX | JPX |
|---|---|---|---|---|---|
| European tickers (BP, RDSA) | 1 | 1 | **4** | 1 | 1 |
| All other tickers | **4** | **4** | 2 | 1 | 1 |

If the account has `PREFERRED_EXCHANGES` set, the selection is filtered to those exchanges.

### Currency Selection

Currency is weighted by the selected exchange:

| Exchange | USD | EUR | GBP |
|---|---|---|---|
| NYSE / NASDAQ | **8** | 1 | 1 |
| LSE | 3 | 2 | **4** |
| HKEX | **6** | 1 | 1 |
| JPX | **5** | 2 | 1 |

## Quantity and Fees

### Quantity Calculation

```python
def _pick_quantity(rng, price, max_notional):
    target = rng.uniform(8000, min(350000, max_notional))
    q = max(1, int(target / max(price, 0.01)))
    return min(q, 2000)
```

- Target notional: random between $8,000 and $350,000 (capped at `MAX_TRADE_VALUE`)
- Quantity: derived from target / price, capped at 2,000 shares
- Minimum: 1 share

### Fee Calculation

```python
def _fees(rng, total):
    bps = rng.uniform(1.5, 25)
    return round(total * (bps / 10000.0), 2)
```

Fees are 1.5 to 25 basis points of the total trade value.

## Trade Attributes

Each generated trade includes:

| Field | Generation Logic |
|---|---|
| `TRADE_ID` | UUID v4 |
| `ORDER_ID` | UUID v4 |
| `TRADE_DATE` | Current business day being processed |
| `TRADE_TIME` | Random time between 09:30 and 16:00 |
| `SETTLEMENT_DATE` | T+2 business days |
| `TRADE_SIDE` | Weighted random: BUY/SELL per risk profile |
| `TRADE_TYPE` | Random: Market Order, Limit Order, Stop Order |
| `TRADE_CONDITION` | Random: None, FOK, IOC |
| `TRADE_STATUS` | Weighted: Pending (20%), Confirmed (60%), Cancelled (20%) |
| `SOURCE_SYSTEM` | Random from 20 platforms (Bloomberg, E*TRADE, Fidelity, ...) |
| `COUNTERPARTY_BROKER_ID` | `BRK-XXXX` (random 4-digit) |
| `REGULATORY_CODE` | `REG-XXXX` (random 4-digit) |
| `COMMENTS` | Auto-generated: "BUY 150 shares of AAPL at $185.23 via NYSE" |

### Source Systems

The 20 simulated source platforms:
Bloomberg, E*TRADE, Fidelity Investments, Interactive Brokers, Charles Schwab, TD Ameritrade, TradeStation, SimCorp, FlexTrade, AlgoTrader, QuantConnect, Rithmic, CQG, IG Group, Saxo Bank, Plus500, Robinhood, Reuters, X_TRADER, OANDA

## Instrument Filtering

If an account has `PREFERRED_SECTORS` set (comma-separated list), the instrument pool is filtered to those sectors. If no instruments match (or the field is empty), the full universe of 2,004 instruments is used.

```python
def _filter_instruments(instruments, preferred_sectors):
    if not preferred_sectors:
        return instruments
    sectors = [s.strip() for s in preferred_sectors.split(",") if s.strip()]
    filtered = [i for i in instruments if i[0] in sectors]
    return filtered if filtered else instruments
```

## Batch Load Pattern

`GENERATE_DAILY_TRADES` accumulates trades as dicts and loads them in batches of 5,000 with `session.write_pandas` (one PUT + COPY per batch):

```python
def _flush_batch(session, batch):
    df = pd.DataFrame(batch)
    for c in DATE_COLS:  # TRADE_DATE, SETTLEMENT_DATE, SNAPSHOT_DATE
        df[c] = pd.to_datetime(df[c], utc=True).dt.date
    df["CREATED_AT"] = pd.to_datetime(df["CREATED_AT"], utc=True).dt.tz_localize(None)
    session.write_pandas(df, "FINANCIAL_TRADES", database="DATA_JEDAIS",
                         schema="FINS__PUBLIC", auto_create_table=False,
                         overwrite=False, use_logical_type=True)
```

`generate_trade` emits the dates as ISO-Z strings. A bind INSERT cast those itself, but COPY from parquet doesn't, so `_flush_batch` parses them. The three date columns keep the UTC calendar day, and `CREATED_AT` (`TIMESTAMP_NTZ`) is stored as naive UTC. The batch is also flushed before each 500-account `LAST_GENERATED_DATE` update (see [Frequency Gating](#frequency-gating)).

Until 2026-11-04 the batch went out as one parameterized multi-row `INSERT INTO ... VALUES (?, ...)`. Snowflake spent ~18 s compiling each 5,000-row statement (0.7 s executing it), so a large Monday run hit the 1,800 s procedure timeout. A `write_pandas` flush of 5,000 rows takes ~2 s.

`GENERATE_HISTORICAL_TRADES` uses the same load in its `flush_batch`, since 2026-11-04 (it used 500-row parameterized INSERTs before). Its rows are lists, its dates come from `isoformat()` with a `+00:00` offset, and its `CREATED_AT` is built naive, so that column is parsed without a timezone. On a 400-account, two-month scratch run it finished in 6.6 s, against 44 s for the INSERT version, with identical per-(account, day) row counts.

## Daily Volume Estimates

With 645 accounts at current settings:

| Frequency | Accounts | Avg Trades/Period | Periods/Year | Est. Annual Trades |
|---|---|---|---|---|
| DAILY | 287 | ~9.0 | ~252 | ~650,000 |
| WEEKLY | 313 | ~5.0 | ~52 | ~81,000 |
| MONTHLY | 45 | ~2.9 | ~12 | ~1,600 |
| **Total** | **645** | | | **~733,000** |

Daily run typically generates ~3,100 trades (287 DAILY accounts * ~9 trades + WEEKLY/MONTHLY accounts when due).
