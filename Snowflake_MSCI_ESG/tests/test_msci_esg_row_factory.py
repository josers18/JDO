"""L1 tests for the MSCI ESG row factory.

Five property classes per spec §7.2:
1. Determinism
2. Audience scoping (predicate-violating anchors raise — PERSONs blocked)
3. Boring-case coverage (boring SMB anchor still emits a row)
4. Anchor influence — TWO assertions:
   (a) revenue → MSCI_ESG_RATING distribution shifts
   (b) industry → ENVIRONMENTAL_SCORE means differ ≥1.0
5. Schema contract — output dict matches the 14 table columns
"""
from datetime import datetime
from collections import Counter
from statistics import mean

import pytest

# Imports from the SP module (T4 builds it).
from sp_generate_msci_esg_scores import _row_for, EXPECTED_OUTPUT_COLUMNS


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
    """PERSON anchors must raise ValueError — defense in depth."""
    if not out_of_audience_anchors:
        pytest.skip("no out-of-audience anchors in fixture")
    for bad in out_of_audience_anchors[:3]:
        with pytest.raises((ValueError, AssertionError)):
            _row_for(bad, datetime(2026, 5, 1))


# ---------- Property 3: Boring-case coverage ----------

def test_boring_case_still_returns_row(in_audience_anchors):
    """Every BUSINESS anchor produces a non-None row with ACCOUNT_ID populated."""
    if not in_audience_anchors:
        pytest.skip("empty audience")
    for anchor in in_audience_anchors[:10]:
        row = _row_for(anchor, datetime(2026, 5, 1))
        assert row is not None
        assert row["ACCOUNT_ID"] == anchor["ACCOUNT_ID"]
        assert row["MSCI_ESG_RATING"] is not None
        assert row["MATERIALITY_TAGS"]  # never empty


# ---------- Property 4a: Revenue → rating distribution shift ----------

def test_rating_distribution_shifts_with_revenue(all_anchors):
    """The load-bearing test for BUSINESS-scope: low-revenue firms cluster
    at BBB/BB/B/CCC; high-revenue firms have meaningfully more AAA/AA/A.

    A row factory that ignores its anchor and just hash-derives a rating
    would produce identical distributions across cohorts."""
    biz = [a for a in all_anchors if a["ACCOUNT_TYPE_FLAG"] == "BUSINESS"]
    if len(biz) < 10:
        pytest.skip("need >= 10 business anchors")

    low = [b for b in biz if (b["ANNUAL_REVENUE"] or 0) < 1_000_000]
    high = [b for b in biz if (b["ANNUAL_REVENUE"] or 0) >= 100_000_000]
    if not low or not high:
        pytest.skip("need both low- and high-revenue anchors")

    # Roll multiple months for distribution stability
    rows_low = [_row_for(b, datetime(2026, m, 1))["MSCI_ESG_RATING"]
                for b in low for m in range(1, 13)]
    rows_high = [_row_for(b, datetime(2026, m, 1))["MSCI_ESG_RATING"]
                 for b in high for m in range(1, 13)]

    counter_low = Counter(rows_low)
    counter_high = Counter(rows_high)

    assert counter_low != counter_high, (
        "rating distribution did not shift between low and high revenue — "
        "row factory may be ignoring its anchor"
    )

    top_ratings = {"AAA", "AA", "A"}
    weak_ratings = {"BB", "B", "CCC"}

    high_top_share = sum(counter_high.get(r, 0) for r in top_ratings) / sum(counter_high.values())
    low_top_share = sum(counter_low.get(r, 0) for r in top_ratings) / sum(counter_low.values())
    assert high_top_share > low_top_share, (
        f"top-rating share should be higher for high-revenue cohort; "
        f"got high={high_top_share:.2%} vs low={low_top_share:.2%}"
    )

    high_weak_share = sum(counter_high.get(r, 0) for r in weak_ratings) / sum(counter_high.values())
    low_weak_share = sum(counter_low.get(r, 0) for r in weak_ratings) / sum(counter_low.values())
    assert low_weak_share > high_weak_share, (
        f"weak-rating share should be higher for low-revenue cohort; "
        f"got low={low_weak_share:.2%} vs high={high_weak_share:.2%}"
    )


# ---------- Property 4b: Industry → environmental score ----------

_HEAVY_INDUSTRIES = ("Energy", "Mining", "Oil & Gas", "Manufacturing", "Industrial")
_CLEAN_INDUSTRIES = ("Tech", "Software", "Finance", "Banking", "Information Technology")


def _matches_any(industry, keywords):
    if not industry:
        return False
    low = industry.lower()
    return any(k.lower() in low for k in keywords)


def test_environmental_score_correlates_with_industry(all_anchors):
    """Heavy industries (Energy/Manufacturing) → mean E_score < 5.5;
    clean industries (Tech/Finance) → mean E_score > 6.5.

    Defense against a row factory that ignores INDUSTRY when synthesizing
    the environmental pillar."""
    biz = [a for a in all_anchors if a["ACCOUNT_TYPE_FLAG"] == "BUSINESS"]
    heavy = [b for b in biz if _matches_any(b.get("INDUSTRY"), _HEAVY_INDUSTRIES)]
    clean = [b for b in biz if _matches_any(b.get("INDUSTRY"), _CLEAN_INDUSTRIES)]
    if not heavy or not clean:
        pytest.skip(f"need both heavy ({len(heavy)}) and clean ({len(clean)}) industries")

    # 12-month roll for stability
    heavy_e = [_row_for(b, datetime(2026, m, 1))["ENVIRONMENTAL_SCORE"]
               for b in heavy for m in range(1, 13)]
    clean_e = [_row_for(b, datetime(2026, m, 1))["ENVIRONMENTAL_SCORE"]
               for b in clean for m in range(1, 13)]

    heavy_mean = mean(heavy_e)
    clean_mean = mean(clean_e)

    # Hard expectations from the rowspec's industry bias table
    assert heavy_mean < 5.5, f"heavy-industry mean E_score = {heavy_mean:.2f}, expected < 5.5"
    assert clean_mean > 6.5, f"clean-industry mean E_score = {clean_mean:.2f}, expected > 6.5"
    assert clean_mean - heavy_mean >= 1.0, (
        f"E_score gap between clean ({clean_mean:.2f}) and heavy ({heavy_mean:.2f}) "
        f"industries should be ≥1.0 — row factory may be ignoring INDUSTRY"
    )


# ---------- Property 5: Schema contract ----------

EXPECTED_KEYS = {
    "ORG_ID",
    "ACCOUNT_ID", "PROFILE_MONTH",
    "MSCI_ESG_RATING", "INDUSTRY_CLASSIFICATION",
    "ESG_SCORE_OVERALL", "ENVIRONMENTAL_SCORE", "SOCIAL_SCORE", "GOVERNANCE_SCORE",
    "CARBON_INTENSITY_TONS_PER_M_REVENUE",
    "CONTROVERSY_FLAG_COUNT", "TOP_CONTROVERSY_CATEGORY",
    "MATERIALITY_TAGS", "LAST_RATING_CHANGE_DIRECTION",
    "GENERATED_AT",
}


def test_output_schema_matches_table(in_audience_anchors):
    """Output dict keys EXACTLY match the 15 table columns (ORG_ID + 14 originals)."""
    if not in_audience_anchors:
        pytest.skip("empty audience")
    row = _row_for(in_audience_anchors[0], datetime(2026, 5, 1))
    assert set(row.keys()) == EXPECTED_KEYS, (
        f"row keys {sorted(row.keys())} != expected {sorted(EXPECTED_KEYS)}"
    )


def test_output_schema_constant_matches_test_set():
    """Defense against EXPECTED_OUTPUT_COLUMNS in the SP module drifting
    away from this test's EXPECTED_KEYS — they must be the same set."""
    assert set(EXPECTED_OUTPUT_COLUMNS) == EXPECTED_KEYS


def test_pillar_scores_are_in_range(in_audience_anchors):
    """All four scores (overall + 3 pillars) must be 0.0-10.0."""
    if not in_audience_anchors:
        pytest.skip("empty audience")
    score_fields = (
        "ESG_SCORE_OVERALL", "ENVIRONMENTAL_SCORE", "SOCIAL_SCORE", "GOVERNANCE_SCORE",
    )
    for anchor in in_audience_anchors[:20]:
        row = _row_for(anchor, datetime(2026, 5, 1))
        for field in score_fields:
            score = row[field]
            assert 0.0 <= score <= 10.0, f"{field}={score} out of range for {anchor['ACCOUNT_ID']}"


def test_carbon_intensity_in_range(in_audience_anchors):
    """Carbon intensity 0-2000 tons per M revenue; should never be negative."""
    if not in_audience_anchors:
        pytest.skip("empty audience")
    for anchor in in_audience_anchors[:20]:
        row = _row_for(anchor, datetime(2026, 5, 1))
        c = row["CARBON_INTENSITY_TONS_PER_M_REVENUE"]
        assert 0.0 <= c <= 2000.0, f"carbon={c} out of range for {anchor['ACCOUNT_ID']}"


def test_rating_is_in_canonical_set(in_audience_anchors):
    """MSCI_ESG_RATING must be one of the 7 documented codes."""
    canonical = {"AAA", "AA", "A", "BBB", "BB", "B", "CCC"}
    if not in_audience_anchors:
        pytest.skip("empty audience")
    for anchor in in_audience_anchors[:20]:
        row = _row_for(anchor, datetime(2026, 5, 1))
        assert row["MSCI_ESG_RATING"] in canonical, f"unknown rating {row['MSCI_ESG_RATING']}"


def test_industry_classification_is_canonical(in_audience_anchors):
    """INDUSTRY_CLASSIFICATION must be Leader / Average / Laggard."""
    canonical = {"Leader", "Average", "Laggard"}
    if not in_audience_anchors:
        pytest.skip("empty audience")
    for anchor in in_audience_anchors[:20]:
        row = _row_for(anchor, datetime(2026, 5, 1))
        assert row["INDUSTRY_CLASSIFICATION"] in canonical


def test_top_controversy_category_null_when_count_zero(in_audience_anchors):
    """When CONTROVERSY_FLAG_COUNT=0, TOP_CONTROVERSY_CATEGORY must be NULL."""
    if not in_audience_anchors:
        pytest.skip("empty audience")
    for anchor in in_audience_anchors[:20]:
        row = _row_for(anchor, datetime(2026, 5, 1))
        if row["CONTROVERSY_FLAG_COUNT"] == 0:
            assert row["TOP_CONTROVERSY_CATEGORY"] is None, (
                f"expected NULL TOP_CONTROVERSY_CATEGORY when count=0, "
                f"got {row['TOP_CONTROVERSY_CATEGORY']} for {anchor['ACCOUNT_ID']}"
            )
        else:
            assert row["TOP_CONTROVERSY_CATEGORY"] is not None
