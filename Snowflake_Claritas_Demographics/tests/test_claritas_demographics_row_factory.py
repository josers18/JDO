"""L1 tests for the Claritas row factory.

Five property classes per spec §7.2:
1. Determinism
2. Audience scoping (predicate-violating anchors raise)
3. Boring-case coverage (boring anchor still emits a row)
4. Anchor influence — low vs high income produces different PRIZM distributions
5. Schema contract — output dict matches the table columns
"""
from datetime import datetime
from collections import Counter

import pytest

# Imports from the SP module (T4 builds it).
from sp_generate_claritas_demographics import _row_for, EXPECTED_OUTPUT_COLUMNS


# ---------- Property 1: Determinism ----------

def test_determinism_same_inputs(in_audience_anchors):
    """Same (anchor, ts) → same dict, byte for byte."""
    ts = datetime(2026, 5, 1)
    for anchor in in_audience_anchors[:5]:
        a = _row_for(anchor, ts)
        b = _row_for(anchor, ts)
        assert a == b, f"non-deterministic for {anchor['ACCOUNT_ID']}"


def test_determinism_buckets_by_year_month(in_audience_anchors):
    """Different days within a month → identical output (monthly cadence)."""
    anchor = in_audience_anchors[0]
    a = _row_for(anchor, datetime(2026, 5, 1))
    b = _row_for(anchor, datetime(2026, 5, 17))
    c = _row_for(anchor, datetime(2026, 6, 1))
    assert a == b
    assert a != c  # new month → new draw


# ---------- Property 2: Audience scoping ----------

def test_audience_violators_raise(out_of_audience_anchors):
    """BUSINESS anchors must raise ValueError (defense in depth).

    Caller-side audience SQL filters them out, but if a BUSINESS row
    leaks through (e.g., misclassified by ACCOUNT_TYPE_FLAG heuristic),
    the row factory catches it loudly."""
    if not out_of_audience_anchors:
        pytest.skip("no out-of-audience anchors in fixture")
    for bad in out_of_audience_anchors[:3]:
        with pytest.raises((ValueError, AssertionError)):
            _row_for(bad, datetime(2026, 5, 1))


# ---------- Property 3: Boring-case coverage ----------

def test_boring_case_still_returns_row(in_audience_anchors):
    """Every PERSON anchor produces a non-None row with ACCOUNT_ID populated.

    The 'boring' case for Claritas is just a moderate-income retail person
    — no special-case skip; they still get a Mid-Income PRIZM segment."""
    if not in_audience_anchors:
        pytest.skip("empty audience")
    for anchor in in_audience_anchors[:10]:
        row = _row_for(anchor, datetime(2026, 5, 1))
        assert row is not None
        assert row["ACCOUNT_ID"] == anchor["ACCOUNT_ID"]
        assert row["PRIZM_SEGMENT_CODE"] is not None  # never empty
        assert row["LIFE_STAGE"] is not None


# ---------- Property 4: Anchor influence (load-bearing test) ----------

def test_prizm_distribution_shifts_with_income(all_anchors):
    """The MOST IMPORTANT TEST — a row factory that ignores its anchor and
    just returns hash-derived values would pass determinism + schema, but
    produce demographically-incoherent data (a low-income person assigned
    'Upper Crust' PRIZM segment).

    Split persons by income, check PRIZM distributions differ."""
    persons = [a for a in all_anchors if a["ACCOUNT_TYPE_FLAG"] == "PERSON"]
    if len(persons) < 10:
        pytest.skip("need >= 10 persons for distribution test")

    low = [p for p in persons if (p["ANNUAL_INCOME"] or 0) < 50_000]
    high = [p for p in persons if (p["ANNUAL_INCOME"] or 0) >= 250_000]
    if not low or not high:
        pytest.skip("need both low and high income anchors")

    # Roll multiple months for distribution stability
    rows_low = [_row_for(a, datetime(2026, m, 1))["PRIZM_SEGMENT_CODE"]
                for a in low for m in range(1, 13)]
    rows_high = [_row_for(a, datetime(2026, m, 1))["PRIZM_SEGMENT_CODE"]
                 for a in high for m in range(1, 13)]

    counter_low = Counter(rows_low)
    counter_high = Counter(rows_high)

    # Distributions must NOT be identical
    assert counter_low != counter_high, (
        "PRIZM distribution did not shift between low and high income — "
        "row factory may be ignoring its anchor"
    )

    # Affluent codes (UC/MB/MS/PP) should be MORE common in high-income
    affluent = {"UC", "MB", "MS", "PP", "BB", "YA"}
    striving = {"SS", "HR", "MT", "FS"}

    high_affluent_share = sum(counter_high.get(c, 0) for c in affluent) / sum(counter_high.values())
    low_affluent_share = sum(counter_low.get(c, 0) for c in affluent) / sum(counter_low.values())
    assert high_affluent_share > low_affluent_share, (
        f"affluent PRIZM share should be higher in high-income cohort; "
        f"got high={high_affluent_share:.2%} vs low={low_affluent_share:.2%}"
    )

    high_striving_share = sum(counter_high.get(c, 0) for c in striving) / sum(counter_high.values())
    low_striving_share = sum(counter_low.get(c, 0) for c in striving) / sum(counter_low.values())
    assert low_striving_share > high_striving_share, (
        f"striving PRIZM share should be higher in low-income cohort; "
        f"got low={low_striving_share:.2%} vs high={high_striving_share:.2%}"
    )


def test_life_stage_correlates_with_age(all_anchors):
    """Younger anchors lean Gen Z / Young Singles / Young Couples;
    older anchors lean Empty Nesters / Retirees. Defense against a row
    factory that randomizes life_stage independently of BIRTHDATE."""
    persons = [a for a in all_anchors if a["ACCOUNT_TYPE_FLAG"] == "PERSON"]
    today = datetime(2026, 5, 28)
    young = [p for p in persons
             if (today - datetime.fromisoformat(p["BIRTHDATE"])).days // 365 < 30]
    older = [p for p in persons
             if (today - datetime.fromisoformat(p["BIRTHDATE"])).days // 365 >= 60]
    if not young or not older:
        pytest.skip("need both young and older anchors")

    young_stages = Counter(_row_for(a, datetime(2026, 5, 1))["LIFE_STAGE"] for a in young)
    older_stages = Counter(_row_for(a, datetime(2026, 5, 1))["LIFE_STAGE"] for a in older)

    young_youth = young_stages.get("Gen Z", 0) + young_stages.get("Young Singles", 0) + young_stages.get("Young Couples", 0)
    older_retirement = older_stages.get("Empty Nesters", 0) + older_stages.get("Retirees", 0)

    assert young_youth >= len(young) * 0.5, f"expected most young anchors → youth life stages, got {young_stages}"
    assert older_retirement >= len(older) * 0.7, f"expected most older anchors → empty-nest/retiree, got {older_stages}"


# ---------- Property 5: Schema contract ----------

EXPECTED_KEYS = {
    "ACCOUNT_ID", "PROFILE_MONTH",
    "PRIZM_SEGMENT_CODE", "PRIZM_SEGMENT_NAME", "PRIZM_LIFESTYLE_GROUP",
    "LIFE_STAGE", "HOUSEHOLD_COMPOSITION",
    "ESTIMATED_NET_WORTH_BAND",
    "WEALTH_PROPENSITY_SCORE", "INVESTMENT_PROPENSITY_SCORE", "MORTGAGE_PROPENSITY_SCORE",
    "URBANICITY", "FINANCIAL_STRESS_INDICATOR",
    "GENERATED_AT",
}


def test_output_schema_matches_table(in_audience_anchors):
    """Output dict keys EXACTLY match the 14 table columns."""
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


def test_propensity_scores_are_in_range(in_audience_anchors):
    """All three propensity scores must be 0.0-100.0 inclusive."""
    if not in_audience_anchors:
        pytest.skip("empty audience")
    for anchor in in_audience_anchors[:20]:
        row = _row_for(anchor, datetime(2026, 5, 1))
        for field in ("WEALTH_PROPENSITY_SCORE", "INVESTMENT_PROPENSITY_SCORE", "MORTGAGE_PROPENSITY_SCORE"):
            score = row[field]
            assert 0.0 <= score <= 100.0, f"{field}={score} out of range for {anchor['ACCOUNT_ID']}"


def test_prizm_code_is_in_canonical_set(in_audience_anchors):
    """PRIZM_SEGMENT_CODE must be one of the 12 documented codes."""
    canonical = {"UC", "MB", "YA", "MS", "PP", "BB", "CR", "CD", "SS", "HR", "FS", "MT"}
    if not in_audience_anchors:
        pytest.skip("empty audience")
    for anchor in in_audience_anchors[:20]:
        row = _row_for(anchor, datetime(2026, 5, 1))
        assert row["PRIZM_SEGMENT_CODE"] in canonical, f"unknown PRIZM code {row['PRIZM_SEGMENT_CODE']}"
