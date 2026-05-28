"""L1 tests for the CoreLogic Property row factory.

Five property classes per spec §7.2:
1. Determinism (same inputs + quarter-bucketing)
2. Audience scoping (BUSINESS / PERSON-without-ZIP raise)
3. Boring-case coverage (every PERSON+ZIP anchor produces a row, including non-owners)
4. Anchor influence — age -> owner_prob, income -> property_value, state -> flood_zone
5. Schema contract — output dict matches the 15 columns + NULL fields when IS_OWNER=false

Plus range/canonical tests and a year-stable test for LAST_TRANSFER_YEAR + MORTGAGE_RATE_PCT.
"""
from datetime import datetime
from statistics import mean

import pytest

# Imports from the SP module (T4 builds it).
from sp_generate_corelogic_property import _row_for, EXPECTED_OUTPUT_COLUMNS


# ---------- Property 1: Determinism ----------

def test_determinism_same_inputs(in_audience_anchors):
    """Same (anchor, ts) -> same dict, byte for byte."""
    ts = datetime(2026, 5, 1)
    for anchor in in_audience_anchors[:5]:
        a = _row_for(anchor, ts)
        b = _row_for(anchor, ts)
        assert a == b, f"non-deterministic for {anchor['ACCOUNT_ID']}"


def test_determinism_buckets_by_quarter(in_audience_anchors):
    """Different days within the same quarter -> identical output;
    a new quarter -> new draw."""
    anchor = in_audience_anchors[0]
    # Q2 = Apr/May/Jun -> all bucket to Apr 1
    a = _row_for(anchor, datetime(2026, 4, 1))
    b = _row_for(anchor, datetime(2026, 5, 17))
    c = _row_for(anchor, datetime(2026, 6, 30))
    # Q3 = Jul/Aug/Sep -> bucket to Jul 1
    d = _row_for(anchor, datetime(2026, 7, 1))
    assert a == b, "mid-quarter (May 17) re-run differs from Apr 1"
    assert a == c, "end-quarter (Jun 30) re-run differs from Apr 1"
    assert a != d, "new quarter (Jul 1) should produce a new draw"


# ---------- Property 2: Audience scoping ----------

def test_audience_violators_raise(out_of_audience_anchors):
    """BUSINESS anchors and PERSON-without-ZIP must raise (defense in depth).

    Caller-side audience SQL filters them out, but if such a row leaks through,
    the row factory catches it loudly."""
    if not out_of_audience_anchors:
        pytest.skip("no out-of-audience anchors in fixture")
    # Sample a mix: at least one BUSINESS + one PERSON-without-ZIP
    business = [a for a in out_of_audience_anchors if a["ACCOUNT_TYPE_FLAG"] == "BUSINESS"]
    person_no_zip = [a for a in out_of_audience_anchors if a["ACCOUNT_TYPE_FLAG"] == "PERSON"]
    sampled = business[:2] + person_no_zip[:2]
    if not sampled:
        pytest.skip("no audience violators sampled")
    for bad in sampled:
        with pytest.raises((ValueError, AssertionError)):
            _row_for(bad, datetime(2026, 5, 1))


# ---------- Property 3: Boring-case coverage ----------

def test_boring_case_still_returns_row(in_audience_anchors):
    """Every PERSON+ZIP anchor produces a non-None row with ACCOUNT_ID populated."""
    if not in_audience_anchors:
        pytest.skip("empty audience")
    for anchor in in_audience_anchors[:10]:
        row = _row_for(anchor, datetime(2026, 5, 1))
        assert row is not None
        assert row["ACCOUNT_ID"] == anchor["ACCOUNT_ID"]
        # Always-populated fields must be present even for non-owners.
        assert row["FLOOD_ZONE_CODE"] is not None
        assert row["WILDFIRE_RISK_SCORE"] is not None
        assert row["LIEN_COUNT"] is not None
        assert row["GENERATED_AT"] is not None


def test_non_owners_get_a_row_with_null_property_fields(in_audience_anchors):
    """Even non-owners (renters) emit a row, with the 8 NULLable property
    fields set to None and the 6 always-populated fields populated."""
    if not in_audience_anchors:
        pytest.skip("empty audience")
    # Roll over multiple quarters so we're virtually guaranteed at least one
    # IS_OWNER=false.  ~38% renter-probability across the audience.
    rows = [_row_for(a, datetime(2026, m, 1))
            for a in in_audience_anchors
            for m in (1, 4, 7, 10)]
    non_owner_rows = [r for r in rows if r["IS_OWNER"] is False]
    if not non_owner_rows:
        pytest.skip("no non-owners produced — distribution likely off")
    for row in non_owner_rows[:5]:
        # 8 NULLable fields when IS_OWNER=false (per rowspec).
        assert row["PRIMARY_PROPERTY_TYPE"] is None
        assert row["ESTIMATED_PROPERTY_VALUE"] is None
        assert row["OUTSTANDING_MORTGAGE_BALANCE"] is None
        assert row["LOAN_TO_VALUE_PCT"] is None
        assert row["EQUITY_USD"] is None
        assert row["MORTGAGE_RATE_PCT"] is None
        assert row["LAST_TRANSFER_YEAR"] is None
        assert row["HELOC_OPPORTUNITY_SCORE"] is None
        # Always-populated fields.
        assert row["FLOOD_ZONE_CODE"] is not None
        assert row["WILDFIRE_RISK_SCORE"] is not None
        assert row["LIEN_COUNT"] == 0  # rowspec: non-owners have lien_count=0


# ---------- Property 4: Anchor influence (load-bearing tests) ----------

def _age_at(anchor, when):
    bd = datetime.fromisoformat(anchor["BIRTHDATE"])
    return (when - bd).days // 365


def test_age_correlates_with_owner_probability(in_audience_anchors):
    """Per rowspec owner-probability table:
       Age 65+    -> 80% owner_prob
       Age 18-25  -> ~5% owner_prob (Gen Z)
    Multi-quarter roll for stability."""
    today = datetime(2026, 5, 28)
    older = [a for a in in_audience_anchors if _age_at(a, today) >= 65]
    young = [a for a in in_audience_anchors if 18 <= _age_at(a, today) <= 25]
    if not older or not young:
        pytest.skip(
            f"need both age cohorts; got older={len(older)}, young={len(young)}")

    # 4 quarters per year for stability.
    older_owner = [_row_for(a, datetime(2026, q, 1))["IS_OWNER"]
                   for a in older for q in (1, 4, 7, 10)]
    young_owner = [_row_for(a, datetime(2026, q, 1))["IS_OWNER"]
                   for a in young for q in (1, 4, 7, 10)]

    older_rate = sum(1 for v in older_owner if v) / len(older_owner)
    young_rate = sum(1 for v in young_owner if v) / len(young_owner)

    assert older_rate >= 0.75, (
        f"expected age 65+ owner rate >= 75%, got {older_rate:.1%} "
        f"({sum(1 for v in older_owner if v)}/{len(older_owner)})"
    )
    assert young_rate <= 0.15, (
        f"expected age 18-25 owner rate <= 15%, got {young_rate:.1%} "
        f"({sum(1 for v in young_owner if v)}/{len(young_owner)})"
    )


def test_income_correlates_with_property_value(in_audience_anchors):
    """High-income (>=$250K) PERSON owners have >=1.6x mean ESTIMATED_PROPERTY_VALUE
    vs low-income (<$50K) PERSON owners. Filter to IS_OWNER=true rows only."""
    high = [a for a in in_audience_anchors if (a["ANNUAL_INCOME"] or 0) >= 250_000]
    low = [a for a in in_audience_anchors if (a["ANNUAL_INCOME"] or 0) < 50_000]
    if not high or not low:
        pytest.skip(
            f"need both income cohorts; got high={len(high)}, low={len(low)}")

    # 4 quarters of rolls for stability.
    high_vals, low_vals = [], []
    for a in high:
        for q in (1, 4, 7, 10):
            r = _row_for(a, datetime(2026, q, 1))
            if r["IS_OWNER"] and r["ESTIMATED_PROPERTY_VALUE"] is not None:
                high_vals.append(r["ESTIMATED_PROPERTY_VALUE"])
    for a in low:
        for q in (1, 4, 7, 10):
            r = _row_for(a, datetime(2026, q, 1))
            if r["IS_OWNER"] and r["ESTIMATED_PROPERTY_VALUE"] is not None:
                low_vals.append(r["ESTIMATED_PROPERTY_VALUE"])
    if not high_vals or not low_vals:
        pytest.skip("not enough owners in both cohorts to compare")

    high_mean = mean(high_vals)
    low_mean = mean(low_vals)
    assert high_mean >= 1.6 * low_mean, (
        f"expected high-income owner property value >= 1.6x low-income; "
        f"got high={high_mean:.0f} vs low={low_mean:.0f} (ratio {high_mean/low_mean:.2f}x)"
    )


def test_state_correlates_with_flood_zone(in_audience_anchors):
    """High-flood states (FL/LA/TX/NC) have higher rate of non-X FLOOD_ZONE_CODE
    than low-flood states (NY/CO/OH/IL). Multi-quarter roll. Gap >= 10 pp."""
    high_states = {"FL", "LA", "TX", "NC"}
    low_states = {"NY", "CO", "OH", "IL"}
    high = [a for a in in_audience_anchors if a.get("STATE_CODE") in high_states]
    low = [a for a in in_audience_anchors if a.get("STATE_CODE") in low_states]
    if not high or not low:
        pytest.skip(
            f"need both state cohorts; got high={len(high)}, low={len(low)}")

    # 4 quarters of rolls for stability.
    high_zones = [_row_for(a, datetime(2026, q, 1))["FLOOD_ZONE_CODE"]
                  for a in high for q in (1, 4, 7, 10)]
    low_zones = [_row_for(a, datetime(2026, q, 1))["FLOOD_ZONE_CODE"]
                 for a in low for q in (1, 4, 7, 10)]

    high_non_x = sum(1 for z in high_zones if z != "X") / len(high_zones)
    low_non_x = sum(1 for z in low_zones if z != "X") / len(low_zones)

    assert high_non_x - low_non_x >= 0.10, (
        f"expected high-flood-state non-X rate > low-flood by >=10 pp; "
        f"got high={high_non_x:.1%} vs low={low_non_x:.1%}"
    )


# ---------- Property 5: Schema contract ----------

EXPECTED_KEYS = {
    "ACCOUNT_ID", "PROFILE_QUARTER", "IS_OWNER",
    "PRIMARY_PROPERTY_TYPE", "ESTIMATED_PROPERTY_VALUE",
    "OUTSTANDING_MORTGAGE_BALANCE", "LOAN_TO_VALUE_PCT", "EQUITY_USD",
    "MORTGAGE_RATE_PCT", "LIEN_COUNT", "FLOOD_ZONE_CODE",
    "WILDFIRE_RISK_SCORE", "LAST_TRANSFER_YEAR",
    "HELOC_OPPORTUNITY_SCORE", "GENERATED_AT",
}


def test_output_schema_matches_table(in_audience_anchors):
    """Output dict keys EXACTLY match the 15 table columns."""
    if not in_audience_anchors:
        pytest.skip("empty audience")
    row = _row_for(in_audience_anchors[0], datetime(2026, 5, 1))
    assert set(row.keys()) == EXPECTED_KEYS, (
        f"row keys {sorted(row.keys())} != expected {sorted(EXPECTED_KEYS)}"
    )


def test_output_schema_constant_matches_test_set():
    """Defense against EXPECTED_OUTPUT_COLUMNS in the SP module drifting
    away from this test's EXPECTED_KEYS — they must be the same set."""
    assert set(EXPECTED_OUTPUT_COLUMNS) == EXPECTED_KEYS, (
        "SP module's EXPECTED_OUTPUT_COLUMNS drifted from test's EXPECTED_KEYS"
    )


def test_non_owner_row_shape_explicit(in_audience_anchors):
    """Forcefully exercise a non-owner: hunt across 4 quarters * full audience
    until we land on at least one IS_OWNER=false row, then verify the exact
    9-NULL / 6-populated shape."""
    if not in_audience_anchors:
        pytest.skip("empty audience")
    target = None
    for a in in_audience_anchors:
        for q in (1, 4, 7, 10):
            r = _row_for(a, datetime(2026, q, 1))
            if r["IS_OWNER"] is False:
                target = r
                break
        if target:
            break
    if not target:
        pytest.skip("no non-owners across the full audience x 4 quarters")
    null_fields = (
        "PRIMARY_PROPERTY_TYPE", "ESTIMATED_PROPERTY_VALUE",
        "OUTSTANDING_MORTGAGE_BALANCE", "LOAN_TO_VALUE_PCT", "EQUITY_USD",
        "MORTGAGE_RATE_PCT", "LAST_TRANSFER_YEAR", "HELOC_OPPORTUNITY_SCORE",
    )
    populated = (
        "ACCOUNT_ID", "PROFILE_QUARTER", "IS_OWNER",
        "LIEN_COUNT", "FLOOD_ZONE_CODE", "WILDFIRE_RISK_SCORE", "GENERATED_AT",
    )
    for f in null_fields:
        assert target[f] is None, f"non-owner {f} should be None, got {target[f]!r}"
    for f in populated:
        assert target[f] is not None, f"non-owner {f} should be populated"


# ---------- Range / canonical-value tests ----------

_FLOOD_ZONES = {"X", "B", "C", "AE", "A", "VE", "V"}


def test_is_owner_is_bool(in_audience_anchors):
    """IS_OWNER must be a Python bool (not 0/1 or truthy strings)."""
    if not in_audience_anchors:
        pytest.skip("empty audience")
    for a in in_audience_anchors[:10]:
        row = _row_for(a, datetime(2026, 5, 1))
        assert isinstance(row["IS_OWNER"], bool), (
            f"IS_OWNER for {a['ACCOUNT_ID']} is {type(row['IS_OWNER']).__name__}, "
            f"expected bool"
        )


def test_lien_count_in_range(in_audience_anchors):
    """LIEN_COUNT must be 0-5 inclusive."""
    if not in_audience_anchors:
        pytest.skip("empty audience")
    for a in in_audience_anchors[:20]:
        for q in (1, 4, 7, 10):
            row = _row_for(a, datetime(2026, q, 1))
            assert 0 <= row["LIEN_COUNT"] <= 5, (
                f"LIEN_COUNT out of range: {row['LIEN_COUNT']}"
            )


def test_wildfire_score_in_range(in_audience_anchors):
    """WILDFIRE_RISK_SCORE must be 0-100 inclusive."""
    if not in_audience_anchors:
        pytest.skip("empty audience")
    for a in in_audience_anchors[:20]:
        for q in (1, 4, 7, 10):
            row = _row_for(a, datetime(2026, q, 1))
            assert 0 <= row["WILDFIRE_RISK_SCORE"] <= 100, (
                f"WILDFIRE_RISK_SCORE out of range: {row['WILDFIRE_RISK_SCORE']}"
            )


def test_flood_zone_canonical(in_audience_anchors):
    """FLOOD_ZONE_CODE must be one of the 7 canonical FEMA codes."""
    if not in_audience_anchors:
        pytest.skip("empty audience")
    for a in in_audience_anchors[:20]:
        for q in (1, 4, 7, 10):
            row = _row_for(a, datetime(2026, q, 1))
            assert row["FLOOD_ZONE_CODE"] in _FLOOD_ZONES, (
                f"unknown FLOOD_ZONE_CODE: {row['FLOOD_ZONE_CODE']!r}"
            )


# ---------- Year-stable tests ----------

def test_last_transfer_year_stable_across_quarters(in_audience_anchors):
    """For a given account, LAST_TRANSFER_YEAR must be IDENTICAL across all
    4 quarters of the same calendar year (year-stable seed key)."""
    if not in_audience_anchors:
        pytest.skip("empty audience")
    # Hunt for at least 3 owners (all 4 quarters must yield IS_OWNER=true).
    checked = 0
    for a in in_audience_anchors:
        rows = [_row_for(a, datetime(2026, q, 1)) for q in (1, 4, 7, 10)]
        if all(r["IS_OWNER"] for r in rows):
            years = {r["LAST_TRANSFER_YEAR"] for r in rows}
            assert len(years) == 1, (
                f"LAST_TRANSFER_YEAR drifted across quarters for "
                f"{a['ACCOUNT_ID']}: {years}"
            )
            checked += 1
            if checked >= 3:
                return
    if checked == 0:
        pytest.skip("no consistent owners across all 4 quarters of 2026")


def test_mortgage_rate_stable_across_quarters(in_audience_anchors):
    """For a given account that owns + carries a mortgage in all 4 quarters,
    MORTGAGE_RATE_PCT must be identical across quarters within the same year
    (fixed-rate mortgages don't reprice quarter-to-quarter)."""
    if not in_audience_anchors:
        pytest.skip("empty audience")
    checked = 0
    for a in in_audience_anchors:
        rows = [_row_for(a, datetime(2026, q, 1)) for q in (1, 4, 7, 10)]
        # Need IS_OWNER=true AND a non-zero mortgage in every quarter.
        if all(r["IS_OWNER"] and r["MORTGAGE_RATE_PCT"] is not None for r in rows):
            rates = {r["MORTGAGE_RATE_PCT"] for r in rows}
            assert len(rates) == 1, (
                f"MORTGAGE_RATE_PCT drifted across quarters for "
                f"{a['ACCOUNT_ID']}: {rates}"
            )
            checked += 1
            if checked >= 2:
                return
    if checked == 0:
        pytest.skip("no consistent mortgaged owners across all 4 quarters of 2026")
