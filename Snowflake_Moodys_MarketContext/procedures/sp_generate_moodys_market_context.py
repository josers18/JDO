"""Moody''s Investors Service / Moody''s Analytics-style synthetic market-context generator.

Snowpark Python stored procedure registered as
FINS.PUBLIC.SP_GENERATE_MOODYS_MARKET_CONTEXT.

**v2 RE-SCOPE (Plan 13 of 13 — most divergent rewrite of the dataset
template).** The original Plan 13 v1 module was instrument-scoped (TICKER
PK, ~2,004 rows/day, keyed off INSTRUMENT_UNIVERSE) but those rows did not
tie back to customer profiles. v2 re-scopes to per-BUSINESS-account
(ACCOUNT_ID PK) so every business customer profile gets a Moody''s-style
commercial credit-risk + market-context tile that updates daily.

Audience: ACCOUNT_TYPE_FLAG = ''BUSINESS''   (~11,389 distinct anchors)
Cadence:  DAILY (01:00 UTC daily, pre-Asia-open). Reuses the daily-cadence
          template from Plan 7 (`_daily_seed` wrapper folds day-of-month
          into the ACCOUNT_ID parameter so the seed is unique per calendar
          day even though `cumulus_common.seed_for` only buckets on Y-M).
Salts:
  - "moodys"       (daily-bucketed; market signals — volatility, 30-day
                    change, daily MARKET_CAP noise component)
  - "moodys_year"  (year-stable; editorial signals — rating, outlook,
                    52-week band, liquidity tier, revenue multiple)

Hybrid year-stable + daily field model (same shape as Plan 7):
  - Year-stable: CREDIT_RATING (INDUSTRY-biased), RATING_OUTLOOK,
                 OUTLOOK_LAST_CHANGED_DATE, FIFTY_TWO_WEEK_HIGH/LOW_USD,
                 RATING_AGENCY_FLAG_COUNT, LIQUIDITY_TIER, MARKET_CAP base
                 (revenue multiple draw)
  - Daily:       DAILY_VOLATILITY_PCT, THIRTY_DAY_PRICE_CHANGE_PCT,
                 LAST_DATA_REFRESH_AT
  - Hybrid:      MARKET_CAP_USD (year-stable revenue multiple * daily
                 30-day-change drift)

ANNUAL_REVENUE is the load-bearing input for plausible commercial market-
cap synthesis: a 50M revenue company should not surface as a 500B mega-cap.
We multiply by a year-stable revenue multiple in [3.0, 7.0] (typical
commercial valuation band) then apply daily drift.

INDUSTRY drives CREDIT_RATING distribution: Banking / Finance cluster
A/Baa, Utilities cluster Aa/A, Technology spans wide (Aaa..Caa1), etc.
A default fallback distribution covers None / unknown industries.

ANNUAL_REVENUE_USD and EMPLOYEE_COUNT pass through from the anchor
unmodified for demo storytelling — they are not synthesized.

Plan:    docs/superpowers/plans/2026-05-28-cumulus-plan-13-moodys-market-context.md
Rowspec: docs/superpowers/plans/attachments/cumulus-plan-13-moodys-market-context-rowspec.md
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

# Audience predicate — single source of truth for AUDIENCE_SQL + COVERAGE_SQL.
_AUDIENCE_PREDICATE = "ACCOUNT_TYPE_FLAG = 'BUSINESS'"
AUDIENCE_SQL = (
    "SELECT DISTINCT * FROM FINS.PUBLIC.V_ACCOUNT_ANCHORS "
    "WHERE ACCOUNT_TYPE_FLAG = 'BUSINESS'"
)
COVERAGE_SQL = (
    "SELECT COUNT(DISTINCT ACCOUNT_ID) FROM FINS.PUBLIC.V_ACCOUNT_ANCHORS "
    "WHERE ACCOUNT_TYPE_FLAG = 'BUSINESS'"
)

# 16-column output contract (kept in sync with the table DDL by the L1 schema test).
# 14 NOT NULL + 2 NULLable (OUTLOOK_LAST_CHANGED_DATE, ANNUAL_REVENUE_USD).
# EMPLOYEE_COUNT is also nullable in the DDL; total NULLable = 3.
EXPECTED_OUTPUT_COLUMNS: frozenset[str] = frozenset({
    "ACCOUNT_ID", "PROFILE_DATE",
    "CREDIT_RATING", "RATING_OUTLOOK",
    "OUTLOOK_LAST_CHANGED_DATE",
    "MARKET_CAP_USD",
    "DAILY_VOLATILITY_PCT", "THIRTY_DAY_PRICE_CHANGE_PCT",
    "FIFTY_TWO_WEEK_HIGH_USD", "FIFTY_TWO_WEEK_LOW_USD",
    "RATING_AGENCY_FLAG_COUNT", "LIQUIDITY_TIER",
    "ANNUAL_REVENUE_USD", "EMPLOYEE_COUNT",
    "LAST_DATA_REFRESH_AT", "GENERATED_AT",
})


# -------------------------------------------------------------------
# Day-bucket + seed wrappers — Plan 7 pattern (fold day-of-month into
# the ACCOUNT_ID parameter so seed_for produces unique seeds per day).
# -------------------------------------------------------------------

def _day_start(run_ts: datetime) -> datetime:
    """Bucket run_ts to its calendar-day start (UTC). Mid-day re-runs
    re-bucket to the same instant so the seed (and therefore the row) is
    byte-identical."""
    return run_ts.replace(hour=0, minute=0, second=0, microsecond=0)


def _daily_seed(account_id: str, run_ts: datetime) -> bytes:
    """Daily seed wrapper. Folds the calendar day into the account_id
    parameter so we get a unique seed per (account_id, calendar day)
    without modifying cumulus_common.seed_for. Identical pattern to Plan 7.
    """
    day = _day_start(run_ts)
    return seed_for(
        f"{account_id}|{day.strftime('%Y%m%d')}", DATASET_SALT, day
    )


def _year_seed(account_id: str, run_ts: datetime, suffix: str = "") -> bytes:
    """Year-stable seed for editorial fields. Suffix is folded into the
    account_id parameter so each year-stable field gets its own independent
    rng stream (rating, outlook, 52w band, flags, revenue multiple, etc.)."""
    return seed_for(
        account_id + suffix, DATASET_SALT_YEAR,
        datetime(run_ts.year, 1, 1),
    )


# -------------------------------------------------------------------
# Industry -> Credit Rating bias tables (year-stable distribution)
# -------------------------------------------------------------------

_RATINGS = [
    "Aaa", "Aa1", "Aa2", "Aa3", "A1", "A2", "A3",
    "Baa1", "Baa2", "Baa3", "Ba1", "Ba2", "Ba3",
    "B1", "B2", "B3", "Caa1", "Caa2", "Caa3",
    "Ca", "C", "NR",
]

# Per-industry probability mass over the rating taxonomy. Keys are a subset
# of _RATINGS; missing keys imply zero probability for that industry. Each
# map sums to ~1.0. Distributions reflect rough real-world Moody''s patterns.
# Matched against INDUSTRY via case-insensitive substring (so "Information
# Technology" -> "Tech" bucket, "Commercial Real Estate" -> "Real Estate"
# bucket, etc.).
_INDUSTRY_RATING_BIAS: list[tuple[str, dict[str, float]]] = [
    ("Banking",       {"A1": 0.10, "A2": 0.18, "A3": 0.20, "Baa1": 0.18, "Baa2": 0.14, "Baa3": 0.08, "Ba1": 0.05, "NR": 0.07}),
    ("Finance",       {"A1": 0.10, "A2": 0.18, "A3": 0.20, "Baa1": 0.18, "Baa2": 0.14, "Baa3": 0.08, "Ba1": 0.05, "NR": 0.07}),
    ("Insurance",     {"Aa3": 0.06, "A1": 0.12, "A2": 0.18, "A3": 0.18, "Baa1": 0.16, "Baa2": 0.12, "Baa3": 0.08, "Ba1": 0.05, "NR": 0.05}),
    ("Tech",          {"Aaa": 0.04, "Aa1": 0.04, "Aa2": 0.06, "A1": 0.10, "A2": 0.10, "A3": 0.10, "Baa1": 0.08, "Baa2": 0.08, "Baa3": 0.08, "Ba1": 0.06, "Ba2": 0.06, "B1": 0.05, "B2": 0.05, "NR": 0.10}),
    ("Software",      {"Aaa": 0.04, "Aa1": 0.04, "Aa2": 0.06, "A1": 0.10, "A2": 0.10, "A3": 0.10, "Baa1": 0.08, "Baa2": 0.08, "Baa3": 0.08, "Ba1": 0.06, "Ba2": 0.06, "B1": 0.05, "B2": 0.05, "NR": 0.10}),
    ("Healthcare",    {"Aa3": 0.05, "A1": 0.10, "A2": 0.14, "A3": 0.16, "Baa1": 0.16, "Baa2": 0.12, "Baa3": 0.08, "Ba1": 0.05, "Ba2": 0.04, "B1": 0.03, "NR": 0.07}),
    ("Energy",        {"A2": 0.05, "A3": 0.08, "Baa1": 0.14, "Baa2": 0.18, "Baa3": 0.16, "Ba1": 0.12, "Ba2": 0.08, "Ba3": 0.06, "B1": 0.05, "Caa1": 0.03, "NR": 0.05}),
    ("Oil",           {"A2": 0.05, "A3": 0.08, "Baa1": 0.14, "Baa2": 0.18, "Baa3": 0.16, "Ba1": 0.12, "Ba2": 0.08, "Ba3": 0.06, "B1": 0.05, "Caa1": 0.03, "NR": 0.05}),
    ("Mining",        {"A3": 0.06, "Baa1": 0.12, "Baa2": 0.16, "Baa3": 0.16, "Ba1": 0.14, "Ba2": 0.12, "Ba3": 0.08, "B1": 0.06, "B2": 0.04, "Caa1": 0.02, "NR": 0.04}),
    ("Utilities",     {"Aa3": 0.08, "A1": 0.18, "A2": 0.20, "A3": 0.18, "Baa1": 0.14, "Baa2": 0.10, "Baa3": 0.06, "NR": 0.06}),
    ("Consumer",      {"Aa2": 0.04, "A1": 0.08, "A2": 0.12, "A3": 0.14, "Baa1": 0.16, "Baa2": 0.14, "Baa3": 0.10, "Ba1": 0.08, "Ba2": 0.06, "B1": 0.04, "NR": 0.04}),
    ("Retail",        {"Aa2": 0.02, "A1": 0.06, "A2": 0.10, "A3": 0.12, "Baa1": 0.14, "Baa2": 0.16, "Baa3": 0.12, "Ba1": 0.10, "Ba2": 0.08, "B1": 0.05, "B2": 0.03, "NR": 0.02}),
    ("Industrial",    {"A1": 0.06, "A2": 0.10, "A3": 0.14, "Baa1": 0.18, "Baa2": 0.16, "Baa3": 0.12, "Ba1": 0.08, "Ba2": 0.06, "B1": 0.04, "NR": 0.06}),
    ("Manufacturing", {"A1": 0.06, "A2": 0.10, "A3": 0.14, "Baa1": 0.18, "Baa2": 0.16, "Baa3": 0.12, "Ba1": 0.08, "Ba2": 0.06, "B1": 0.04, "NR": 0.06}),
    ("Construction",  {"A3": 0.04, "Baa1": 0.10, "Baa2": 0.14, "Baa3": 0.16, "Ba1": 0.16, "Ba2": 0.14, "Ba3": 0.10, "B1": 0.08, "B2": 0.04, "NR": 0.04}),
    ("Real Estate",   {"A2": 0.04, "A3": 0.08, "Baa1": 0.14, "Baa2": 0.16, "Baa3": 0.16, "Ba1": 0.14, "Ba2": 0.10, "B1": 0.06, "NR": 0.12}),
    ("Transportation",{"A2": 0.06, "A3": 0.10, "Baa1": 0.14, "Baa2": 0.16, "Baa3": 0.14, "Ba1": 0.12, "Ba2": 0.10, "B1": 0.08, "NR": 0.10}),
]
# Default fallback for None / unknown INDUSTRY — moderate Baa cluster.
_DEFAULT_RATING_BIAS = {
    "A3": 0.15, "Baa1": 0.20, "Baa2": 0.20, "Baa3": 0.15,
    "Ba1": 0.10, "Ba2": 0.08, "B1": 0.04, "NR": 0.08,
}

_OUTLOOKS = ["Stable", "Positive", "Negative", "Developing", "Watch"]
_OUTLOOK_WEIGHTS = [0.78, 0.08, 0.08, 0.03, 0.03]


def _industry_rating_bias(industry: Any) -> dict[str, float]:
    """Case-insensitive substring lookup against the industry table.
    Falls back to _DEFAULT_RATING_BIAS for None / unknown."""
    if not industry:
        return _DEFAULT_RATING_BIAS
    low = str(industry).lower()
    for key, bias in _INDUSTRY_RATING_BIAS:
        if key.lower() in low:
            return bias
    return _DEFAULT_RATING_BIAS


# -------------------------------------------------------------------
# Year-stable editorial helpers — use _year_seed.
# These fields don''t drift day-to-day; the cross-day invariant test
# is load-bearing for the hybrid year-stable + daily model.
# -------------------------------------------------------------------

def _credit_rating(account_id: str, industry: Any, run_ts: datetime) -> str:
    """Year-stable credit rating biased by INDUSTRY. Falls back to the
    default Baa-cluster bias when INDUSTRY is None / unknown."""
    seed = _year_seed(account_id, run_ts, "_rating")
    rng = random.Random(seed)
    bias = _industry_rating_bias(industry)
    ratings = list(bias.keys())
    weights = list(bias.values())
    return rng.choices(ratings, weights=weights)[0]


def _rating_outlook(account_id: str, run_ts: datetime) -> str:
    """Year-stable outlook. ~78% Stable; rare changes."""
    seed = _year_seed(account_id, run_ts, "_outlook")
    rng = random.Random(seed)
    return rng.choices(_OUTLOOKS, weights=_OUTLOOK_WEIGHTS)[0]


def _outlook_last_changed_date(account_id: str, outlook: str,
                                run_ts: datetime) -> Any:
    """NULL when outlook is Stable AND the year-stable RNG draw is in the
    80% never-changed bucket; else year-stable date in the past.

    Anchored on `datetime(run_ts.year, 1, 1)` not `run_ts` so the output is
    purely year-derived — same ACCOUNT_ID + same calendar year produces the
    same date regardless of mid-year run_ts. Folding run_ts into the
    subtraction would leak daily entropy and break the year-stable
    invariant the rowspec requires.

    Returns None or a datetime.date.
    """
    seed = _year_seed(account_id, run_ts, "_outlook_changed")
    rng = random.Random(seed)
    year_start = datetime(run_ts.year, 1, 1)
    if outlook == "Stable":
        # 80% of Stable accounts have NULL (never changed); 20% have a
        # stale 6-36-month-ago date relative to year_start (year-stable).
        if rng.random() < 0.80:
            return None
        days_ago = rng.randint(180, 1095)
        return (year_start - timedelta(days=days_ago)).date()
    # Non-Stable outlook: change date in the prior 12 months relative to
    # year_start (year-stable).
    days_ago = rng.randint(1, 365)
    return (year_start - timedelta(days=days_ago)).date()


def _year_stable_revenue_multiple(account_id: str, run_ts: datetime) -> float:
    """Year-stable revenue-multiple draw — used by both `_market_cap_usd`
    and `_liquidity_tier` so LIQUIDITY_TIER ties to the same year-stable
    valuation base that drives MARKET_CAP (without daily noise).

    Range [3.0, 7.0] — typical commercial valuation band.
    """
    seed = _year_seed(account_id, run_ts, "_rev_multiple")
    rng = random.Random(seed)
    return rng.uniform(3.0, 7.0)


def _market_cap_base(annual_revenue: float, account_id: str,
                      run_ts: datetime) -> float:
    """Year-stable market-cap base — ANNUAL_REVENUE * year-stable revenue
    multiple. No daily noise. Used by _liquidity_tier and as the anchor
    for the 52-week high/low band."""
    return annual_revenue * _year_stable_revenue_multiple(account_id, run_ts)


def _market_cap_usd(account_id: str, annual_revenue: float,
                     run_ts: datetime,
                     thirty_day_change_pct: float) -> float:
    """Hybrid market cap. Year-stable revenue-multiple * ANNUAL_REVENUE *
    (1 + thirty_day_change_pct/100) — daily drift folded onto the year-stable
    valuation base. Clamped to [$5M, $500B] (commercial range, not
    instrument range)."""
    base_cap = _market_cap_base(annual_revenue, account_id, run_ts)
    cap = base_cap * (1 + thirty_day_change_pct / 100.0)
    return round(max(5_000_000.0, min(500_000_000_000.0, cap)), 2)


def _fifty_two_week_high_usd(account_id: str, base_cap: float,
                              run_ts: datetime) -> float:
    """Year-stable 52-week high. base_cap * uniform(1.05, 1.50), with a
    sanity floor of base_cap * 0.5 in case of weird base caps."""
    seed = _year_seed(account_id, run_ts, "_52w_high")
    rng = random.Random(seed)
    high = round(base_cap * rng.uniform(1.05, 1.50), 2)
    return max(high, round(base_cap * 0.5, 2))


def _fifty_two_week_low_usd(account_id: str, base_cap: float,
                             run_ts: datetime,
                             fifty_two_week_high: float) -> float:
    """Year-stable 52-week low. base_cap * uniform(0.55, 0.95), clamped so
    it never exceeds the 52-week high (defensive — should never bind given
    the multiplier ranges)."""
    seed = _year_seed(account_id, run_ts, "_52w_low")
    rng = random.Random(seed)
    low = round(base_cap * rng.uniform(0.55, 0.95), 2)
    return min(low, fifty_two_week_high)


def _rating_agency_flag_count(account_id: str, run_ts: datetime) -> int:
    """Year-stable count of recent rating-watch / credit-action events.
    Range [0, 5]; biased toward 0 (most accounts have no recent events)."""
    seed = _year_seed(account_id, run_ts, "_flags")
    rng = random.Random(seed)
    return rng.choices(
        [0, 1, 2, 3, 4, 5],
        weights=[0.80, 0.10, 0.05, 0.03, 0.015, 0.005],
    )[0]


def _liquidity_tier(account_id: str, market_cap_usd_param: float,
                     run_ts: datetime, annual_revenue: float) -> str:
    """Year-stable liquidity tier. Re-derives the year-stable MARKET_CAP
    base WITHOUT the daily noise to avoid tier flips on small daily moves.

    Note: takes the daily MARKET_CAP_USD as a parameter only for symmetry
    with the v1 module signature; the actual tier is derived from the
    year-stable base, not the daily value.
    """
    base_cap = _market_cap_base(annual_revenue, account_id, run_ts)
    if base_cap >= 50_000_000_000:
        return "Tier 1"   # mega-cap (>= $50B)
    if base_cap >= 5_000_000_000:
        return "Tier 2"   # large-cap (>= $5B)
    if base_cap >= 500_000_000:
        return "Tier 3"   # mid-cap (>= $500M)
    return "Illiquid"


# -------------------------------------------------------------------
# Daily-bucketed market signals — use _daily_seed via the per-row rng.
# These ARE day-to-day signals; the daily cadence is the whole point.
# -------------------------------------------------------------------

def _daily_volatility_pct(account_id: str, run_ts: datetime,
                           rng: random.Random) -> float:
    """Daily-bucketed realized volatility (%). Range [0, 25].
    ~95% normal days produce 0.1-3.0% vol; ~5% spike days produce 5-10%.
    The hard cap is 25% — extreme tail events on synthetic data shouldn''t
    exceed that without breaking the rowspec range invariant.
    """
    if rng.random() < 0.05:
        return round(rng.uniform(5.0, 10.0), 2)
    return round(rng.uniform(0.1, 3.0), 2)


def _thirty_day_change_pct(account_id: str, run_ts: datetime,
                            rng: random.Random) -> float:
    """Daily-bucketed cumulative 30-day price change (%). Range [-25, +25].
    Synthesized as a sum of 30 random moves in [-1, 1]; the truncated sum
    approximates a mean-zero, std-~6 distribution. Clipped hard to ±25%.
    """
    raw = sum(rng.uniform(-1.0, 1.0) for _ in range(30))
    return round(max(-25.0, min(25.0, raw)), 2)


# -------------------------------------------------------------------
# Audience predicate (defense-in-depth vs the SQL WHERE clause)
# -------------------------------------------------------------------

def _anchor_in_audience(anchor: dict) -> bool:
    """Translate the AUDIENCE_PREDICATE into a Python predicate.

    Returns True iff ACCOUNT_TYPE_FLAG == 'BUSINESS' AND ACCOUNT_ID is
    non-empty. Mirrors the SQL `WHERE ACCOUNT_TYPE_FLAG = 'BUSINESS'`
    predicate plus the trivial non-empty ACCOUNT_ID check that every
    Cumulus generator applies.
    """
    if anchor.get("ACCOUNT_TYPE_FLAG") != "BUSINESS":
        return False
    return bool(anchor.get("ACCOUNT_ID"))


# -------------------------------------------------------------------
# _rows_for — substantive synthesis (per rowspec)
#
# Returns a length-1 list[dict] for symmetry with multi-row generators
# elsewhere in the rebroadcast family. Public symbol; sibling tests import
# it as `from sp_generate_moodys_market_context import _rows_for`.
# -------------------------------------------------------------------

def _rows_for(anchor: dict, profile_date: date) -> list[dict]:
    """Pure function: BUSINESS anchor + profile date -> length-1 list of
    fact rows. Deterministic on (account_id, profile_date) for daily fields
    and (account_id, year(profile_date)) for year-stable fields.

    Reads only the BUSINESS-relevant V_ACCOUNT_ANCHORS columns:
    ACCOUNT_ID, ACCOUNT_TYPE_FLAG, INDUSTRY, ANNUAL_REVENUE, EMPLOYEE_COUNT.
    """
    if not _anchor_in_audience(anchor):
        raise ValueError(
            f"anchor {anchor.get('ACCOUNT_ID')!r} fails audience predicate "
            f"({_AUDIENCE_PREDICATE})"
        )

    account_id = anchor["ACCOUNT_ID"]
    industry = anchor.get("INDUSTRY") or "Other"

    raw_revenue = anchor.get("ANNUAL_REVENUE")
    annual_revenue = float(raw_revenue) if raw_revenue is not None else 5_000_000.0

    raw_employees = anchor.get("EMPLOYEE_COUNT")
    employee_count = int(raw_employees) if raw_employees is not None else None

    # `profile_date` is a calendar date; the seed wrappers expect a
    # datetime, so synthesize midnight-UTC of that day.
    run_ts = datetime(profile_date.year, profile_date.month, profile_date.day)
    day_start = _day_start(run_ts)

    daily_seed = _daily_seed(account_id, run_ts)
    rng = random.Random(daily_seed)

    # 1. Year-stable editorial signals (rating, outlook, 52w band, flags, tier).
    rating = _credit_rating(account_id, industry, run_ts)
    outlook = _rating_outlook(account_id, run_ts)
    outlook_changed = _outlook_last_changed_date(account_id, outlook, run_ts)
    flag_count = _rating_agency_flag_count(account_id, run_ts)

    # 2. Daily-bucketed market signals.
    daily_vol = _daily_volatility_pct(account_id, run_ts, rng)
    thirty_day = _thirty_day_change_pct(account_id, run_ts, rng)

    # 3. Hybrid market cap — year-stable revenue multiple * today''s drift.
    market_cap = _market_cap_usd(account_id, annual_revenue, run_ts, thirty_day)

    # 4. 52-week band anchored on the year-stable MARKET_CAP base
    # (NOT on today''s noisy market_cap — keeps the cross-day invariant).
    base_cap = _market_cap_base(annual_revenue, account_id, run_ts)
    high_52w = _fifty_two_week_high_usd(account_id, base_cap, run_ts)
    low_52w = _fifty_two_week_low_usd(account_id, base_cap, run_ts, high_52w)

    # 5. Liquidity tier from the year-stable base (no daily flips).
    liquidity = _liquidity_tier(account_id, market_cap, run_ts, annual_revenue)

    # 6. ANNUAL_REVENUE_USD pass-through. None when source revenue missing
    # (we still synthesize MARKET_CAP using the 5M default, but the
    # ANNUAL_REVENUE_USD column is nullable and reflects the source).
    annual_revenue_passthrough = (
        round(float(raw_revenue), 2) if raw_revenue is not None else None
    )

    return [{
        "ACCOUNT_ID":                   account_id,
        "PROFILE_DATE":                 day_start.date(),
        "CREDIT_RATING":                rating,
        "RATING_OUTLOOK":               outlook,
        "OUTLOOK_LAST_CHANGED_DATE":    outlook_changed,
        "MARKET_CAP_USD":               market_cap,
        "DAILY_VOLATILITY_PCT":         daily_vol,
        "THIRTY_DAY_PRICE_CHANGE_PCT":  thirty_day,
        "FIFTY_TWO_WEEK_HIGH_USD":      high_52w,
        "FIFTY_TWO_WEEK_LOW_USD":       low_52w,
        "RATING_AGENCY_FLAG_COUNT":     flag_count,
        "LIQUIDITY_TIER":               liquidity,
        "ANNUAL_REVENUE_USD":           annual_revenue_passthrough,
        "EMPLOYEE_COUNT":               employee_count,
        "LAST_DATA_REFRESH_AT":         day_start,
        "GENERATED_AT":                 day_start,
    }]


# -------------------------------------------------------------------
# Entry point — invoked by FINS.PUBLIC.SP_RUN_WITH_RETRY -> SP_GENERATE_MOODYS_MARKET_CONTEXT
# -------------------------------------------------------------------

def main(session: Any) -> str:
    """The 5-step canonical pattern: read -> build -> MERGE -> assert -> log.

    1. Read audience (BUSINESS-only via V_ACCOUNT_ANCHORS).
    2. Build deterministic rows (tolerate up to 1% per-row failures).
    3. Idempotent MERGE on PK (ACCOUNT_ID, PROFILE_DATE).
    4. Coverage assertion vs V_ACCOUNT_ANCHORS BUSINESS count.
    5. Always log to TASK_EXECUTION_LOG (success or failure).
    """
    log_id = str(uuid.uuid4())
    started = datetime.utcnow()
    rows_inserted, accounts_processed, status, err = 0, 0, "SUCCEEDED", None

    try:
        # 1. Read audience — BUSINESS-only.
        audience = session.sql(AUDIENCE_SQL).collect()
        accounts_processed = len(audience)

        # 2. Build deterministic rows; tolerate up to 1% per-row failures.
        profile_date = _day_start(started).date()
        records, errors = [], []
        for row in audience:
            anchor = _anchor_to_dict(row)
            try:
                records.extend(_rows_for(anchor, profile_date))
            except Exception as exc:
                errors.append((anchor.get("ACCOUNT_ID"), str(exc)[:200]))
        max_tolerated = max(10, len(audience) // 100)
        if len(errors) > max_tolerated:
            raise RuntimeError(
                f"row factory failed on {len(errors)}/{len(audience)} accounts "
                f"(tolerance {max_tolerated}); first: {errors[0] if errors else 'n/a'}"
            )
        if errors:
            err = (
                f"row factory failed on {len(errors)}/{len(audience)} accounts; "
                f"first: {errors[0]}"
            )

        # 3. Idempotent MERGE on composite PK (ACCOUNT_ID, PROFILE_DATE).
        rows_inserted = _merge(session, records)

        # 4. Coverage assertion — 1:1 audience-vs-actual for today''s slice.
        # Actual count restricted to today''s PROFILE_DATE because the table
        # holds 90 days of backfilled history alongside today''s row.
        actual_sql = (
            f"SELECT COUNT(DISTINCT ACCOUNT_ID) FROM {TABLE} "
            f"WHERE PROFILE_DATE = '{profile_date.isoformat()}'"
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

    return f"{TASK_NAME}: {status} rows={rows_inserted} accounts={accounts_processed}"


def _anchor_to_dict(row: Any) -> dict:
    """Snowpark Row -> plain dict so _rows_for can be tested with dict literals."""
    if isinstance(row, dict):
        return row
    if hasattr(row, "asDict"):
        return dict(row.asDict())
    if hasattr(row, "_fields"):
        return {f.name: row[f.name] for f in row._fields}
    return dict(row)


# -------------------------------------------------------------------
# _merge — idempotent MERGE on composite PK (ACCOUNT_ID, PROFILE_DATE)
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

    The NULLable columns (OUTLOOK_LAST_CHANGED_DATE, ANNUAL_REVENUE_USD,
    EMPLOYEE_COUNT) pass through; pandas + write_pandas serialize Python
    None -> SQL NULL transparently. No BOOLEAN columns.
    """
    if not records:
        return 0

    import pandas as pd
    df = pd.DataFrame(records)
    # Force date-typed columns to pandas datetime dtype so write_pandas
    # auto_create_table doesn''t mis-type all-NULL columns as NUMBER(38,0).
    # OUTLOOK_LAST_CHANGED_DATE is ~62% NULL across the audience; on small
    # backfill batches it can spike higher and break the DATE-typed MERGE.
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
                ACCOUNT_ID,
                TO_DATE(TO_TIMESTAMP_NTZ(PROFILE_DATE::NUMBER / 1000000000)) AS PROFILE_DATE,
                CREDIT_RATING,
                RATING_OUTLOOK,
                CASE WHEN OUTLOOK_LAST_CHANGED_DATE IS NULL THEN NULL
                     ELSE TO_DATE(TO_TIMESTAMP_NTZ(OUTLOOK_LAST_CHANGED_DATE::NUMBER / 1000000000))
                END AS OUTLOOK_LAST_CHANGED_DATE,
                MARKET_CAP_USD,
                DAILY_VOLATILITY_PCT,
                THIRTY_DAY_PRICE_CHANGE_PCT,
                FIFTY_TWO_WEEK_HIGH_USD,
                FIFTY_TWO_WEEK_LOW_USD,
                RATING_AGENCY_FLAG_COUNT,
                LIQUIDITY_TIER,
                ANNUAL_REVENUE_USD,
                EMPLOYEE_COUNT,
                TO_TIMESTAMP_NTZ(LAST_DATA_REFRESH_AT::NUMBER / 1000000000) AS LAST_DATA_REFRESH_AT,
                TO_TIMESTAMP_NTZ(GENERATED_AT::NUMBER / 1000000000) AS GENERATED_AT
            FROM FINS.PUBLIC.{staging}
        ) src
        ON tgt.ACCOUNT_ID = src.ACCOUNT_ID
           AND tgt.PROFILE_DATE = src.PROFILE_DATE
        WHEN MATCHED THEN UPDATE SET
            CREDIT_RATING                = src.CREDIT_RATING,
            RATING_OUTLOOK               = src.RATING_OUTLOOK,
            OUTLOOK_LAST_CHANGED_DATE    = src.OUTLOOK_LAST_CHANGED_DATE,
            MARKET_CAP_USD               = src.MARKET_CAP_USD,
            DAILY_VOLATILITY_PCT         = src.DAILY_VOLATILITY_PCT,
            THIRTY_DAY_PRICE_CHANGE_PCT  = src.THIRTY_DAY_PRICE_CHANGE_PCT,
            FIFTY_TWO_WEEK_HIGH_USD      = src.FIFTY_TWO_WEEK_HIGH_USD,
            FIFTY_TWO_WEEK_LOW_USD       = src.FIFTY_TWO_WEEK_LOW_USD,
            RATING_AGENCY_FLAG_COUNT     = src.RATING_AGENCY_FLAG_COUNT,
            LIQUIDITY_TIER               = src.LIQUIDITY_TIER,
            ANNUAL_REVENUE_USD           = src.ANNUAL_REVENUE_USD,
            EMPLOYEE_COUNT               = src.EMPLOYEE_COUNT,
            LAST_DATA_REFRESH_AT         = src.LAST_DATA_REFRESH_AT,
            GENERATED_AT                 = src.GENERATED_AT
        WHEN NOT MATCHED THEN INSERT (
            ACCOUNT_ID, PROFILE_DATE, CREDIT_RATING, RATING_OUTLOOK,
            OUTLOOK_LAST_CHANGED_DATE, MARKET_CAP_USD,
            DAILY_VOLATILITY_PCT, THIRTY_DAY_PRICE_CHANGE_PCT,
            FIFTY_TWO_WEEK_HIGH_USD, FIFTY_TWO_WEEK_LOW_USD,
            RATING_AGENCY_FLAG_COUNT, LIQUIDITY_TIER,
            ANNUAL_REVENUE_USD, EMPLOYEE_COUNT,
            LAST_DATA_REFRESH_AT, GENERATED_AT
        ) VALUES (
            src.ACCOUNT_ID, src.PROFILE_DATE, src.CREDIT_RATING, src.RATING_OUTLOOK,
            src.OUTLOOK_LAST_CHANGED_DATE, src.MARKET_CAP_USD,
            src.DAILY_VOLATILITY_PCT, src.THIRTY_DAY_PRICE_CHANGE_PCT,
            src.FIFTY_TWO_WEEK_HIGH_USD, src.FIFTY_TWO_WEEK_LOW_USD,
            src.RATING_AGENCY_FLAG_COUNT, src.LIQUIDITY_TIER,
            src.ANNUAL_REVENUE_USD, src.EMPLOYEE_COUNT,
            src.LAST_DATA_REFRESH_AT, src.GENERATED_AT
        )
    """
    rows = session.sql(merge_sql).collect()
    return int(rows[0][0]) if rows else len(records)
