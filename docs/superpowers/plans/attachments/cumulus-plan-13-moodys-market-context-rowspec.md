# Plan 13 — Moody's Market Context rowspec

> Per-dataset attachment for the dataset template. Authored from the source brainstorming doc + the live `FINS.PUBLIC.INSTRUMENT_UNIVERSE` table populated by the existing trades pipeline.
>
> **Plan 13 is the second non-account-scoped Cumulus dataset** (after Plan 4 / Esri branch-scoped). Rows are keyed by `TICKER`, the existing primary key on `INSTRUMENT_UNIVERSE`. **Daily cadence** — Plan 13 is the second daily-cadence plan (Plan 7 was first), and reuses Plan 7's `_daily_seed` wrapper to fold day-of-month into the seed.
>
> **This is the final Cumulus plan in the rollout** (13 of 13).

## Mimics

**Moody's Investors Service / Moody's Analytics market context** — vendor-grade credit ratings + market-context signals for publicly traded instruments. Real Moody's publishes long-form rating reports, sector outlook PDFs, and minute-resolution market data feeds; we mirror 12 fields that hit the demo's "what's the current credit posture and recent price behavior of this instrument?" use case.

The combination of **slow-moving credit signals** (rating, outlook) and **fast-moving market signals** (daily volatility, 30-day price change) is what makes Moody's distinctive vs the per-account vendors — Plan 13 is the only Cumulus dataset that mixes annual-cadence editorial fields with daily-cadence market fields in a single row.

## Audience

**Instrument-scoped, not account-scoped.** Every instrument in `FINS.PUBLIC.INSTRUMENT_UNIVERSE` gets one row per profile date. The audience SQL is the simplest of any Cumulus dataset:

```sql
SELECT * FROM FINS.PUBLIC.INSTRUMENT_UNIVERSE
```

**Live cardinality (probed 2026-05-28):** **2,004 instruments** (no IS_ACTIVE filter — the column doesn't exist; every row in `INSTRUMENT_UNIVERSE` is in audience).

**Spec drift caught at draft time.** The umbrella spec §3.3 documents the audience as `WHERE IS_ACTIVE = TRUE` keyed by `INSTRUMENT_ID`. The actual `INSTRUMENT_UNIVERSE` schema (live-discovered) is `(TICKER VARCHAR(10) PK, INSTRUMENT_NAME VARCHAR(200), SECTOR VARCHAR(50), BASE_PRICE FLOAT)` — there is no `INSTRUMENT_ID` and no `IS_ACTIVE`. Plan 13 keys on `TICKER` and reads the full table unconditionally. Same shape of fix as Plan 8's `run_ts.date()` vs `month_start.date()` rowspec drift: noted at draft time, no spec amendment needed since this is the only consumer.

## Table: `FINS.PUBLIC.MOODYS_MARKET_CONTEXT`

| Column | Type | Null? | Source / synthesis |
|---|---|---|---|
| `TICKER` | VARCHAR(10) | NOT NULL | Instrument.TICKER (PK on `INSTRUMENT_UNIVERSE`) |
| `PROFILE_DATE` | DATE | NOT NULL | The market-context run date (UTC). Daily-bucketed determinism. |
| `CREDIT_RATING` | VARCHAR(4) | NOT NULL | Moody's-style: `Aaa` / `Aa1` / `Aa2` / `Aa3` / `A1` / `A2` / `A3` / `Baa1` / `Baa2` / `Baa3` / `Ba1` / `Ba2` / `Ba3` / `B1` / `B2` / `B3` / `Caa1` / `Caa2` / `Caa3` / `Ca` / `C` / `NR`. **Year-stable** per ticker. Distribution biased by SECTOR. |
| `RATING_OUTLOOK` | VARCHAR(12) | NOT NULL | `Stable` / `Positive` / `Negative` / `Developing` / `Watch`. **Year-stable** per ticker (rare changes). |
| `OUTLOOK_LAST_CHANGED_DATE` | DATE | NULL | Date of last outlook change (year-stable). NULL when RATING_OUTLOOK has been `Stable` for the entire ticker history. |
| `MARKET_CAP_USD` | NUMBER(18,2) | NOT NULL | $50M-$3T. Year-stable base from BASE_PRICE × synthesized shares-outstanding, with small daily noise from cumulative 30-day price change. |
| `DAILY_VOLATILITY_PCT` | NUMBER(5,2) | NOT NULL | 0.00-25.00. Daily-bucketed; ~0-3% normal, occasional 5-10% spikes. |
| `THIRTY_DAY_PRICE_CHANGE_PCT` | NUMBER(5,2) | NOT NULL | -25.00 to +25.00. Daily-bucketed; re-derived from 30 days of synthesized daily moves. |
| `FIFTY_TWO_WEEK_HIGH_PRICE` | NUMBER(12,4) | NOT NULL | Year-stable. BASE_PRICE × random multiplier in [1.10, 1.85]. |
| `FIFTY_TWO_WEEK_LOW_PRICE` | NUMBER(12,4) | NOT NULL | Year-stable. BASE_PRICE × random multiplier in [0.55, 0.95]. |
| `RATING_AGENCY_FLAG_COUNT` | NUMBER(2,0) | NOT NULL | Year-stable. Count of recent rating-watch events; 0-3 typically (most tickers = 0). |
| `LIQUIDITY_TIER` | VARCHAR(10) | NOT NULL | `Tier 1` / `Tier 2` / `Tier 3` / `Illiquid`. Year-stable. Biased by MARKET_CAP_USD. |
| `LAST_DATA_REFRESH_AT` | TIMESTAMP_NTZ(9) | NOT NULL | Profile-bucketed (= PROFILE_DATE 00:00:00) so mid-day re-runs are byte-identical. |
| `GENERATED_AT` | TIMESTAMP_NTZ(9) | NOT NULL | Profile-bucketed for byte-identical mid-day re-runs. |

13 columns total: 12 NOT NULL + 1 NULLable (`OUTLOOK_LAST_CHANGED_DATE`). Single NULLable column is the simplest NULL footprint of any Cumulus dataset (vs Plan 7's two NULLable, Plan 8's two NULLable).

## Primary key

`(TICKER, PROFILE_DATE)` — one row per instrument per market-context day. Re-runs same day replace.

**Note:** the PK column is `TICKER`, NOT `ACCOUNT_ID` and NOT `INSTRUMENT_ID`. The DC field mapping in T7 will map `TICKER` → `ticker__c` (a non-FK field; this DMO is not joinable to `ssot__Account__dlm`). Joins from instrument-scoped to account-scoped happen elsewhere — the trades pipeline already maintains the `(account, ticker, position)` graph.

**Storage trade-off:** same as Plan 7 — re-runs same day MERGE-replace, so live storage stays at ~2,004 rows. **No daily history retained**. A real Moody's feed would carry full daily history; the Cumulus demo doesn't, to keep storage bounded.

## Salt strategy — two salts (back to Plan 5 shape)

After Plan 8's single-salt simplification, Plan 13 returns to the two-salt pattern:

| Salt | Bucket | Used for |
|---|---|---|
| `moodys` | day-bucketed (`(year, month, day)` via `_daily_seed` wrapper) | Daily-bucketed fields: DAILY_VOLATILITY_PCT, THIRTY_DAY_PRICE_CHANGE_PCT, MARKET_CAP_USD daily noise component, ADVERSE_MEDIA_CATEGORIES-style category lists if any |
| `moodys_year` | year-bucketed (`datetime(run_ts.year, 1, 1)`) | Year-stable fields: CREDIT_RATING, RATING_OUTLOOK, OUTLOOK_LAST_CHANGED_DATE, FIFTY_TWO_WEEK_HIGH/LOW_PRICE, RATING_AGENCY_FLAG_COUNT, LIQUIDITY_TIER, MARKET_CAP_USD year-stable base |

This is the same shape as Plan 5 (which had `corelogic` + `corelogic_year` for monthly + year-stable mortgage-rate). Plan 13 inherits the structural pattern but applies it at daily cadence instead of monthly.

**Note on `_daily_seed`** — Cumulus_Common's `seed_for` is Y-M-only (Plan 0 design choice). For daily cadence, reuse Plan 7's wrapper inlined into the SP module:

```python
def _daily_seed(ticker, run_ts):
    """Day-bucketed seed wrapper. Folds the calendar day into the ticker
    parameter so we get a unique seed per (ticker, calendar day) without
    modifying cumulus_common.seed_for. Identical pattern to Plan 7."""
    day_str = run_ts.strftime("%Y%m%d")
    return seed_for(f"{ticker}|{day_str}", "moodys", run_ts)
```

Plan 7 and Plan 13 are the only two daily-cadence plans; both inline the same wrapper. No need to promote it to Cumulus_Common — the duplication is two places, both stable.

## Hybrid year-stable + daily model

Like Plan 7, Plan 13 splits its row into two timing tiers:

| Tier | Fields | Cadence reasoning |
|---|---|---|
| Year-stable | CREDIT_RATING, RATING_OUTLOOK, OUTLOOK_LAST_CHANGED_DATE, FIFTY_TWO_WEEK_HIGH/LOW_PRICE, RATING_AGENCY_FLAG_COUNT, LIQUIDITY_TIER | Real Moody's editorial signals don't shift day-to-day. A credit rating change is news; the demo would lose plausibility if `AAPL.CREDIT_RATING` flipped from `Aa1` to `Aa2` randomly mid-week. |
| Daily-bucketed | DAILY_VOLATILITY_PCT, THIRTY_DAY_PRICE_CHANGE_PCT, LAST_DATA_REFRESH_AT | These ARE day-to-day signals — that's the whole reason for the daily cadence. |
| Hybrid | MARKET_CAP_USD | Year-stable base shares-outstanding, with small daily noise scaled by cumulative 30-day move. Most instruments stay within ±3% of their year-stable base on a given day. |

This mirrors Plan 7's hybrid (year-stable RISK_JURISDICTION + daily component flags) — the demo logic is "tell me what's stable for this entity vs what changed today," and that's only legible if some fields actually stay stable.

## SECTOR → CREDIT_RATING bias mapping

Real Moody's distributions vary by sector — financials cluster in A/Baa, regulated utilities cluster Aa/A, tech ranges wide (Aaa for blue-chip down to B for unprofitable growth names). Our 22-rating + NR taxonomy with sector bias:

```python
_RATINGS = [
    "Aaa", "Aa1", "Aa2", "Aa3", "A1", "A2", "A3",
    "Baa1", "Baa2", "Baa3", "Ba1", "Ba2", "Ba3",
    "B1", "B2", "B3", "Caa1", "Caa2", "Caa3",
    "Ca", "C", "NR",
]

# Per-sector probability mass over _RATINGS (must sum to ~1.0)
_SECTOR_RATING_BIAS = {
    "Financials":   {"A1": 0.10, "A2": 0.18, "A3": 0.20, "Baa1": 0.18, "Baa2": 0.14, "Baa3": 0.08, "Ba1": 0.05, "NR": 0.07},
    "Technology":   {"Aaa": 0.04, "Aa1": 0.04, "Aa2": 0.06, "A1": 0.10, "A2": 0.10, "A3": 0.10, "Baa1": 0.08, "Baa2": 0.08, "Baa3": 0.08, "Ba1": 0.06, "Ba2": 0.06, "B1": 0.05, "B2": 0.05, "NR": 0.10},
    "Healthcare":   {"Aa3": 0.05, "A1": 0.10, "A2": 0.14, "A3": 0.16, "Baa1": 0.16, "Baa2": 0.12, "Baa3": 0.08, "Ba1": 0.05, "Ba2": 0.04, "B1": 0.03, "NR": 0.07},
    "Energy":       {"A2": 0.05, "A3": 0.08, "Baa1": 0.14, "Baa2": 0.18, "Baa3": 0.16, "Ba1": 0.12, "Ba2": 0.08, "Ba3": 0.06, "B1": 0.05, "Caa1": 0.03, "NR": 0.05},
    "Utilities":    {"Aa3": 0.08, "A1": 0.18, "A2": 0.20, "A3": 0.18, "Baa1": 0.14, "Baa2": 0.10, "Baa3": 0.06, "NR": 0.06},
    "Consumer":     {"Aa2": 0.04, "A1": 0.08, "A2": 0.12, "A3": 0.14, "Baa1": 0.16, "Baa2": 0.14, "Baa3": 0.10, "Ba1": 0.08, "Ba2": 0.06, "B1": 0.04, "NR": 0.04},
    "Industrials":  {"A1": 0.06, "A2": 0.10, "A3": 0.14, "Baa1": 0.18, "Baa2": 0.16, "Baa3": 0.12, "Ba1": 0.08, "Ba2": 0.06, "B1": 0.04, "NR": 0.06},
}
_DEFAULT_RATING_BIAS = {"A3": 0.15, "Baa1": 0.20, "Baa2": 0.20, "Baa3": 0.15, "Ba1": 0.10, "Ba2": 0.08, "B1": 0.04, "NR": 0.08}

def _credit_rating(ticker, sector, run_ts):
    """Year-stable credit rating biased by sector."""
    seed = seed_for(
        ticker + "_rating", "moodys_year",
        datetime(run_ts.year, 1, 1),
    )
    rng = random.Random(seed)
    bias = _SECTOR_RATING_BIAS.get(sector, _DEFAULT_RATING_BIAS)
    ratings = list(bias.keys())
    weights = list(bias.values())
    return rng.choices(ratings, weights=weights)[0]
```

## RATING_OUTLOOK + OUTLOOK_LAST_CHANGED_DATE

```python
_OUTLOOKS = ["Stable", "Positive", "Negative", "Developing", "Watch"]
_OUTLOOK_WEIGHTS = [0.78, 0.08, 0.08, 0.03, 0.03]

def _rating_outlook(ticker, run_ts):
    """Year-stable outlook. ~78% Stable; rare changes."""
    seed = seed_for(
        ticker + "_outlook", "moodys_year",
        datetime(run_ts.year, 1, 1),
    )
    rng = random.Random(seed)
    return rng.choices(_OUTLOOKS, weights=_OUTLOOK_WEIGHTS)[0]


def _outlook_last_changed_date(ticker, outlook, run_ts):
    """NULL when outlook is Stable for entire history; else year-stable date."""
    if outlook == "Stable":
        # 80% of Stable instruments have NULL (never changed); 20% have a stale date
        seed = seed_for(
            ticker + "_outlook_changed", "moodys_year",
            datetime(run_ts.year, 1, 1),
        )
        rng = random.Random(seed)
        if rng.random() < 0.80:
            return None
        # Stale date: 6-36 months ago
        days_ago = rng.randint(180, 1095)
        return (run_ts - timedelta(days=days_ago)).date()
    # Non-Stable outlook: change date in the last 0-12 months
    seed = seed_for(
        ticker + "_outlook_changed", "moodys_year",
        datetime(run_ts.year, 1, 1),
    )
    rng = random.Random(seed)
    days_ago = rng.randint(1, 365)
    return (run_ts - timedelta(days=days_ago)).date()
```

## FIFTY_TWO_WEEK_HIGH/LOW_PRICE

```python
def _52_week_band(ticker, base_price, run_ts):
    """Year-stable 52-week high/low. Invariant: high >= low; high >= base_price * 0.5 (sanity floor)."""
    seed = seed_for(
        ticker + "_52w", "moodys_year",
        datetime(run_ts.year, 1, 1),
    )
    rng = random.Random(seed)
    high_mult = rng.uniform(1.10, 1.85)
    low_mult = rng.uniform(0.55, 0.95)
    high = round(base_price * high_mult, 4)
    low = round(base_price * low_mult, 4)
    # Sanity floor — never let high drop below base_price * 0.5 even with weird base prices
    high = max(high, round(base_price * 0.5, 4))
    return high, low
```

## DAILY_VOLATILITY_PCT + THIRTY_DAY_PRICE_CHANGE_PCT

```python
def _daily_volatility(ticker, sector, run_ts):
    """Daily-bucketed. ~0-3% normal, occasional 5-10% spikes (5% chance), capped at 25%."""
    seed = _daily_seed(ticker + "_vol", run_ts)
    rng = random.Random(seed)
    if rng.random() < 0.05:
        # Spike day
        return round(rng.uniform(5.0, 10.0), 2)
    return round(rng.uniform(0.1, 3.0), 2)


def _thirty_day_change(ticker, run_ts):
    """Daily-bucketed. Synthesized as cumulative 30-day move, range [-25, +25]."""
    seed = _daily_seed(ticker + "_30d", run_ts)
    rng = random.Random(seed)
    # Truncated normal-like, mean 0, std ~6
    raw = sum(rng.uniform(-1, 1) for _ in range(30))  # rough cumulative drift
    return round(max(-25.0, min(25.0, raw)), 2)
```

## MARKET_CAP_USD

```python
def _market_cap(ticker, base_price, sector, run_ts):
    """Year-stable shares × BASE_PRICE, with small daily noise.

    Range: $50M (micro-cap) to $3T (mega-cap). Sector-biased shares-outstanding.
    """
    year_seed = seed_for(
        ticker + "_shares", "moodys_year",
        datetime(run_ts.year, 1, 1),
    )
    year_rng = random.Random(year_seed)
    # Log-uniform across 6 orders of magnitude (1M shares to 1B shares)
    log_shares = year_rng.uniform(6.0, 9.5)
    shares = 10 ** log_shares
    base_cap = base_price * shares
    # Daily noise: scale by today's 30-day change
    change_pct = _thirty_day_change(ticker, run_ts)
    cap = base_cap * (1 + change_pct / 100)
    # Clamp to [$50M, $3T]
    return round(max(50_000_000, min(3_000_000_000_000, cap)), 2)
```

## RATING_AGENCY_FLAG_COUNT

```python
def _rating_agency_flag_count(ticker, run_ts):
    """Year-stable. Most tickers = 0 (no recent rating-watch events)."""
    seed = seed_for(
        ticker + "_flags", "moodys_year",
        datetime(run_ts.year, 1, 1),
    )
    rng = random.Random(seed)
    return rng.choices([0, 1, 2, 3], weights=[0.85, 0.10, 0.04, 0.01])[0]
```

## LIQUIDITY_TIER

Year-stable; biased by MARKET_CAP_USD year-stable base (re-derived without daily noise to avoid tier flips):

```python
def _liquidity_tier(ticker, base_price, run_ts):
    """Year-stable, MARKET_CAP_USD-driven."""
    year_seed = seed_for(
        ticker + "_shares", "moodys_year",
        datetime(run_ts.year, 1, 1),
    )
    year_rng = random.Random(year_seed)
    log_shares = year_rng.uniform(6.0, 9.5)
    base_cap = base_price * (10 ** log_shares)
    if base_cap >= 50_000_000_000:   return "Tier 1"   # mega-cap
    if base_cap >= 5_000_000_000:    return "Tier 2"   # large-cap
    if base_cap >= 500_000_000:      return "Tier 3"   # mid-cap
    return "Illiquid"
```

## Bias logic for `_row_for` (skeleton)

The row factory takes an **instrument record** (TICKER, INSTRUMENT_NAME, SECTOR, BASE_PRICE), not an account anchor:

```python
import random
from datetime import datetime, timedelta

def _row_for(instrument, run_ts):
    """Plan 13: row factory takes an instrument record, not an account anchor.

    instrument is a Snowpark Row with columns from INSTRUMENT_UNIVERSE:
        TICKER, INSTRUMENT_NAME, SECTOR, BASE_PRICE.
    """
    ticker = instrument["TICKER"]
    sector = instrument["SECTOR"] or "Unknown"
    base_price = float(instrument["BASE_PRICE"]) if instrument["BASE_PRICE"] is not None else 100.0

    day_start = run_ts.replace(hour=0, minute=0, second=0, microsecond=0)

    # 1. Year-stable editorial fields
    rating = _credit_rating(ticker, sector, run_ts)
    outlook = _rating_outlook(ticker, run_ts)
    outlook_changed = _outlook_last_changed_date(ticker, outlook, run_ts)
    high_52w, low_52w = _52_week_band(ticker, base_price, run_ts)
    flag_count = _rating_agency_flag_count(ticker, run_ts)
    liquidity = _liquidity_tier(ticker, base_price, run_ts)

    # 2. Daily-bucketed market signals
    daily_vol = _daily_volatility(ticker, sector, run_ts)
    thirty_day = _thirty_day_change(ticker, run_ts)

    # 3. Hybrid: year-stable shares × today's price drift
    market_cap = _market_cap(ticker, base_price, sector, run_ts)

    return {
        "TICKER":                       ticker,
        "PROFILE_DATE":                 day_start.date(),
        "CREDIT_RATING":                rating,
        "RATING_OUTLOOK":               outlook,
        "OUTLOOK_LAST_CHANGED_DATE":    outlook_changed,
        "MARKET_CAP_USD":               market_cap,
        "DAILY_VOLATILITY_PCT":         daily_vol,
        "THIRTY_DAY_PRICE_CHANGE_PCT":  thirty_day,
        "FIFTY_TWO_WEEK_HIGH_PRICE":    high_52w,
        "FIFTY_TWO_WEEK_LOW_PRICE":     low_52w,
        "RATING_AGENCY_FLAG_COUNT":     flag_count,
        "LIQUIDITY_TIER":               liquidity,
        "LAST_DATA_REFRESH_AT":         day_start,
        "GENERATED_AT":                 day_start,
    }
```

## No `_anchor_in_audience` predicate

Every instrument in `INSTRUMENT_UNIVERSE` is in audience (no IS_ACTIVE column, no other filter). The SP's audience-filter step is a no-op compared to Plans 1-3/5/6/8 — there is no per-row audience predicate. The input-shape check is "TICKER is non-empty"; everything else passes through.

## Per-row invariants (load-bearing)

All checked in L1 property tests and L3 smoke:

- `FIFTY_TWO_WEEK_HIGH_PRICE >= FIFTY_TWO_WEEK_LOW_PRICE`.
- `FIFTY_TWO_WEEK_HIGH_PRICE >= BASE_PRICE * 0.5` (sanity floor).
- `DAILY_VOLATILITY_PCT in [0, 25]`.
- `THIRTY_DAY_PRICE_CHANGE_PCT in [-25, 25]`.
- `MARKET_CAP_USD > 0`.
- `CREDIT_RATING` in canonical 22-value set + `NR`.
- `RATING_OUTLOOK` in canonical 5-value set.
- `LIQUIDITY_TIER` in canonical 4-value set.
- `LAST_DATA_REFRESH_AT.date() == PROFILE_DATE` (same-day refresh).
- `OUTLOOK_LAST_CHANGED_DATE <= run_ts.date()` when not NULL (no future dates).

## Anchor-influence test target (template L1 property #4) — instrument-scoped

Plan 13 deviates from the template's account-anchor shape. The L1 conftest reads `INSTRUMENT_UNIVERSE`'s schema (TICKER, INSTRUMENT_NAME, SECTOR, BASE_PRICE) and builds a **synthetic 10-instrument fixture** covering the major SECTOR values (Financials, Technology, Healthcare, Energy, Utilities, Consumer, Industrials + 3 unknowns/Default). Cumulus_Common's `SAMPLE_ANCHORS` is unused for Plan 13.

Five property classes:

1. **Range invariants** (per-row) — DAILY_VOLATILITY_PCT in [0, 25]; THIRTY_DAY_PRICE_CHANGE_PCT in [-25, 25]; MARKET_CAP_USD > 0; RATING_AGENCY_FLAG_COUNT in [0, 3].
2. **Vocabulary invariants** (per-row) — CREDIT_RATING in 23-value set (22 ratings + NR); RATING_OUTLOOK in 5-value set; LIQUIDITY_TIER in 4-value set.
3. **Year-stable invariants** (per-instrument) — same TICKER, two different days within the same calendar year → CREDIT_RATING, RATING_OUTLOOK, FIFTY_TWO_WEEK_HIGH_PRICE, FIFTY_TWO_WEEK_LOW_PRICE, RATING_AGENCY_FLAG_COUNT, LIQUIDITY_TIER all identical.
4. **Cross-field invariants** (per-row) — FIFTY_TWO_WEEK_HIGH_PRICE >= FIFTY_TWO_WEEK_LOW_PRICE; FIFTY_TWO_WEEK_HIGH_PRICE >= BASE_PRICE * 0.5; LAST_DATA_REFRESH_AT.date() == PROFILE_DATE.
5. **Schema contract** — output dict keys match the 13 columns; types match DDL.

The L1 conftest defines the synthetic fixture as a list of dict-like records mimicking Snowpark Row shape:

```python
SAMPLE_INSTRUMENTS = [
    {"TICKER": "AAPL", "INSTRUMENT_NAME": "Apple Inc",  "SECTOR": "Technology", "BASE_PRICE": 175.50},
    {"TICKER": "JPM",  "INSTRUMENT_NAME": "JPMorgan",   "SECTOR": "Financials", "BASE_PRICE": 195.20},
    {"TICKER": "JNJ",  "INSTRUMENT_NAME": "Johnson&J",  "SECTOR": "Healthcare", "BASE_PRICE": 152.10},
    {"TICKER": "XOM",  "INSTRUMENT_NAME": "ExxonMobil", "SECTOR": "Energy",     "BASE_PRICE": 110.40},
    {"TICKER": "DUK",  "INSTRUMENT_NAME": "Duke Energy","SECTOR": "Utilities",  "BASE_PRICE":  95.30},
    {"TICKER": "PG",   "INSTRUMENT_NAME": "P&G",        "SECTOR": "Consumer",   "BASE_PRICE": 168.70},
    {"TICKER": "GE",   "INSTRUMENT_NAME": "GE",         "SECTOR": "Industrials","BASE_PRICE": 165.20},
    {"TICKER": "TINY", "INSTRUMENT_NAME": "TinyCorp",   "SECTOR": "Technology", "BASE_PRICE":   2.50},
    {"TICKER": "HUGE", "INSTRUMENT_NAME": "HugeCorp",   "SECTOR": "Financials", "BASE_PRICE": 980.00},
    {"TICKER": "UNKN", "INSTRUMENT_NAME": "UnknownCo",  "SECTOR": None,         "BASE_PRICE":  50.00},
]
```

Two of the ten cover sector edge cases: `TINY` (very low base price, tests the FIFTY_TWO_WEEK sanity floor) and `UNKN` (None SECTOR, tests `_DEFAULT_RATING_BIAS` fallback path).

## Boring case (must still emit)

A "boring" mid-cap financial — `SECTOR='Financials'`, `BASE_PRICE=$50`:

- `CREDIT_RATING`: most likely `Baa1` or `Baa2` (combined ~32% of Financials per the bias table)
- `RATING_OUTLOOK`: `Stable` (78%)
- `OUTLOOK_LAST_CHANGED_DATE`: NULL (80% × 78% = 62% of Stable instruments have NULL)
- `LIQUIDITY_TIER`: `Tier 3` (mid-cap from the year-stable shares draw)
- `RATING_AGENCY_FLAG_COUNT`: 0 (85%)
- `DAILY_VOLATILITY_PCT`: ~0.5-3.0% (95% non-spike day)
- `MARKET_CAP_USD`: ~$500M-$5B range
- `FIFTY_TWO_WEEK_HIGH_PRICE`: ~$55-$92
- `FIFTY_TWO_WEEK_LOW_PRICE`: ~$28-$47

**No instrument is dropped.** The audience is all 2,004 instruments — every TICKER gets a row daily. Even instruments with NULL SECTOR or unusual BASE_PRICE values get a row because the row factory uses defensive defaults (`sector or "Unknown"`, `base_price=100.0` if None).

## Cadence

**Daily.** CRON: `'USING CRON 0 1 * * * UTC'` (01:00 UTC daily). The seed bucket is `(run_ts.year, run_ts.month, run_ts.day)` via the `_daily_seed` wrapper, so re-runs on the same calendar day produce identical rows.

**Why 01:00 UTC:** earlier than Plan 7's 06:00 UTC because Moody's market context is published pre-open in Tokyo (00:00 UTC = market open in Asia). 01:00 UTC gives the SP a 30-min buffer after the (synthetic) data publication. This is also well clear of Plan 7's 06:00 UTC slot, so the two daily plans don't contend on the same warehouse.

## Volume

**~2,004 rows/day** (one per instrument per market-context day). Re-runs same day MERGE-replace, so live storage stays at ~2,004 rows. Lower per-day volume than Plan 7 (36,813), but at daily cadence the cumulative-if-history-were-retained shape is ~730,000/year — comparable to Plans 5-6 monthly history would have looked, just without the retention.

## Out of scope

- **Real Moody's Investors Service / Moody's Analytics license / data fidelity.** Our 13-column subset is recognisable but not license-grade; no actual rating committee output.
- **Full credit watch event timelines.** Real Moody's tracks every rating action, every outlook change, every press release. We only carry counts (RATING_AGENCY_FLAG_COUNT) and the most recent OUTLOOK_LAST_CHANGED_DATE.
- **Multi-rating-agency consensus.** Real institutional credit views combine Moody's + S&P + Fitch into a consensus rating. We only model Moody's-style.
- **Option-implied volatility.** Our DAILY_VOLATILITY_PCT is realized vol; real Moody's Analytics + market data feeds carry IV surfaces. Out of scope.
- **Sector-specific signals** (CDS spreads for financials, default probabilities for energy, ESG scores). Plan 2 (MSCI) covers the ESG axis at the issuer level; Plan 13 stays at the instrument level.
- **Daily history retention.** Same trade-off as Plan 7 — MERGE-replace keeps storage bounded; a real feed would keep daily snapshots for backtesting.
