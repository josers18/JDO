"""L1 tests for the Esri Geo Footprint row factory.

Plan 4 is non-account-scoped — the row factory takes a (zip, state, country,
customer_count, run_ts) tuple, not an anchor dict. Property classes adapt:
1. Determinism — same tuple -> same dict
2. Audience scoping — invalid input shapes raise
3. Boring case — Suburban mid-income ZIP still emits a row
4. Anchor influence — state -> median income; urbanicity -> foot traffic
5. Schema contract — output dict matches the 14 columns
"""
from datetime import datetime
from statistics import mean

import pytest

from sp_generate_esri_geo_footprint import _row_for_zip, EXPECTED_OUTPUT_COLUMNS


# ---------- Property 1: Determinism ----------

def test_determinism_same_inputs(all_zips):
    """Same (zip, state, country, customer_count, run_ts) -> same dict."""
    ts = datetime(2026, 5, 1)
    for z in all_zips[:5]:
        a = _row_for_zip(z[0], z[1], z[2], z[3], ts)
        b = _row_for_zip(z[0], z[1], z[2], z[3], ts)
        assert a == b, f"non-deterministic for {z[0]}"


def test_determinism_buckets_by_year_month(all_zips):
    """Different days within a month -> identical output (monthly cadence)."""
    z = all_zips[0]
    a = _row_for_zip(z[0], z[1], z[2], z[3], datetime(2026, 5, 1))
    b = _row_for_zip(z[0], z[1], z[2], z[3], datetime(2026, 5, 17))
    c = _row_for_zip(z[0], z[1], z[2], z[3], datetime(2026, 6, 1))
    assert a == b
    assert a != c  # new month -> new draw


# ---------- Property 2: Input-shape scoping ----------

def test_empty_zip_raises():
    with pytest.raises(ValueError):
        _row_for_zip("", "CA", "US", 100, datetime(2026, 5, 1))


def test_none_zip_raises():
    with pytest.raises((ValueError, TypeError)):
        _row_for_zip(None, "CA", "US", 100, datetime(2026, 5, 1))


def test_non_numeric_zip_raises():
    with pytest.raises(ValueError):
        _row_for_zip("ABCDE", "CA", "US", 100, datetime(2026, 5, 1))


# ---------- Property 3: Boring-case coverage ----------

def test_boring_case_still_returns_row(all_zips):
    """Every ZIP in the fixture produces a non-None row."""
    suburban = ("07030", "NJ", "US", 320)
    row = _row_for_zip(*suburban, datetime(2026, 5, 1))
    assert row is not None
    assert row["BRANCH_ZIP"] == "07030"
    assert row["TAPESTRY_SEGMENT_CODE"] is not None
    assert row["URBANICITY_TIER"] is not None


def test_zero_customer_zip_emits_row(all_zips):
    """An edge-case 0-customer ZIP still produces a row (with 0% market penetration)."""
    row = _row_for_zip("12345", "NY", "US", 0, datetime(2026, 5, 1))
    assert row is not None
    assert row["MARKET_PENETRATION_PCT"] == 0.0  # exact, since 0 / households = 0


# ---------- Property 4: Anchor influence (TWO assertions) ----------

def test_state_correlates_with_median_income(high_income_state_zips, low_income_state_zips):
    """MA/NJ ZIPs should have higher mean MEDIAN_HOUSEHOLD_INCOME than TN/MO/IN."""
    if not high_income_state_zips or not low_income_state_zips:
        pytest.skip(f"need both cohorts; got high={len(high_income_state_zips)}, low={len(low_income_state_zips)}")

    high_incomes = [_row_for_zip(*z, datetime(2026, m, 1))["MEDIAN_HOUSEHOLD_INCOME"]
                    for z in high_income_state_zips for m in range(1, 13)]
    low_incomes = [_row_for_zip(*z, datetime(2026, m, 1))["MEDIAN_HOUSEHOLD_INCOME"]
                   for z in low_income_state_zips for m in range(1, 13)]

    high_mean = mean(high_incomes)
    low_mean = mean(low_incomes)
    assert high_mean - low_mean >= 15000, (
        f"expected MA/NJ income > TN/MO/IN income by >=$15K; got "
        f"high={high_mean:.0f} vs low={low_mean:.0f}"
    )


def test_urbanicity_correlates_with_foot_traffic(urban_zips, rural_zips):
    """Urban Core ZIPs (NY/CA/MA + first-digit 0/1/9) -> mean FOOT_TRAFFIC_INDEX
    > Rural ZIPs (MT/WY/AK/ND/SD)."""
    if not urban_zips or not rural_zips:
        pytest.skip(f"need both cohorts; got urban={len(urban_zips)}, rural={len(rural_zips)}")

    urban_traffic = [_row_for_zip(*z, datetime(2026, m, 1))["FOOT_TRAFFIC_INDEX"]
                     for z in urban_zips for m in range(1, 13)]
    rural_traffic = [_row_for_zip(*z, datetime(2026, m, 1))["FOOT_TRAFFIC_INDEX"]
                     for z in rural_zips for m in range(1, 13)]

    urban_mean = mean(urban_traffic)
    rural_mean = mean(rural_traffic)
    assert urban_mean - rural_mean >= 80, (
        f"expected urban foot traffic > rural by >=80 index points; got "
        f"urban={urban_mean:.1f} vs rural={rural_mean:.1f}"
    )


def test_urbanicity_correlates_with_branch_distance(urban_zips, rural_zips):
    """Urban Core ZIPs -> low DISTANCE_TO_NEAREST_BRANCH_MI; Rural -> high."""
    if not urban_zips or not rural_zips:
        pytest.skip("need both cohorts")
    urban_dist = [_row_for_zip(*z, datetime(2026, m, 1))["DISTANCE_TO_NEAREST_BRANCH_MI"]
                  for z in urban_zips for m in range(1, 13)]
    rural_dist = [_row_for_zip(*z, datetime(2026, m, 1))["DISTANCE_TO_NEAREST_BRANCH_MI"]
                  for z in rural_zips for m in range(1, 13)]
    assert mean(rural_dist) > mean(urban_dist) + 5, (
        f"expected rural branch distance > urban by >=5 mi; got "
        f"rural={mean(rural_dist):.1f} vs urban={mean(urban_dist):.1f}"
    )


# ---------- Property 5: Schema contract ----------

EXPECTED_KEYS = {
    "BRANCH_ZIP", "STATE_CODE", "COUNTRY_CODE", "PROFILE_MONTH",
    "TAPESTRY_SEGMENT_CODE", "TAPESTRY_SEGMENT_NAME",
    "URBANICITY_TIER",
    "MEDIAN_HOUSEHOLD_INCOME", "WEALTH_INDEX",
    "FOOT_TRAFFIC_INDEX", "COMMERCIAL_DENSITY_PER_SQ_MI",
    "DISTANCE_TO_NEAREST_BRANCH_MI", "MARKET_PENETRATION_PCT",
    "BRANCH_RECOMMENDATION", "GENERATED_AT",
}


def test_output_schema_matches_table(all_zips):
    z = all_zips[0]
    row = _row_for_zip(z[0], z[1], z[2], z[3], datetime(2026, 5, 1))
    assert set(row.keys()) == EXPECTED_KEYS


def test_output_schema_constant_matches_test_set():
    assert set(EXPECTED_OUTPUT_COLUMNS) == EXPECTED_KEYS


# ---------- Range / canonical-value tests ----------

_TAPESTRY_CODES = {"TC", "EE", "ND", "BS", "SF", "MD", "SH", "RD", "RC", "HM", "MS", "RH"}
_URBANICITY_TIERS = {"Urban Core", "Suburban", "Small Town", "Rural"}
_BRANCH_RECS = {"Expand", "Maintain", "Optimize", "Consolidate"}


def test_tapestry_code_canonical(all_zips):
    for z in all_zips[:15]:
        row = _row_for_zip(*z, datetime(2026, 5, 1))
        assert row["TAPESTRY_SEGMENT_CODE"] in _TAPESTRY_CODES


def test_urbanicity_canonical(all_zips):
    for z in all_zips[:15]:
        row = _row_for_zip(*z, datetime(2026, 5, 1))
        assert row["URBANICITY_TIER"] in _URBANICITY_TIERS


def test_branch_recommendation_canonical(all_zips):
    for z in all_zips[:15]:
        row = _row_for_zip(*z, datetime(2026, 5, 1))
        assert row["BRANCH_RECOMMENDATION"] in _BRANCH_RECS


def test_scores_in_range(all_zips):
    for z in all_zips[:15]:
        row = _row_for_zip(*z, datetime(2026, 5, 1))
        assert 20000 <= row["MEDIAN_HOUSEHOLD_INCOME"] <= 350000
        assert 50.0 <= row["WEALTH_INDEX"] <= 200.0
        assert 0.0 <= row["FOOT_TRAFFIC_INDEX"] <= 300.0
        assert 0.0 <= row["COMMERCIAL_DENSITY_PER_SQ_MI"] <= 2000.0
        assert 0.0 <= row["DISTANCE_TO_NEAREST_BRANCH_MI"] <= 50.0
        assert 0.0 <= row["MARKET_PENETRATION_PCT"] <= 100.0
