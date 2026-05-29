"""L1 tests for the Moody's Market Context row factory.

**Plan 13 is the FINAL Cumulus plan (13 of 13).** Second non-account-scoped
plan after Plan 4 (Esri / branch-scoped); second daily-cadence plan after
Plan 7 (WorldCheck AML). Most-divergent instantiation of the dataset
template — 4 structural deviations from the Plan 8 baseline:

  1. Instrument-scoped, not account-scoped — row factory takes an instrument
     record (TICKER, INSTRUMENT_NAME, SECTOR, BASE_PRICE), not an anchor.
  2. Daily cadence — `_daily_seed` wrapper inlined per Plan 7.
  3. Two salts — `moodys` (daily) + `moodys_year` (year-stable).
  4. Hybrid year-stable + daily field model — editorial fields year-stable;
     market signals daily-bucketed; MARKET_CAP_USD hybrid.

**No `_anchor_in_audience` predicate.** Every instrument is in audience by
definition (no IS_ACTIVE column on INSTRUMENT_UNIVERSE).

Property classes (per rowspec / AGENTS.md / plan §4.3):
  1. Same-day determinism — mid-day re-runs (03:00 vs 23:30) byte-identical.
  2. Boring case — every fixture instrument emits a non-None dict with
     required-non-null fields populated; TICKER passthrough.
  3. Per-row range invariants — DAILY_VOLATILITY_PCT, MARKET_CAP_USD,
     THIRTY_DAY_PRICE_CHANGE_PCT, 52W high/low, RATING_AGENCY_FLAG_COUNT,
     LIQUIDITY_TIER vocabulary, CREDIT_RATING vocabulary, RATING_OUTLOOK
     vocabulary.
  4. Year-stable invariants — same TICKER on May 1 2026 and Sep 15 2026 →
     identical CREDIT_RATING, RATING_OUTLOOK, OUTLOOK_LAST_CHANGED_DATE,
     FIFTY_TWO_WEEK_HIGH/LOW, RATING_AGENCY_FLAG_COUNT, LIQUIDITY_TIER.
     **Load-bearing structural test for the hybrid model.**
  5. Cross-field invariants — LAST_DATA_REFRESH_AT.date()==PROFILE_DATE;
     PROFILE_DATE==run_ts.date(); GENERATED_AT==day-start.
  6. Schema contract — output dict has 14 keys matching DDL;
     `EXPECTED_OUTPUT_COLUMNS` matches.

Plus bonus tests:
  - CREDIT_RATING biased by SECTOR (Financials clustered A/Baa; Tech wider).
  - MARKET_CAP_USD positive for all rows.
  - `_anchor_in_audience` is NOT in the SP module namespace (Plan 13 deviation).
"""
from datetime import datetime, time

import pytest

# Imports from the SP module (Task 4 in the same diff family as this file).
from sp_generate_moodys_market_context import (
    _row_for,
    EXPECTED_OUTPUT_COLUMNS,
)
import sp_generate_moodys_market_context as _moodys_module


# Canonical vocabularies per rowspec §"Per-row invariants" + DDL.
_VALID_CREDIT_RATINGS = {
    "Aaa", "Aa1", "Aa2", "Aa3", "A1", "A2", "A3",
    "Baa1", "Baa2", "Baa3", "Ba1", "Ba2", "Ba3",
    "B1", "B2", "B3", "Caa1", "Caa2", "Caa3",
    "Ca", "C", "NR",
}
_VALID_RATING_OUTLOOKS = {"Stable", "Positive", "Negative", "Developing", "Watch"}
_VALID_LIQUIDITY_TIERS = {"Tier 1", "Tier 2", "Tier 3", "Illiquid"}

# 14-column schema per DDL (12 NOT NULL + 1 NULLable + 1 NOT NULL audit ts).
EXPECTED_KEYS = {
    "TICKER",
    "PROFILE_DATE",
    "CREDIT_RATING",
    "RATING_OUTLOOK",
    "OUTLOOK_LAST_CHANGED_DATE",
    "MARKET_CAP_USD",
    "DAILY_VOLATILITY_PCT",
    "THIRTY_DAY_PRICE_CHANGE_PCT",
    "FIFTY_TWO_WEEK_HIGH_PRICE",
    "FIFTY_TWO_WEEK_LOW_PRICE",
    "RATING_AGENCY_FLAG_COUNT",
    "LIQUIDITY_TIER",
    "LAST_DATA_REFRESH_AT",
    "GENERATED_AT",
}


# ---------- Property 1: Same-day determinism ----------

def test_determinism_mid_day_reruns_byte_identical(in_audience_instruments):
    """`_row_for(inst, 03:00)` and `_row_for(inst, 23:30)` produce IDENTICAL
    dicts — mid-day bucketing collapses to day-start."""
    morning = datetime(2026, 5, 28, 3, 0, 0)
    night = datetime(2026, 5, 28, 23, 30, 0)
    for inst in in_audience_instruments:
        a = _row_for(inst, morning)
        b = _row_for(inst, night)
        assert a == b, (
            f"non-deterministic mid-day for {inst['TICKER']}: "
            f"03:00 vs 23:30 differ"
        )


def test_determinism_noon_equals_midnight(in_audience_instruments):
    """`_row_for(inst, 12:00)` is byte-identical to `_row_for(inst, 00:00)`."""
    midnight = datetime(2026, 5, 28, 0, 0, 0)
    noon = datetime(2026, 5, 28, 12, 0, 0)
    for inst in in_audience_instruments:
        a = _row_for(inst, midnight)
        b = _row_for(inst, noon)
        assert a == b, f"non-deterministic noon vs midnight for {inst['TICKER']}"


def test_determinism_same_inputs_same_dict(in_audience_instruments):
    """Two back-to-back calls with the same inputs produce the same dict."""
    ts = datetime(2026, 5, 28)
    for inst in in_audience_instruments[:5]:
        a = _row_for(inst, ts)
        b = _row_for(inst, ts)
        assert a == b


# ---------- Property 2: Boring case (every instrument emits) ----------

def test_every_instrument_emits_a_row_no_exceptions(in_audience_instruments):
    """All 10 fixture instruments produce a row without raising."""
    ts = datetime(2026, 5, 28)
    for inst in in_audience_instruments:
        row = _row_for(inst, ts)
        assert row is not None, inst["TICKER"]
        assert row["TICKER"] == inst["TICKER"], (
            f"TICKER passthrough broken: input {inst['TICKER']!r} "
            f"!= output {row['TICKER']!r}"
        )


def test_boring_case_required_non_null_fields_populated(in_audience_instruments):
    """All 10 fixture instruments produce a non-None dict with the 13
    required-non-null fields populated (only OUTLOOK_LAST_CHANGED_DATE may
    be NULL per DDL)."""
    ts = datetime(2026, 5, 28)
    required_non_null = EXPECTED_KEYS - {"OUTLOOK_LAST_CHANGED_DATE"}
    for inst in in_audience_instruments:
        row = _row_for(inst, ts)
        for f in required_non_null:
            assert row[f] is not None, (
                f"{inst['TICKER']}: required-non-null field {f} is None"
            )


# ---------- Property 3: Per-row range invariants ----------

def test_daily_volatility_pct_in_range(in_audience_instruments):
    """DAILY_VOLATILITY_PCT in [0, 25]."""
    ts = datetime(2026, 5, 28)
    for inst in in_audience_instruments:
        row = _row_for(inst, ts)
        v = row["DAILY_VOLATILITY_PCT"]
        assert 0.0 <= float(v) <= 25.0, (
            f"{inst['TICKER']}: DAILY_VOLATILITY_PCT={v} out of [0, 25]"
        )


def test_market_cap_usd_positive(in_audience_instruments):
    """MARKET_CAP_USD > 0 for every fixture instrument."""
    ts = datetime(2026, 5, 28)
    for inst in in_audience_instruments:
        row = _row_for(inst, ts)
        cap = row["MARKET_CAP_USD"]
        assert float(cap) > 0, f"{inst['TICKER']}: MARKET_CAP_USD={cap} not > 0"


def test_thirty_day_price_change_in_range(in_audience_instruments):
    """THIRTY_DAY_PRICE_CHANGE_PCT in [-50, 50] (loose user-instruction bound;
    rowspec target is [-25, 25])."""
    ts = datetime(2026, 5, 28)
    for inst in in_audience_instruments:
        row = _row_for(inst, ts)
        v = row["THIRTY_DAY_PRICE_CHANGE_PCT"]
        assert -50.0 <= float(v) <= 50.0, (
            f"{inst['TICKER']}: THIRTY_DAY_PRICE_CHANGE_PCT={v} out of [-50, 50]"
        )


def test_52w_high_ge_low(in_audience_instruments):
    """FIFTY_TWO_WEEK_HIGH_PRICE >= FIFTY_TWO_WEEK_LOW_PRICE."""
    ts = datetime(2026, 5, 28)
    for inst in in_audience_instruments:
        row = _row_for(inst, ts)
        hi = float(row["FIFTY_TWO_WEEK_HIGH_PRICE"])
        lo = float(row["FIFTY_TWO_WEEK_LOW_PRICE"])
        assert hi >= lo, f"{inst['TICKER']}: 52W HIGH={hi} < LOW={lo}"


def test_52w_high_ge_base_price_floor(in_audience_instruments):
    """FIFTY_TWO_WEEK_HIGH_PRICE >= BASE_PRICE * 0.5 (sanity floor — guards
    weird base prices like the TINY fixture)."""
    ts = datetime(2026, 5, 28)
    for inst in in_audience_instruments:
        row = _row_for(inst, ts)
        hi = float(row["FIFTY_TWO_WEEK_HIGH_PRICE"])
        base = float(inst["BASE_PRICE"])
        floor = base * 0.5
        assert hi >= floor, (
            f"{inst['TICKER']}: 52W HIGH={hi} < BASE_PRICE*0.5={floor} "
            f"(BASE_PRICE={base})"
        )


def test_rating_agency_flag_count_in_range(in_audience_instruments):
    """RATING_AGENCY_FLAG_COUNT in [0, 5] (loose user-instruction bound;
    rowspec target weights are [0, 3])."""
    ts = datetime(2026, 5, 28)
    for inst in in_audience_instruments:
        row = _row_for(inst, ts)
        n = int(row["RATING_AGENCY_FLAG_COUNT"])
        assert 0 <= n <= 5, (
            f"{inst['TICKER']}: RATING_AGENCY_FLAG_COUNT={n} out of [0, 5]"
        )


def test_liquidity_tier_canonical(in_audience_instruments):
    """LIQUIDITY_TIER in canonical 4-value set."""
    ts = datetime(2026, 5, 28)
    for inst in in_audience_instruments:
        row = _row_for(inst, ts)
        tier = row["LIQUIDITY_TIER"]
        assert tier in _VALID_LIQUIDITY_TIERS, (
            f"{inst['TICKER']}: LIQUIDITY_TIER={tier!r} not in "
            f"{_VALID_LIQUIDITY_TIERS}"
        )


def test_credit_rating_canonical(in_audience_instruments):
    """CREDIT_RATING in canonical 22-rating + NR set (23 values)."""
    ts = datetime(2026, 5, 28)
    for inst in in_audience_instruments:
        row = _row_for(inst, ts)
        r = row["CREDIT_RATING"]
        assert r in _VALID_CREDIT_RATINGS, (
            f"{inst['TICKER']}: CREDIT_RATING={r!r} not in canonical 23-value set"
        )


def test_rating_outlook_canonical(in_audience_instruments):
    """RATING_OUTLOOK in canonical 5-value set."""
    ts = datetime(2026, 5, 28)
    for inst in in_audience_instruments:
        row = _row_for(inst, ts)
        o = row["RATING_OUTLOOK"]
        assert o in _VALID_RATING_OUTLOOKS, (
            f"{inst['TICKER']}: RATING_OUTLOOK={o!r} not in {_VALID_RATING_OUTLOOKS}"
        )


# ---------- Property 4: Year-stable invariants ----------

_YEAR_STABLE_FIELDS = (
    "CREDIT_RATING",
    "RATING_OUTLOOK",
    "OUTLOOK_LAST_CHANGED_DATE",
    "FIFTY_TWO_WEEK_HIGH_PRICE",
    "FIFTY_TWO_WEEK_LOW_PRICE",
    "RATING_AGENCY_FLAG_COUNT",
    "LIQUIDITY_TIER",
)


def test_year_stable_fields_identical_across_days_same_year(in_audience_instruments):
    """For every fixture instrument, `_row_for(inst, May 1 2026)` and
    `_row_for(inst, Sep 15 2026)` produce IDENTICAL year-stable fields.

    Load-bearing: this is the structural test for the hybrid year-stable +
    daily model. If any year-stable field drifts within a calendar year,
    the two-salt seed bucketing is broken (the year-stable salt is leaking
    daily entropy)."""
    may = datetime(2026, 5, 1)
    sep = datetime(2026, 9, 15)
    for inst in in_audience_instruments:
        a = _row_for(inst, may)
        b = _row_for(inst, sep)
        for fld in _YEAR_STABLE_FIELDS:
            assert a[fld] == b[fld], (
                f"{inst['TICKER']}: year-stable field {fld} drifted within "
                f"calendar year 2026 (May 1: {a[fld]!r} vs Sep 15: {b[fld]!r})"
            )


# Cross-year (2026 vs 2027) drift is allowed and not asserted here — the
# year-stable seed bucket is `datetime(run_ts.year, 1, 1)`, so a year shift
# legitimately rerolls these fields.


# ---------- Property 5: Cross-field invariants ----------

def test_last_data_refresh_at_date_equals_profile_date(in_audience_instruments):
    """LAST_DATA_REFRESH_AT.date() == PROFILE_DATE (same-day refresh)."""
    ts = datetime(2026, 5, 28, 14, 30, 0)
    for inst in in_audience_instruments:
        row = _row_for(inst, ts)
        assert row["LAST_DATA_REFRESH_AT"].date() == row["PROFILE_DATE"], (
            f"{inst['TICKER']}: LAST_DATA_REFRESH_AT.date()="
            f"{row['LAST_DATA_REFRESH_AT'].date()} != "
            f"PROFILE_DATE={row['PROFILE_DATE']}"
        )


def test_profile_date_equals_run_ts_date(in_audience_instruments):
    """PROFILE_DATE == run_ts.date() — daily bucketing."""
    for day_offset in range(7):
        from datetime import timedelta
        ts = datetime(2026, 5, 28) + timedelta(days=day_offset)
        for inst in in_audience_instruments[:3]:
            row = _row_for(inst, ts)
            assert row["PROFILE_DATE"] == ts.date(), (
                f"{inst['TICKER']}: PROFILE_DATE={row['PROFILE_DATE']} "
                f"!= run_ts.date()={ts.date()}"
            )


def test_generated_at_is_day_start(in_audience_instruments):
    """GENERATED_AT == datetime.combine(run_ts.date(), time(0)) — day-start
    bucketing for byte-identical mid-day re-runs."""
    ts = datetime(2026, 5, 28, 17, 45, 30)
    expected = datetime.combine(ts.date(), time(0))
    for inst in in_audience_instruments:
        row = _row_for(inst, ts)
        assert row["GENERATED_AT"] == expected, (
            f"{inst['TICKER']}: GENERATED_AT={row['GENERATED_AT']} "
            f"!= expected day-start {expected}"
        )


# ---------- Property 6: Schema contract ----------

def test_output_schema_has_14_keys(in_audience_instruments):
    """Output dict has EXACTLY the 14 DDL columns — no extras, no missing."""
    row = _row_for(in_audience_instruments[0], datetime(2026, 5, 28))
    assert set(row.keys()) == EXPECTED_KEYS, (
        f"row keys {sorted(row.keys())} != expected {sorted(EXPECTED_KEYS)}"
    )
    assert len(row) == 14, f"row has {len(row)} keys, expected 14"


def test_expected_output_columns_constant_matches_test_set():
    """Defense against `EXPECTED_OUTPUT_COLUMNS` in the SP module drifting
    away from this test's `EXPECTED_KEYS` — they MUST be the same set."""
    assert set(EXPECTED_OUTPUT_COLUMNS) == EXPECTED_KEYS, (
        f"SP module's EXPECTED_OUTPUT_COLUMNS "
        f"{sorted(set(EXPECTED_OUTPUT_COLUMNS))} drifted from test's "
        f"EXPECTED_KEYS {sorted(EXPECTED_KEYS)}"
    )


# ---------- Bonus: SECTOR-biased CREDIT_RATING distribution ----------

def test_credit_rating_biased_by_sector():
    """Aggregate over a 50-instrument-per-sector synthesized batch:
      - Financials concentrated in {A1..Baa3} ({A1, A2, A3, Baa1, Baa2, Baa3}).
      - Technology spans wider — at least 4 distinct rating buckets seen.

    Synthesizes 50 tickers per sector (FIN_001..FIN_050, TEC_001..TEC_050) so
    aggregate biases are observable above binomial noise. Year-stable seed
    bucket means the rating draw is deterministic per (ticker, year).
    """
    ts = datetime(2026, 5, 28)
    fin_a_baa = {"A1", "A2", "A3", "Baa1", "Baa2", "Baa3"}
    fin_in_band = 0
    fin_total = 0
    tech_ratings_seen = set()
    tech_total = 0

    for i in range(1, 51):
        fin_inst = {
            "TICKER": f"FIN{i:03d}",
            "INSTRUMENT_NAME": f"Financial Test {i}",
            "SECTOR": "Financials",
            "BASE_PRICE": 100.0,
        }
        row = _row_for(fin_inst, ts)
        fin_total += 1
        if row["CREDIT_RATING"] in fin_a_baa:
            fin_in_band += 1

        tech_inst = {
            "TICKER": f"TEC{i:03d}",
            "INSTRUMENT_NAME": f"Tech Test {i}",
            "SECTOR": "Technology",
            "BASE_PRICE": 100.0,
        }
        tech_row = _row_for(tech_inst, ts)
        tech_total += 1
        tech_ratings_seen.add(tech_row["CREDIT_RATING"])

    fin_band_rate = fin_in_band / fin_total
    print(
        f"\nSECTOR-biased CREDIT_RATING distribution (n={fin_total}/sector):\n"
        f"  Financials in {{A1..Baa3}}: {fin_in_band}/{fin_total} "
        f"= {fin_band_rate:.2f} (target ~0.88 per bias table)\n"
        f"  Technology distinct ratings seen: {len(tech_ratings_seen)} "
        f"({sorted(tech_ratings_seen)})"
    )
    # Per `_SECTOR_RATING_BIAS["Financials"]` summing the {A1..Baa3} weights:
    # 0.10 + 0.18 + 0.20 + 0.18 + 0.14 + 0.08 = 0.88. Threshold conservative.
    assert fin_band_rate >= 0.70, (
        f"Financials in {{A1..Baa3}} band only {fin_band_rate:.2f}, "
        f"expected >=0.70 (target ~0.88 per bias table)"
    )
    # Technology bias has 14 buckets; expect at least 4 distinct in a sample
    # of 50 (binomial coverage).
    assert len(tech_ratings_seen) >= 4, (
        f"Technology only spanned {len(tech_ratings_seen)} ratings in 50 "
        f"samples; expected >=4 (bias table has 14 buckets)"
    )


def test_market_cap_positive_for_all(in_audience_instruments):
    """Defense-in-depth: aggregate restate of the per-row positivity check
    across the full fixture (no sampling)."""
    ts = datetime(2026, 5, 28)
    for inst in in_audience_instruments:
        row = _row_for(inst, ts)
        assert float(row["MARKET_CAP_USD"]) > 0, (
            f"{inst['TICKER']}: MARKET_CAP_USD non-positive"
        )


# ---------- Bonus: confirm Plan 13 deviation (no `_anchor_in_audience`) ----------

def test_no_anchor_in_audience_function():
    """Plan 13 deviation: every instrument is in audience by definition
    (no IS_ACTIVE column on INSTRUMENT_UNIVERSE; no per-row predicate). The
    SP module MUST NOT define a module-level `_anchor_in_audience` function.

    Guard against the SP author copy-pasting a Plans 1-3/5/6/8 SP scaffold
    that brings the predicate along."""
    assert hasattr(_moodys_module, "_anchor_in_audience") is False, (
        "Plan 13 SP module unexpectedly exports `_anchor_in_audience` — "
        "Plan 13 has no per-row audience predicate (every instrument is in "
        "audience by definition). Don't copy-paste the Plans 1-3/5/6/8 "
        "predicate scaffold; remove it."
    )
