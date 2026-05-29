"""L1 tests for the Moody's Market Context row factory — RE-SCOPED.

**Plan 13 is the FINAL Cumulus plan (13 of 13)** and has been re-scoped from
instrument-scoped (TICKER PK, INSTRUMENT_UNIVERSE audience, 2,004 rows) to
**per-BUSINESS account-scoped** (ACCOUNT_ID PK, audience =
`ACCOUNT_TYPE_FLAG = 'BUSINESS'`, daily cadence, 90-day backfill,
~1.025M rows). Mimics Moody's COMMERCIAL credit risk on COMPANIES.

Key shape changes vs. the prior instrument-scoped L1:
  - Row factory is `_rows_for(anchor, profile_date) -> list[dict]` of length 1
    (cycle-driven externally, mirroring the 1:N daily/per-account pattern).
  - Audience predicate `_anchor_in_audience(anchor)` is now load-bearing
    (PERSONs MUST raise; BUSINESSes MUST emit) — Plan 2 / DnB pattern.
  - Output keys: ACCOUNT_ID + 13 commercial-credit fields (was TICKER + 13).
  - Year-stable invariants are anchored on COMPANY (ACCOUNT_ID) not TICKER.

Property classes (per task spec):
  1. Same-day determinism — _rows_for(anchor, date) byte-identical across calls.
  2. Audience scoping — PERSON anchors raise; BUSINESSes emit.
  3. Boring case — every BUSINESS anchor produces a 14-key dict.
  4. Per-anchor invariants — credit rating / outlook / market cap / volatility
     / 30d change / 52w high>=low / market cap correlates with revenue / industry
     bias / liquidity tier.
  5. Year-stable invariants — same ACCOUNT_ID on day-1 vs day-180 of 2026 yields
     identical CREDIT_RATING / RATING_OUTLOOK / OUTLOOK_LAST_CHANGED_DATE /
     52w HIGH/LOW / RATING_AGENCY_FLAG_COUNT / LIQUIDITY_TIER. Cross-year drift
     NOT asserted (year-stable seed bucket is `datetime(year, 1, 1)`).
  6. 90-day history determinism — 3 anchors x 90 days = 270 rows, all 90 distinct
     PROFILE_DATE per anchor, byte-identical re-run.
  7. Schema contract — 14 keys per the new DDL.

Plus bonus tests:
  - `_anchor_in_audience` returns False for 5+ PERSON anchors.
  - BUSINESS anchors with NULL ANNUAL_REVENUE emit gracefully.
  - PROFILE_DATE pass-through: `_rows_for(a, date(2026, 5, 28))[0]["PROFILE_DATE"]
    == date(2026, 5, 28)`.
"""
from datetime import date, datetime, timedelta

import pytest

# Imports from the SP module (T4 builds the new account-scoped SP).
from sp_generate_moodys_market_context import (
    _rows_for,
    _anchor_in_audience,
    EXPECTED_OUTPUT_COLUMNS,
)


# Canonical vocabularies per rowspec / DDL.
_VALID_CREDIT_RATINGS = frozenset({
    "Aaa", "Aa1", "Aa2", "Aa3", "A1", "A2", "A3",
    "Baa1", "Baa2", "Baa3", "Ba1", "Ba2", "Ba3",
    "B1", "B2", "B3", "Caa1", "Caa2", "Caa3",
    "Ca", "C", "NR",
})
_VALID_RATING_OUTLOOKS = frozenset({"Stable", "Positive", "Negative", "Developing", "Watch"})
_VALID_LIQUIDITY_TIERS = frozenset({"Tier 1", "Tier 2", "Tier 3", "Illiquid"})

# 17-column schema per the v2.x multi-org-additive DDL (per-BUSINESS account-scoped, ORG_ID first).
EXPECTED_KEYS = frozenset({
    "ORG_ID",
    "ACCOUNT_ID",
    "PROFILE_DATE",
    "CREDIT_RATING",
    "RATING_OUTLOOK",
    "OUTLOOK_LAST_CHANGED_DATE",
    "MARKET_CAP_USD",
    "DAILY_VOLATILITY_PCT",
    "THIRTY_DAY_PRICE_CHANGE_PCT",
    "FIFTY_TWO_WEEK_HIGH_USD",
    "FIFTY_TWO_WEEK_LOW_USD",
    "RATING_AGENCY_FLAG_COUNT",
    "LIQUIDITY_TIER",
    "ANNUAL_REVENUE_USD",
    "EMPLOYEE_COUNT",
    "LAST_DATA_REFRESH_AT",
    "GENERATED_AT",
})
# Note: spec says "14 columns total" but enumerates 16 fields (14 business +
# LAST_DATA_REFRESH_AT + GENERATED_AT). The schema test below asserts the SP
# module's `EXPECTED_OUTPUT_COLUMNS` matches whatever shape the SP returns,
# so any drift between the spec count and the implementation surfaces here.


# Banking-ish industries — task spec says "Banking-INDUSTRY anchors" but the
# fixture's actual industry values use "Finance"; substring-match both for
# robustness against rename.
_BANKING_INDUSTRIES = ("Finance", "Banking")


def _matches_industry(industry, keywords):
    if not industry:
        return False
    low = industry.lower()
    return any(k.lower() in low for k in keywords)


# ---------- Property 1: Same-day determinism ----------

def test_determinism_same_day_byte_identical(in_audience_anchors):
    """`_rows_for(anchor, date)` is byte-identical across back-to-back calls."""
    if not in_audience_anchors:
        pytest.skip("empty BUSINESS audience")
    d = date(2026, 5, 28)
    for anchor in in_audience_anchors[:10]:
        a = _rows_for(anchor, d)
        b = _rows_for(anchor, d)
        assert a == b, f"non-deterministic for {anchor['ACCOUNT_ID']}"


def test_determinism_accepts_datetime_or_date(in_audience_anchors):
    """`_rows_for(anchor, datetime)` collapses to the same row as
    `_rows_for(anchor, date)` for the same calendar day — mid-day re-runs
    re-bucket to the day-start."""
    if not in_audience_anchors:
        pytest.skip("empty BUSINESS audience")
    d = date(2026, 5, 28)
    dt_morning = datetime(2026, 5, 28, 3, 0, 0)
    dt_night = datetime(2026, 5, 28, 23, 30, 0)
    for anchor in in_audience_anchors[:5]:
        a = _rows_for(anchor, d)
        b = _rows_for(anchor, dt_morning)
        c = _rows_for(anchor, dt_night)
        assert a == b == c, (
            f"date / datetime(03:00) / datetime(23:30) differ for "
            f"{anchor['ACCOUNT_ID']}"
        )


# ---------- Property 2: Audience scoping ----------

def test_person_anchors_raise(out_of_audience_anchors):
    """PERSON anchors fail the predicate AND `_rows_for` raises ValueError."""
    if not out_of_audience_anchors:
        pytest.skip("no out-of-audience anchors in fixture")
    for bad in out_of_audience_anchors[:5]:
        assert _anchor_in_audience(bad) is False, (
            f"_anchor_in_audience should reject PERSON {bad['ACCOUNT_ID']}"
        )
        with pytest.raises((ValueError, AssertionError)):
            _rows_for(bad, date(2026, 5, 28))


def test_business_anchors_in_audience(in_audience_anchors):
    """Every BUSINESS anchor passes the predicate and emits >= 1 row."""
    if not in_audience_anchors:
        pytest.skip("empty BUSINESS audience")
    for anchor in in_audience_anchors:
        assert _anchor_in_audience(anchor) is True, (
            f"_anchor_in_audience should accept BUSINESS {anchor['ACCOUNT_ID']}"
        )
        rows = _rows_for(anchor, date(2026, 5, 28))
        assert isinstance(rows, list)
        assert len(rows) == 1, (
            f"{anchor['ACCOUNT_ID']}: expected list-of-1, got {len(rows)}"
        )


# ---------- Property 3: Boring case (every BUSINESS anchor emits) ----------

def test_every_business_anchor_emits_14_key_dict(in_audience_anchors):
    """Every BUSINESS anchor produces a 14-key dict with ACCOUNT_ID populated.

    The schema-key count is asserted via `EXPECTED_KEYS` (which the test set
    syncs against the SP module's `EXPECTED_OUTPUT_COLUMNS`). If the SP
    actually emits more or fewer keys, the schema-contract test in Property 7
    fails first."""
    if not in_audience_anchors:
        pytest.skip("empty BUSINESS audience")
    d = date(2026, 5, 28)
    for anchor in in_audience_anchors:
        rows = _rows_for(anchor, d)
        assert len(rows) == 1
        row = rows[0]
        assert row is not None
        assert row["ACCOUNT_ID"] == anchor["ACCOUNT_ID"], (
            f"ACCOUNT_ID passthrough broken: input {anchor['ACCOUNT_ID']!r} "
            f"!= output {row['ACCOUNT_ID']!r}"
        )
        # Required-non-null per DDL (only OUTLOOK_LAST_CHANGED_DATE may be NULL).
        for f in EXPECTED_KEYS - {"OUTLOOK_LAST_CHANGED_DATE"}:
            assert row[f] is not None, (
                f"{anchor['ACCOUNT_ID']}: required-non-null field {f} is None"
            )


# ---------- Property 4: Per-anchor invariants over a 90-day roll ----------

# A small slice of in-audience anchors for the 90-day roll (kept tight to keep
# this test L1-fast; 5 anchors x 90 days = 450 rows is enough to exercise every
# range invariant without slowing the suite).
def _ninety_day_rows(anchor, start=date(2026, 3, 1)):
    rows = []
    for i in range(90):
        d = start + timedelta(days=i)
        rows.extend(_rows_for(anchor, d))
    return rows


def test_4a_credit_rating_canonical(in_audience_anchors):
    """CREDIT_RATING in canonical 22-rating + NR set across 90 days."""
    if not in_audience_anchors:
        pytest.skip("empty BUSINESS audience")
    for anchor in in_audience_anchors[:5]:
        for row in _ninety_day_rows(anchor):
            r = row["CREDIT_RATING"]
            assert r in _VALID_CREDIT_RATINGS, (
                f"{anchor['ACCOUNT_ID']}: CREDIT_RATING={r!r} not in canonical "
                f"23-value set"
            )


def test_4b_rating_outlook_canonical(in_audience_anchors):
    """RATING_OUTLOOK in canonical 5-value set across 90 days."""
    if not in_audience_anchors:
        pytest.skip("empty BUSINESS audience")
    for anchor in in_audience_anchors[:5]:
        for row in _ninety_day_rows(anchor):
            o = row["RATING_OUTLOOK"]
            assert o in _VALID_RATING_OUTLOOKS, (
                f"{anchor['ACCOUNT_ID']}: RATING_OUTLOOK={o!r} not in "
                f"{set(_VALID_RATING_OUTLOOKS)}"
            )


def test_4c_market_cap_positive(in_audience_anchors):
    """MARKET_CAP_USD > 0 for every row across 90 days."""
    if not in_audience_anchors:
        pytest.skip("empty BUSINESS audience")
    for anchor in in_audience_anchors[:5]:
        for row in _ninety_day_rows(anchor):
            cap = row["MARKET_CAP_USD"]
            assert float(cap) > 0, (
                f"{anchor['ACCOUNT_ID']}: MARKET_CAP_USD={cap} not > 0"
            )


def test_4d_volatility_in_range(in_audience_anchors):
    """DAILY_VOLATILITY_PCT in [0, 25] across 90 days (daily-bucketed)."""
    if not in_audience_anchors:
        pytest.skip("empty BUSINESS audience")
    for anchor in in_audience_anchors[:5]:
        for row in _ninety_day_rows(anchor):
            v = row["DAILY_VOLATILITY_PCT"]
            assert 0.0 <= float(v) <= 25.0, (
                f"{anchor['ACCOUNT_ID']}: DAILY_VOLATILITY_PCT={v} out of [0, 25]"
            )


def test_4e_thirty_day_change_in_range(in_audience_anchors):
    """THIRTY_DAY_PRICE_CHANGE_PCT in [-50, 50] across 90 days."""
    if not in_audience_anchors:
        pytest.skip("empty BUSINESS audience")
    for anchor in in_audience_anchors[:5]:
        for row in _ninety_day_rows(anchor):
            v = row["THIRTY_DAY_PRICE_CHANGE_PCT"]
            assert -50.0 <= float(v) <= 50.0, (
                f"{anchor['ACCOUNT_ID']}: THIRTY_DAY_PRICE_CHANGE_PCT={v} out "
                f"of [-50, 50]"
            )


def test_4f_high_ge_low(in_audience_anchors):
    """FIFTY_TWO_WEEK_HIGH_USD >= FIFTY_TWO_WEEK_LOW_USD across 90 days."""
    if not in_audience_anchors:
        pytest.skip("empty BUSINESS audience")
    for anchor in in_audience_anchors[:5]:
        for row in _ninety_day_rows(anchor):
            hi = float(row["FIFTY_TWO_WEEK_HIGH_USD"])
            lo = float(row["FIFTY_TWO_WEEK_LOW_USD"])
            assert hi >= lo, (
                f"{anchor['ACCOUNT_ID']}: 52W HIGH={hi} < LOW={lo}"
            )


def test_4g_market_cap_correlates_with_revenue(in_audience_anchors):
    """For anchors with ANNUAL_REVENUE > 0, MARKET_CAP_USD lies in
    `[ANNUAL_REVENUE * 0.5, ANNUAL_REVENUE * 50]` (loose 100x-band check).

    Defense against a row factory that ignores ANNUAL_REVENUE when computing
    market cap. The rowspec target is ~5x with daily noise; the asserted band
    [0.5x, 50x] is intentionally loose to absorb noise + clamps."""
    if not in_audience_anchors:
        pytest.skip("empty BUSINESS audience")
    d = date(2026, 5, 28)
    revenue_anchors = [
        a for a in in_audience_anchors
        if a.get("ANNUAL_REVENUE") and float(a["ANNUAL_REVENUE"]) > 0
    ]
    if not revenue_anchors:
        pytest.skip("no BUSINESS anchors with ANNUAL_REVENUE > 0")
    for anchor in revenue_anchors[:20]:
        rev = float(anchor["ANNUAL_REVENUE"])
        row = _rows_for(anchor, d)[0]
        cap = float(row["MARKET_CAP_USD"])
        lo, hi = rev * 0.5, rev * 50.0
        assert lo <= cap <= hi, (
            f"{anchor['ACCOUNT_ID']}: MARKET_CAP_USD={cap:.0f} out of "
            f"[{lo:.0f}, {hi:.0f}] for ANNUAL_REVENUE={rev:.0f}"
        )


def test_4h_credit_rating_biased_by_industry(in_audience_anchors):
    """Banking/Finance-INDUSTRY anchors concentrate in A/Baa range across the
    50-anchor BUSINESS sample. Loose distributional check: >= 60% of
    Banking/Finance ratings fall within {A1..Baa3}.

    Note: task spec says "Banking-INDUSTRY"; fixture uses "Finance" as the
    INDUSTRY value (no "Banking" string in SAMPLE_ANCHORS). Substring-match
    handles both — this is a flagged ambiguity (see report)."""
    if not in_audience_anchors:
        pytest.skip("empty BUSINESS audience")
    d = date(2026, 5, 28)
    a_baa_band = {"A1", "A2", "A3", "Baa1", "Baa2", "Baa3"}
    banking = [
        a for a in in_audience_anchors
        if _matches_industry(a.get("INDUSTRY"), _BANKING_INDUSTRIES)
    ]
    if len(banking) < 2:
        pytest.skip(
            f"need >= 2 Banking/Finance-industry anchors, got {len(banking)}"
        )
    in_band = 0
    total = 0
    for anchor in banking:
        row = _rows_for(anchor, d)[0]
        total += 1
        if row["CREDIT_RATING"] in a_baa_band:
            in_band += 1
    rate = in_band / total
    # Loose distributional check — Banking/Finance bias table sums to ~0.88
    # over {A1..Baa3} per the rowspec. Threshold conservative for small-n
    # (only ~5 Finance-industry anchors in the 50-business fixture).
    assert rate >= 0.60, (
        f"Banking/Finance-INDUSTRY in {{A1..Baa3}} only {rate:.2%} "
        f"({in_band}/{total}); expected >= 60%"
    )


def test_4i_liquidity_tier_canonical(in_audience_anchors):
    """LIQUIDITY_TIER in canonical 4-value set across 90 days."""
    if not in_audience_anchors:
        pytest.skip("empty BUSINESS audience")
    for anchor in in_audience_anchors[:5]:
        for row in _ninety_day_rows(anchor):
            tier = row["LIQUIDITY_TIER"]
            assert tier in _VALID_LIQUIDITY_TIERS, (
                f"{anchor['ACCOUNT_ID']}: LIQUIDITY_TIER={tier!r} not in "
                f"{set(_VALID_LIQUIDITY_TIERS)}"
            )


# ---------- Property 5: Year-stable invariants (load-bearing) ----------

_YEAR_STABLE_FIELDS = (
    "CREDIT_RATING",
    "RATING_OUTLOOK",
    "OUTLOOK_LAST_CHANGED_DATE",
    "FIFTY_TWO_WEEK_HIGH_USD",
    "FIFTY_TWO_WEEK_LOW_USD",
    "RATING_AGENCY_FLAG_COUNT",
    "LIQUIDITY_TIER",
)


def test_year_stable_credit_rating(in_audience_anchors):
    """For every BUSINESS anchor, day-1 vs day-180 of 2026 produce IDENTICAL
    year-stable fields (CREDIT_RATING, RATING_OUTLOOK,
    OUTLOOK_LAST_CHANGED_DATE, 52W HIGH/LOW, RATING_AGENCY_FLAG_COUNT,
    LIQUIDITY_TIER).

    Load-bearing: this is the structural test for the hybrid year-stable +
    daily model. If any year-stable field drifts within a calendar year, the
    two-salt seed bucketing is broken (the year-stable salt is leaking daily
    entropy). Cross-year drift (2026 -> 2027) is intentional and NOT
    asserted here — the year-stable seed bucket is `datetime(year, 1, 1)`."""
    if not in_audience_anchors:
        pytest.skip("empty BUSINESS audience")
    day1 = date(2026, 1, 1)
    day180 = date(2026, 6, 30)
    for anchor in in_audience_anchors[:10]:
        a = _rows_for(anchor, day1)[0]
        b = _rows_for(anchor, day180)[0]
        for fld in _YEAR_STABLE_FIELDS:
            assert a[fld] == b[fld], (
                f"{anchor['ACCOUNT_ID']}: year-stable field {fld} drifted "
                f"within calendar year 2026 (Jan 1: {a[fld]!r} vs Jun 30: "
                f"{b[fld]!r})"
            )


# Cross-year (2026 vs 2027) drift is allowed and not asserted — the
# year-stable seed bucket is `datetime(year, 1, 1)`, so a year shift
# legitimately rerolls these fields.


# ---------- Property 6: 90-day history determinism ----------

def test_90day_history_per_anchor(in_audience_anchors):
    """3 BUSINESS anchors x 90 days = 270 rows total. Every anchor produces
    exactly 90 distinct PROFILE_DATE values, and the full 270-row sequence is
    byte-identical across re-runs (90-day backfill determinism).

    This is the structural cadence test for the daily 90-day backfill that
    underpins the ~1.025M-row dataset (~11,389 BUSINESS anchors x 90 days)."""
    if len(in_audience_anchors) < 3:
        pytest.skip("need >= 3 BUSINESS anchors for 90-day history test")
    start = date(2026, 3, 1)
    sample = in_audience_anchors[:3]

    def collect():
        all_rows = []
        for anchor in sample:
            anchor_rows = []
            for i in range(90):
                d = start + timedelta(days=i)
                anchor_rows.extend(_rows_for(anchor, d))
            anchor_dates = [r["PROFILE_DATE"] for r in anchor_rows]
            assert len(anchor_dates) == 90, (
                f"{anchor['ACCOUNT_ID']}: expected 90 rows, got {len(anchor_dates)}"
            )
            assert len(set(anchor_dates)) == 90, (
                f"{anchor['ACCOUNT_ID']}: only {len(set(anchor_dates))} "
                f"distinct PROFILE_DATE in 90-day roll (expected 90)"
            )
            all_rows.extend(anchor_rows)
        return all_rows

    first = collect()
    second = collect()
    assert len(first) == 270, f"expected 270 rows, got {len(first)}"
    assert first == second, (
        "90-day history is non-deterministic across re-runs"
    )


# ---------- Property 7: Schema contract ----------

def test_output_schema_has_expected_keys(in_audience_anchors):
    """Output dict has EXACTLY the DDL columns — no extras, no missing —
    matching `EXPECTED_OUTPUT_COLUMNS` from the SP module."""
    if not in_audience_anchors:
        pytest.skip("empty BUSINESS audience")
    row = _rows_for(in_audience_anchors[0], date(2026, 5, 28))[0]
    assert set(row.keys()) == EXPECTED_KEYS, (
        f"row keys {sorted(row.keys())} != expected {sorted(EXPECTED_KEYS)}"
    )


def test_expected_output_columns_constant_matches_test_set():
    """Defense against `EXPECTED_OUTPUT_COLUMNS` in the SP module drifting
    away from this test's `EXPECTED_KEYS` — they MUST be the same set."""
    assert set(EXPECTED_OUTPUT_COLUMNS) == EXPECTED_KEYS, (
        f"SP module's EXPECTED_OUTPUT_COLUMNS "
        f"{sorted(set(EXPECTED_OUTPUT_COLUMNS))} drifted from test's "
        f"EXPECTED_KEYS {sorted(EXPECTED_KEYS)}"
    )


# ---------- Bonus tests ----------

def test_no_anchor_in_audience_returns_false_for_person(out_of_audience_anchors):
    """Explicit defense-in-depth: `_anchor_in_audience` returns False for 5+
    PERSON anchors. Guards against the SP author over-broadening the predicate
    (e.g., accepting any anchor with ACCOUNT_ID, regardless of TYPE_FLAG)."""
    persons = [
        a for a in out_of_audience_anchors
        if a.get("ACCOUNT_TYPE_FLAG") == "PERSON"
    ]
    if len(persons) < 5:
        pytest.skip(f"need >= 5 PERSON anchors, got {len(persons)}")
    for p in persons[:5]:
        assert _anchor_in_audience(p) is False, (
            f"_anchor_in_audience accepted PERSON {p['ACCOUNT_ID']} — "
            f"BUSINESS-only predicate over-broadened"
        )


def test_business_anchor_with_null_revenue_handled(in_audience_anchors):
    """BUSINESS anchors with NULL ANNUAL_REVENUE emit gracefully — `_rows_for`
    must not raise, and the resulting MARKET_CAP_USD must still be > 0
    (computed via fallback path).

    Synthesizes a NULL-revenue BUSINESS anchor when the fixture has none
    (the SAMPLE_ANCHORS fixture currently populates ANNUAL_REVENUE for every
    BUSINESS row, so this also doubles as a forward-defense as the fixture
    grows).
    """
    if not in_audience_anchors:
        pytest.skip("empty BUSINESS audience")
    template = dict(in_audience_anchors[0])
    template["ACCOUNT_ID"] = "TEST-BIZ-NULL-REV"
    template["ANNUAL_REVENUE"] = None
    rows = _rows_for(template, date(2026, 5, 28))
    assert len(rows) == 1
    row = rows[0]
    assert row["ACCOUNT_ID"] == "TEST-BIZ-NULL-REV"
    assert float(row["MARKET_CAP_USD"]) > 0, (
        "NULL-revenue BUSINESS anchor should still produce positive "
        "MARKET_CAP_USD via fallback path"
    )


def test_profile_date_passes_through(in_audience_anchors):
    """`_rows_for(anchor, date(2026, 5, 28))[0]["PROFILE_DATE"] ==
    date(2026, 5, 28)` — daily bucketing is keyed on the input date."""
    if not in_audience_anchors:
        pytest.skip("empty BUSINESS audience")
    target = date(2026, 5, 28)
    for anchor in in_audience_anchors[:5]:
        row = _rows_for(anchor, target)[0]
        assert row["PROFILE_DATE"] == target, (
            f"{anchor['ACCOUNT_ID']}: PROFILE_DATE={row['PROFILE_DATE']} "
            f"!= input date {target}"
        )
