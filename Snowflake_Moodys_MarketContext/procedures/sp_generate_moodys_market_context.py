"""Moody's Investors Service / Moody's Analytics-style synthetic market-context generator.

Snowpark Python stored procedure registered as
FINS.PUBLIC.SP_GENERATE_MOODYS_MARKET_CONTEXT. **FINAL Cumulus plan
(Plan 13 of 13)** — most-divergent instantiation of the dataset template
(four structural deviations from the Plan 8 baseline).

Audience: INSTRUMENT-SCOPED (not account-scoped). Reads
          FINS.PUBLIC.INSTRUMENT_UNIVERSE directly — every instrument
          emits exactly one row per profile day (~2,004 rows/day).
Cadence:  DAILY (01:00 UTC daily, pre-Asia-open). Second daily-cadence
          plan after Plan 7 — reuses Plan 7's `_daily_seed` wrapper inlined.
Salts:
  - "moodys"       (day-bucketed; daily market signals)
  - "moodys_year"  (year-stable; editorial signals + shares-outstanding base)

Plan:    docs/superpowers/plans/2026-05-28-cumulus-plan-13-moodys-market-context.md
Rowspec: docs/superpowers/plans/attachments/cumulus-plan-13-moodys-market-context-rowspec.md

Schema-drift caught at draft time: spec described audience as
`WHERE IS_ACTIVE = TRUE` keyed by INSTRUMENT_ID; live INSTRUMENT_UNIVERSE
has TICKER PK and no IS_ACTIVE column. Plan 13 keys on TICKER and reads
the full table unconditionally. **No `_anchor_in_audience` predicate** —
every instrument is in audience; the only input-shape check is that
TICKER is non-empty.

Snowflake digit-leading column rename: rowspec's `52_WEEK_HIGH_PRICE`,
`52_WEEK_LOW_PRICE`, `30_DAY_PRICE_CHANGE_PCT` are renamed to
`FIFTY_TWO_WEEK_HIGH_PRICE`, `FIFTY_TWO_WEEK_LOW_PRICE`,
`THIRTY_DAY_PRICE_CHANGE_PCT` at the DDL / output dict / MERGE level —
Snowflake identifiers cannot begin with a digit.

NOTE on day-bucketing: cumulus_common.seed_for buckets on Y-M, so to
obtain distinct seeds across days within the same month we encode the
day in the ticker parameter (which IS folded into the SHA-256 hash).
Identical pattern to Plan 7; the wrapper is inlined here rather than
promoted to cumulus_common because Plan 7 + Plan 13 are the only two
daily-cadence plans.
"""
from __future__ import annotations

import random
import uuid
from datetime import date, datetime, timedelta
from typing import Any

# Locally + in Snowflake, cumulus_common is shipped via pip install -e or
# the IMPORTS clause on CREATE PROCEDURE.
from cumulus_common import seed_for, assert_coverage


# -------------------------------------------------------------------
# Constants — these MUST stay in sync with the rowspec attachment
# -------------------------------------------------------------------

TABLE                = "FINS.PUBLIC.MOODYS_MARKET_CONTEXT"
TASK_NAME            = "TASK_DAILY_MOODYS_MARKET_CONTEXT"
DATASET_SALT         = "moodys"        # daily-bucketed via _daily_seed wrapper
DATASET_SALT_YEAR    = "moodys_year"   # year-stable via datetime(year, 1, 1)

# Plan 13 has no audience predicate — every instrument in INSTRUMENT_UNIVERSE
# is in audience. No DISTINCT (TICKER is PK) and no WHERE clause (no IS_ACTIVE
# column on the live table; spec drift caught at draft time).
AUDIENCE_SQL = "SELECT * FROM FINS.PUBLIC.INSTRUMENT_UNIVERSE"
COVERAGE_SQL = "SELECT COUNT(*) FROM FINS.PUBLIC.INSTRUMENT_UNIVERSE"

# 14-column output contract (kept in sync with the table DDL by the L1 schema test).
# 12 NOT NULL + 1 NULLable (OUTLOOK_LAST_CHANGED_DATE). 0 BOOLEAN — simplest
# NULL/Boolean footprint of any Cumulus dataset.
EXPECTED_OUTPUT_COLUMNS: frozenset[str] = frozenset({
    "TICKER", "PROFILE_DATE", "CREDIT_RATING", "RATING_OUTLOOK",
    "OUTLOOK_LAST_CHANGED_DATE", "MARKET_CAP_USD",
    "DAILY_VOLATILITY_PCT", "THIRTY_DAY_PRICE_CHANGE_PCT",
    "FIFTY_TWO_WEEK_HIGH_PRICE", "FIFTY_TWO_WEEK_LOW_PRICE",
    "RATING_AGENCY_FLAG_COUNT", "LIQUIDITY_TIER",
    "LAST_DATA_REFRESH_AT", "GENERATED_AT",
})


# -------------------------------------------------------------------
# Day-bucket helper — truncates a run timestamp to its calendar-day start.
# -------------------------------------------------------------------

def _day_start(run_ts: datetime) -> datetime:
    """Bucket run_ts to its calendar-day start (UTC). Mid-day re-runs
    re-bucket to the same instant so the seed (and therefore the row) is
    byte-identical."""
    return run_ts.replace(hour=0, minute=0, second=0, microsecond=0)


def _daily_seed(ticker: str, run_ts: datetime) -> bytes:
    """Daily seed wrapper. Folds the calendar day into the ticker parameter
    so we get a unique seed per (ticker, calendar day) without modifying
    cumulus_common.seed_for. Identical pattern to Plan 7.
    """
    day = _day_start(run_ts)
    return seed_for(
        f"{ticker}|{day.strftime('%Y%m%d')}", DATASET_SALT, day
    )


def _year_seed(ticker: str, run_ts: datetime, suffix: str = "") -> bytes:
    """Year-stable seed for editorial fields. Suffix is folded into the ticker
    parameter so each year-stable field gets its own independent rng stream
    (rating, outlook, 52w band, flags, shares-outstanding base, etc.)."""
    return seed_for(
        ticker + suffix, DATASET_SALT_YEAR,
        datetime(run_ts.year, 1, 1),
    )


# -------------------------------------------------------------------
# Sector -> Credit Rating bias tables (year-stable distribution)
# -------------------------------------------------------------------

_RATINGS = [
    "Aaa", "Aa1", "Aa2", "Aa3", "A1", "A2", "A3",
    "Baa1", "Baa2", "Baa3", "Ba1", "Ba2", "Ba3",
    "B1", "B2", "B3", "Caa1", "Caa2", "Caa3",
    "Ca", "C", "NR",
]

# Per-sector probability mass over the rating taxonomy. Keys are a subset of
# _RATINGS; missing keys imply zero probability for that sector. Each map
# sums to ~1.0. Distributions reflect rough real-world Moody's patterns:
# Financials cluster A/Baa, Utilities cluster Aa/A, Technology spans wide.
_SECTOR_RATING_BIAS = {
    "Financials":   {"A1": 0.10, "A2": 0.18, "A3": 0.20, "Baa1": 0.18, "Baa2": 0.14, "Baa3": 0.08, "Ba1": 0.05, "NR": 0.07},
    "Technology":   {"Aaa": 0.04, "Aa1": 0.04, "Aa2": 0.06, "A1": 0.10, "A2": 0.10, "A3": 0.10, "Baa1": 0.08, "Baa2": 0.08, "Baa3": 0.08, "Ba1": 0.06, "Ba2": 0.06, "B1": 0.05, "B2": 0.05, "NR": 0.10},
    "Healthcare":   {"Aa3": 0.05, "A1": 0.10, "A2": 0.14, "A3": 0.16, "Baa1": 0.16, "Baa2": 0.12, "Baa3": 0.08, "Ba1": 0.05, "Ba2": 0.04, "B1": 0.03, "NR": 0.07},
    "Energy":       {"A2": 0.05, "A3": 0.08, "Baa1": 0.14, "Baa2": 0.18, "Baa3": 0.16, "Ba1": 0.12, "Ba2": 0.08, "Ba3": 0.06, "B1": 0.05, "Caa1": 0.03, "NR": 0.05},
    "Utilities":    {"Aa3": 0.08, "A1": 0.18, "A2": 0.20, "A3": 0.18, "Baa1": 0.14, "Baa2": 0.10, "Baa3": 0.06, "NR": 0.06},
    "Consumer":     {"Aa2": 0.04, "A1": 0.08, "A2": 0.12, "A3": 0.14, "Baa1": 0.16, "Baa2": 0.14, "Baa3": 0.10, "Ba1": 0.08, "Ba2": 0.06, "B1": 0.04, "NR": 0.04},
    "Industrials":  {"A1": 0.06, "A2": 0.10, "A3": 0.14, "Baa1": 0.18, "Baa2": 0.16, "Baa3": 0.12, "Ba1": 0.08, "Ba2": 0.06, "B1": 0.04, "NR": 0.06},
}
# Default fallback for None / unknown SECTOR — Healthcare-like Baa cluster.
_DEFAULT_RATING_BIAS = {
    "A3": 0.15, "Baa1": 0.20, "Baa2": 0.20, "Baa3": 0.15,
    "Ba1": 0.10, "Ba2": 0.08, "B1": 0.04, "NR": 0.08,
}

_OUTLOOKS = ["Stable", "Positive", "Negative", "Developing", "Watch"]
_OUTLOOK_WEIGHTS = [0.78, 0.08, 0.08, 0.03, 0.03]

_LIQUIDITY_TIERS = ("Tier 1", "Tier 2", "Tier 3", "Illiquid")


# -------------------------------------------------------------------
# Year-stable editorial helpers — use _year_seed.
# These fields don't drift day-to-day; the cross-day invariant test
# is load-bearing for the hybrid year-stable + daily model.
# -------------------------------------------------------------------

def _credit_rating(ticker: str, sector: Any, run_ts: datetime) -> str:
    """Year-stable credit rating biased by SECTOR. Falls back to the default
    Baa-cluster bias when SECTOR is None / unknown."""
    seed = _year_seed(ticker, run_ts, "_rating")
    rng = random.Random(seed)
    bias = _SECTOR_RATING_BIAS.get(sector, _DEFAULT_RATING_BIAS)
    ratings = list(bias.keys())
    weights = list(bias.values())
    return rng.choices(ratings, weights=weights)[0]


def _rating_outlook(ticker: str, run_ts: datetime) -> str:
    """Year-stable outlook. ~78% Stable; rare changes."""
    seed = _year_seed(ticker, run_ts, "_outlook")
    rng = random.Random(seed)
    return rng.choices(_OUTLOOKS, weights=_OUTLOOK_WEIGHTS)[0]


def _outlook_last_changed_date(ticker: str, outlook: str,
                                run_ts: datetime) -> Any:
    """NULL when outlook is Stable AND the year-stable RNG draw is in the
    80% never-changed bucket; else year-stable date in the past.

    Anchored on `datetime(run_ts.year, 1, 1)` not `run_ts` so the output is
    purely year-derived — same TICKER + same calendar year produces the
    same date regardless of mid-year run_ts. Folding run_ts into the
    subtraction would leak daily entropy and break the year-stable
    invariant the rowspec requires.

    Returns None or a datetime.date.
    """
    seed = _year_seed(ticker, run_ts, "_outlook_changed")
    rng = random.Random(seed)
    year_start = datetime(run_ts.year, 1, 1)
    if outlook == "Stable":
        # 80% of Stable instruments have NULL (never changed); 20% have a
        # stale 6-36-month-ago date relative to year_start (year-stable).
        if rng.random() < 0.80:
            return None
        days_ago = rng.randint(180, 1095)
        return (year_start - timedelta(days=days_ago)).date()
    # Non-Stable outlook: change date in the prior 12 months relative to
    # year_start (year-stable).
    days_ago = rng.randint(1, 365)
    return (year_start - timedelta(days=days_ago)).date()


def _fifty_two_week_high(ticker: str, base_price: float,
                          run_ts: datetime) -> float:
    """Year-stable 52-week high. base_price * uniform(1.10, 1.85), with a
    sanity floor of base_price * 0.5 in case of weird base prices."""
    seed = _year_seed(ticker, run_ts, "_52w_high")
    rng = random.Random(seed)
    high = round(base_price * rng.uniform(1.10, 1.85), 4)
    return max(high, round(base_price * 0.5, 4))


def _fifty_two_week_low(ticker: str, base_price: float, run_ts: datetime,
                         fifty_two_week_high: float) -> float:
    """Year-stable 52-week low. base_price * uniform(0.55, 0.95), clamped
    so it never exceeds the 52-week high (defensive — should never bind
    given the multiplier ranges)."""
    seed = _year_seed(ticker, run_ts, "_52w_low")
    rng = random.Random(seed)
    low = round(base_price * rng.uniform(0.55, 0.95), 4)
    return min(low, fifty_two_week_high)


def _rating_agency_flag_count(ticker: str, run_ts: datetime) -> int:
    """Year-stable count of recent rating-watch / credit-action events.
    Range [0, 3]; biased toward 0 (most tickers have no recent events)."""
    seed = _year_seed(ticker, run_ts, "_flags")
    rng = random.Random(seed)
    return rng.choices([0, 1, 2, 3], weights=[0.85, 0.10, 0.04, 0.01])[0]


def _year_stable_log_shares(ticker: str, run_ts: datetime) -> float:
    """Year-stable log10(shares-outstanding) draw — used by both
    `_market_cap_usd` and `_liquidity_tier`. Centralizing the draw keeps
    LIQUIDITY_TIER tied to the same year-stable shares base that the
    market cap derives from (without daily noise).

    Range [6.0, 9.5] -> shares from 1M to ~3.16B.
    """
    seed = _year_seed(ticker, run_ts, "_shares")
    rng = random.Random(seed)
    return rng.uniform(6.0, 9.5)


def _liquidity_tier(ticker: str, base_price: float,
                     run_ts: datetime) -> str:
    """Year-stable liquidity tier. Re-derives the year-stable shares base
    WITHOUT the daily noise to avoid tier flips on small daily moves.
    """
    base_cap = base_price * (10 ** _year_stable_log_shares(ticker, run_ts))
    if base_cap >= 50_000_000_000:
        return "Tier 1"   # mega-cap
    if base_cap >= 5_000_000_000:
        return "Tier 2"   # large-cap
    if base_cap >= 500_000_000:
        return "Tier 3"   # mid-cap
    return "Illiquid"


# -------------------------------------------------------------------
# Daily-bucketed market signals — use _daily_seed via the per-row rng.
# These ARE day-to-day signals; the daily cadence is the whole point.
# -------------------------------------------------------------------

def _daily_volatility_pct(ticker: str, run_ts: datetime,
                           rng: random.Random) -> float:
    """Daily-bucketed realized volatility (%). Range [0, 25].
    ~95% normal days produce 0.1-3.0% vol; ~5% spike days produce 5-10%.
    The hard cap is 25% — extreme tail events on synthetic data shouldn't
    exceed that without breaking the rowspec range invariant.
    """
    if rng.random() < 0.05:
        return round(rng.uniform(5.0, 10.0), 2)
    return round(rng.uniform(0.1, 3.0), 2)


def _thirty_day_price_change_pct(ticker: str, run_ts: datetime,
                                   rng: random.Random) -> float:
    """Daily-bucketed cumulative 30-day price change (%). Range [-25, +25].
    Synthesized as a sum of 30 random moves in [-1, 1]; the truncated sum
    approximates a mean-zero, std-~6 distribution. Clipped hard to ±25%.
    """
    raw = sum(rng.uniform(-1.0, 1.0) for _ in range(30))
    return round(max(-25.0, min(25.0, raw)), 2)


# -------------------------------------------------------------------
# Hybrid: year-stable shares-outstanding base, daily price drift.
# A real ticker's shares outstanding doesn't change daily, but its market
# cap moves with daily price action — so the hybrid is the load-bearing
# plausibility piece for this field.
# -------------------------------------------------------------------

def _market_cap_usd(ticker: str, base_price: float, run_ts: datetime,
                     thirty_day_change_pct: float) -> float:
    """Hybrid market cap. Year-stable shares-outstanding base × current
    BASE_PRICE × (1 + thirty_day_change_pct/100). Clamped to [$50M, $3T].
    """
    log_shares = _year_stable_log_shares(ticker, run_ts)
    shares = 10 ** log_shares
    base_cap = base_price * shares
    cap = base_cap * (1 + thirty_day_change_pct / 100.0)
    return round(max(50_000_000.0, min(3_000_000_000_000.0, cap)), 2)


# -------------------------------------------------------------------
# _row_for — substantive synthesis (per rowspec)
# -------------------------------------------------------------------

def _row_for(instrument: dict, run_ts: datetime) -> dict:
    """Pure function: instrument record -> fact row. Deterministic on
    (ticker, day_start) for daily fields and (ticker, year) for year-stable.

    Reads only the four INSTRUMENT_UNIVERSE columns: TICKER, INSTRUMENT_NAME,
    SECTOR, BASE_PRICE. There is no `_anchor_in_audience` predicate — every
    instrument is in audience. The only input-shape check is non-empty TICKER.

    SECTOR may be None (defensive default to fallback bias) and BASE_PRICE
    may be None (defensive default to 100.0). The L1 fixture's UNKN row
    exercises both defaults.
    """
    ticker = instrument.get("TICKER")
    if not ticker:
        raise ValueError(f"instrument missing TICKER: {instrument!r}")

    sector = instrument.get("SECTOR")
    raw_base = instrument.get("BASE_PRICE")
    base_price = float(raw_base) if raw_base is not None else 100.0

    day = _day_start(run_ts)
    daily_seed = _daily_seed(ticker, run_ts)
    rng = random.Random(daily_seed)

    # 1. Year-stable editorial signals (rating, outlook, 52w band, flags, tier).
    rating = _credit_rating(ticker, sector, run_ts)
    outlook = _rating_outlook(ticker, run_ts)
    outlook_changed = _outlook_last_changed_date(ticker, outlook, run_ts)
    high_52w = _fifty_two_week_high(ticker, base_price, run_ts)
    low_52w = _fifty_two_week_low(ticker, base_price, run_ts, high_52w)
    flag_count = _rating_agency_flag_count(ticker, run_ts)
    liquidity = _liquidity_tier(ticker, base_price, run_ts)

    # 2. Daily-bucketed market signals.
    daily_vol = _daily_volatility_pct(ticker, run_ts, rng)
    thirty_day = _thirty_day_price_change_pct(ticker, run_ts, rng)

    # 3. Hybrid market cap — year-stable shares × today's drift.
    market_cap = _market_cap_usd(ticker, base_price, run_ts, thirty_day)

    return {
        "TICKER":                       ticker,
        "PROFILE_DATE":                 day.date(),
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
        "LAST_DATA_REFRESH_AT":         day,
        "GENERATED_AT":                 day,
    }


# -------------------------------------------------------------------
# Entry point — invoked by FINS.PUBLIC.SP_RUN_WITH_RETRY -> SP_GENERATE_MOODYS_MARKET_CONTEXT
# -------------------------------------------------------------------

def main(session: Any) -> str:
    """The 5-step canonical pattern: read -> build -> MERGE -> assert -> log.

    Step 2 is adjusted vs Plans 1-3/5/6/8 — the audience is INSTRUMENT_UNIVERSE
    rows (not V_ACCOUNT_ANCHORS), the row factory takes an instrument record
    (not an account anchor), and there is no `_anchor_in_audience` predicate.
    """
    log_id = str(uuid.uuid4())
    started = datetime.utcnow()
    rows_inserted, accounts_processed, status, err = 0, 0, "SUCCEEDED", None

    try:
        # 1. Read audience — full INSTRUMENT_UNIVERSE (no WHERE clause).
        audience = session.sql(AUDIENCE_SQL).collect()
        # `accounts_processed` is the TASK_EXECUTION_LOG column name; for
        # Plan 13 it stores the distinct instrument count (1:1 emit per
        # instrument per day, so it also matches the row count).
        accounts_processed = len(audience)

        # 2. Build deterministic rows; tolerate up to 1% per-row failures.
        records, errors = [], []
        for row in audience:
            try:
                records.append(_row_for(_instrument_to_dict(row), started))
            except Exception as exc:
                # `row.TICKER` is the PK on INSTRUMENT_UNIVERSE; safe to read.
                errors.append((getattr(row, "TICKER", None), str(exc)[:200]))
        max_tolerated = max(10, len(audience) // 100)
        if len(errors) > max_tolerated:
            raise RuntimeError(
                f"row factory failed on {len(errors)}/{len(audience)} instruments "
                f"(tolerance {max_tolerated}); first: {errors[0] if errors else 'n/a'}"
            )
        if errors:
            err = (
                f"row factory failed on {len(errors)}/{len(audience)} instruments; "
                f"first: {errors[0]}"
            )

        # 3. Idempotent MERGE on composite PK (TICKER, PROFILE_DATE).
        rows_inserted = _merge(session, records)

        # 4. Coverage assertion — 1:1 audience-vs-actual.
        actual_sql = (
            f"SELECT COUNT(DISTINCT TICKER) FROM {TABLE}"
        )
        assert_coverage(session, COVERAGE_SQL, actual_sql)

    except Exception as exc:
        status = "FAILED"
        err = str(exc)[:4000]
        raise

    finally:
        # 5. Always log — success or failure.
        duration_ms = int((datetime.utcnow() - started).total_seconds() * 1000)
        session.sql(
            """
            INSERT INTO FINS.PUBLIC.TASK_EXECUTION_LOG
                (LOG_ID, TASK_NAME, EXECUTION_TIME, STATUS, ROWS_INSERTED,
                 ACCOUNTS_PROCESSED, ERROR_MESSAGE, DURATION_MS)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            params=[log_id, TASK_NAME, started, status,
                    rows_inserted, accounts_processed, err, duration_ms],
        ).collect()

    return f"{TASK_NAME}: {status} rows={rows_inserted} instruments={accounts_processed}"


def _instrument_to_dict(row: Any) -> dict:
    """Snowpark Row -> plain dict so _row_for can be tested with dict literals.
    Same shape as Plan 7's `_anchor_to_dict`; renamed for instrument-scoped
    semantics."""
    if isinstance(row, dict):
        return row
    if hasattr(row, "asDict"):
        return dict(row.asDict())
    if hasattr(row, "_fields"):
        return {f.name: row[f.name] for f in row._fields}
    return dict(row)


# -------------------------------------------------------------------
# _merge — idempotent MERGE on composite PK (TICKER, PROFILE_DATE)
# -------------------------------------------------------------------

def _merge(session: Any, records: list[dict]) -> int:
    """MERGE records into TABLE. Returns rows MERGED.

    Implementation: write_pandas -> staging table -> MERGE statement.
    The staging table is overwrite-truncated each call so re-runs produce
    consistent state.

    Casts in the source SELECT (defensive against write_pandas auto-typing
    on an empty target):
      - GENERATED_AT, LAST_DATA_REFRESH_AT — datetime64[ns] mis-types as
        NUMBER(38,0) (nanoseconds-since-epoch); cast back via TO_TIMESTAMP_NTZ.
      - PROFILE_DATE, OUTLOOK_LAST_CHANGED_DATE — ::DATE casts so the target
        DATE columns are satisfied even if pandas typed them as object/string.

    The single NULLable column (OUTLOOK_LAST_CHANGED_DATE) passes through;
    pandas + write_pandas serialize Python None -> SQL NULL transparently.
    No BOOLEAN columns — simplest cast pattern of any Cumulus dataset.
    """
    if not records:
        return 0

    import pandas as pd
    df = pd.DataFrame(records)
    # Force date-typed columns to pandas datetime dtype so write_pandas
    # auto_create_table doesn't mis-type all-NULL columns as NUMBER(38,0).
    # OUTLOOK_LAST_CHANGED_DATE is ~80% NULL when RATING_OUTLOOK='Stable';
    # at fixture-scale (8 rows) it can be 100% NULL on some seeds, which
    # write_pandas serialises as NUMBER and breaks the DATE-typed MERGE.
    for col in ("PROFILE_DATE", "OUTLOOK_LAST_CHANGED_DATE"):
        df[col] = pd.to_datetime(df[col])
    staging = "MOODYS_MARKET_CONTEXT_STAGING"

    session.write_pandas(
        df, staging,
        auto_create_table=True, overwrite=True,
        database="FINS", schema="PUBLIC",
    )

    merge_sql = f"""
        MERGE INTO FINS.PUBLIC.MOODYS_MARKET_CONTEXT tgt
        USING (
            SELECT
                TICKER,
                TO_DATE(TO_TIMESTAMP_NTZ(PROFILE_DATE::NUMBER / 1000000000)) AS PROFILE_DATE,
                CREDIT_RATING,
                RATING_OUTLOOK,
                CASE WHEN OUTLOOK_LAST_CHANGED_DATE IS NULL THEN NULL
                     ELSE TO_DATE(TO_TIMESTAMP_NTZ(OUTLOOK_LAST_CHANGED_DATE::NUMBER / 1000000000))
                END AS OUTLOOK_LAST_CHANGED_DATE,
                MARKET_CAP_USD,
                DAILY_VOLATILITY_PCT,
                THIRTY_DAY_PRICE_CHANGE_PCT,
                FIFTY_TWO_WEEK_HIGH_PRICE,
                FIFTY_TWO_WEEK_LOW_PRICE,
                RATING_AGENCY_FLAG_COUNT,
                LIQUIDITY_TIER,
                TO_TIMESTAMP_NTZ(LAST_DATA_REFRESH_AT::NUMBER / 1000000000) AS LAST_DATA_REFRESH_AT,
                TO_TIMESTAMP_NTZ(GENERATED_AT::NUMBER / 1000000000) AS GENERATED_AT
            FROM FINS.PUBLIC.{staging}
        ) src
        ON tgt.TICKER = src.TICKER
           AND tgt.PROFILE_DATE = src.PROFILE_DATE
        WHEN MATCHED THEN UPDATE SET
            CREDIT_RATING                = src.CREDIT_RATING,
            RATING_OUTLOOK               = src.RATING_OUTLOOK,
            OUTLOOK_LAST_CHANGED_DATE    = src.OUTLOOK_LAST_CHANGED_DATE,
            MARKET_CAP_USD               = src.MARKET_CAP_USD,
            DAILY_VOLATILITY_PCT         = src.DAILY_VOLATILITY_PCT,
            THIRTY_DAY_PRICE_CHANGE_PCT  = src.THIRTY_DAY_PRICE_CHANGE_PCT,
            FIFTY_TWO_WEEK_HIGH_PRICE    = src.FIFTY_TWO_WEEK_HIGH_PRICE,
            FIFTY_TWO_WEEK_LOW_PRICE     = src.FIFTY_TWO_WEEK_LOW_PRICE,
            RATING_AGENCY_FLAG_COUNT     = src.RATING_AGENCY_FLAG_COUNT,
            LIQUIDITY_TIER               = src.LIQUIDITY_TIER,
            LAST_DATA_REFRESH_AT         = src.LAST_DATA_REFRESH_AT,
            GENERATED_AT                 = src.GENERATED_AT
        WHEN NOT MATCHED THEN INSERT (
            TICKER, PROFILE_DATE, CREDIT_RATING, RATING_OUTLOOK,
            OUTLOOK_LAST_CHANGED_DATE, MARKET_CAP_USD,
            DAILY_VOLATILITY_PCT, THIRTY_DAY_PRICE_CHANGE_PCT,
            FIFTY_TWO_WEEK_HIGH_PRICE, FIFTY_TWO_WEEK_LOW_PRICE,
            RATING_AGENCY_FLAG_COUNT, LIQUIDITY_TIER,
            LAST_DATA_REFRESH_AT, GENERATED_AT
        ) VALUES (
            src.TICKER, src.PROFILE_DATE, src.CREDIT_RATING, src.RATING_OUTLOOK,
            src.OUTLOOK_LAST_CHANGED_DATE, src.MARKET_CAP_USD,
            src.DAILY_VOLATILITY_PCT, src.THIRTY_DAY_PRICE_CHANGE_PCT,
            src.FIFTY_TWO_WEEK_HIGH_PRICE, src.FIFTY_TWO_WEEK_LOW_PRICE,
            src.RATING_AGENCY_FLAG_COUNT, src.LIQUIDITY_TIER,
            src.LAST_DATA_REFRESH_AT, src.GENERATED_AT
        )
    """
    rows = session.sql(merge_sql).collect()
    return int(rows[0][0]) if rows else len(records)
