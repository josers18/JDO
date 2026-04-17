# Trade Generation Logic

## Overview

The trade generation engine produces realistic synthetic trades by combining configurable account parameters with randomized market data. Both the daily (`GENERATE_DAILY_TRADES`) and historical (`GENERATE_HISTORICAL_TRADES`) procedures share the same core logic.

## Frequency Gating

Each account has a `FREQUENCY` setting that determines how often trades are generated:

| Frequency | Rule | Typical Result |
|---|---|---|
| **DAILY** | Generate if `last_gen < today` | Every business day |
| **WEEKLY** | Generate if 7+ days since last gen, OR it's Monday | ~52 periods/year |
| **MONTHLY** | Generate if 28+ days since last gen, OR it's the 1st | ~12 periods/year |

The `_is_due()` function implements this logic:

```python
def _is_due(frequency, last_gen_date, current_date):
    if last_gen_date is None:
        return True
    if frequency == "DAILY":
        return last_gen_date < current_date
    if frequency == "WEEKLY":
        days_since = (current_date - last_gen_date).days
        return days_since >= 7 or current_date.weekday() == 0
    if frequency == "MONTHLY":
        days_since = (current_date - last_gen_date).days
        return days_since >= 28 or current_date.day == 1
    return last_gen_date < current_date
```

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

## Batch Insert Pattern

Trades are accumulated in Python and inserted in batches of 500:

```python
batch_size = 500
for i in range(0, len(all_trades), batch_size):
    batch = all_trades[i:i+batch_size]
    values_clauses = ", ".join(["(?, ?, ?, ..., ?)"] * len(batch))
    params = [val for trade in batch for val in trade]
    session.sql(f"INSERT INTO FINANCIAL_TRADES (...) VALUES {values_clauses}", params=params).collect()
```

This pattern was chosen over DataFrame inserts because:
- Predictable memory usage (500-row batches)
- No Snowpark DataFrame overhead for simple inserts
- Compatible with `EXECUTE AS OWNER` restriction (no temp tables)

## Daily Volume Estimates

With 645 accounts at current settings:

| Frequency | Accounts | Avg Trades/Period | Periods/Year | Est. Annual Trades |
|---|---|---|---|---|
| DAILY | 287 | ~9.0 | ~252 | ~650,000 |
| WEEKLY | 313 | ~5.0 | ~52 | ~81,000 |
| MONTHLY | 45 | ~2.9 | ~12 | ~1,600 |
| **Total** | **645** | | | **~733,000** |

Daily run typically generates ~3,100 trades (287 DAILY accounts * ~9 trades + WEEKLY/MONTHLY accounts when due).
