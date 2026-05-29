"""L1 tests for the DNB Business Credit row factory.

Five property classes per spec:
1. Determinism
2. Audience scoping (predicate-violating anchors raise — PERSONs blocked)
3. Boring-case coverage (boring SMB anchor still emits a row)
4. Anchor influence — TWO assertions:
   (a) revenue → FINANCIAL_STRENGTH_TIER distribution shifts
   (b) industry → PAYDEX_SCORE mean differs ≥8 with 12-month roll
5. Schema contract — output dict matches the 15 table columns

Plus 4 D&B-specific extras:
- DUNS stability across months
- DUNS uniqueness across audience
- ULTIMATE_PARENT_DUNS NULL iff CORPORATE_FAMILY_SIZE=1
- DNB_RATING composition (tier + composite)
"""
from datetime import datetime
from collections import Counter
from statistics import mean

import pytest

# Imports from the SP module (T4 builds it).
from sp_generate_dnb_business_credit import _row_for, EXPECTED_OUTPUT_COLUMNS


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
        assert row["DUNS_NUMBER"] is not None
        assert row["FINANCIAL_STRENGTH_TIER"] is not None


# ---------- Property 4a: Revenue → FINANCIAL_STRENGTH_TIER distribution shift ----------

def test_tier_distribution_shifts_with_revenue(all_anchors):
    """The load-bearing test for BUSINESS-scope: low-revenue firms cluster
    at CC/DC/DD/CB; high-revenue firms have meaningfully more 5A/4A/3A.

    A row factory that ignores its anchor and just hash-derives a tier
    would produce identical distributions across cohorts."""
    biz = [a for a in all_anchors if a["ACCOUNT_TYPE_FLAG"] == "BUSINESS"]
    if len(biz) < 10:
        pytest.skip("need >= 10 business anchors")

    low = [b for b in biz if (b["ANNUAL_REVENUE"] or 0) < 1_000_000]
    high = [b for b in biz if (b["ANNUAL_REVENUE"] or 0) >= 100_000_000]
    if not low or not high:
        pytest.skip("need both low- and high-revenue anchors")

    # Roll multiple months for distribution stability
    rows_low = [_row_for(b, datetime(2026, m, 1))["FINANCIAL_STRENGTH_TIER"]
                for b in low for m in range(1, 13)]
    rows_high = [_row_for(b, datetime(2026, m, 1))["FINANCIAL_STRENGTH_TIER"]
                 for b in high for m in range(1, 13)]

    counter_low = Counter(rows_low)
    counter_high = Counter(rows_high)

    assert counter_low != counter_high, (
        "tier distribution did not shift between low and high revenue — "
        "row factory may be ignoring its anchor"
    )

    top_tiers = {"5A", "4A", "3A"}
    weak_tiers = {"CC", "DC", "DD", "CB"}

    high_top_share = sum(counter_high.get(t, 0) for t in top_tiers) / sum(counter_high.values())
    low_top_share = sum(counter_low.get(t, 0) for t in top_tiers) / sum(counter_low.values())
    assert high_top_share > low_top_share, (
        f"top-tier share should be higher for high-revenue cohort; "
        f"got high={high_top_share:.2%} vs low={low_top_share:.2%}"
    )

    high_weak_share = sum(counter_high.get(t, 0) for t in weak_tiers) / sum(counter_high.values())
    low_weak_share = sum(counter_low.get(t, 0) for t in weak_tiers) / sum(counter_low.values())
    assert low_weak_share > high_weak_share, (
        f"weak-tier share should be higher for low-revenue cohort; "
        f"got low={low_weak_share:.2%} vs high={high_weak_share:.2%}"
    )


# ---------- Property 4b: Industry → PAYDEX_SCORE mean difference ----------

_HIGH_PAYDEX_INDUSTRIES = ("Finance", "Banking", "Healthcare", "Technology")
_LOW_PAYDEX_INDUSTRIES = ("Construction", "Retail", "Food & Beverage", "Hospitality")


def _matches_any(industry, keywords):
    if not industry:
        return False
    low = industry.lower()
    return any(k.lower() in low for k in keywords)


def test_paydex_score_correlates_with_industry(all_anchors):
    """Construction/Retail/F&B → mean PAYDEX < 73;
    Finance/Banking/Healthcare → mean PAYDEX > 82.
    Gap must be ≥8 with 12-month roll.

    Defense against a row factory that ignores INDUSTRY when synthesizing
    the payment score."""
    biz = [a for a in all_anchors if a["ACCOUNT_TYPE_FLAG"] == "BUSINESS"]
    high_paydex = [b for b in biz if _matches_any(b.get("INDUSTRY"), _HIGH_PAYDEX_INDUSTRIES)]
    low_paydex = [b for b in biz if _matches_any(b.get("INDUSTRY"), _LOW_PAYDEX_INDUSTRIES)]
    if not high_paydex or not low_paydex:
        pytest.skip(
            f"need both high_paydex ({len(high_paydex)}) "
            f"and low_paydex ({len(low_paydex)}) industries"
        )

    # 12-month roll for stability
    high_scores = [_row_for(b, datetime(2026, m, 1))["PAYDEX_SCORE"]
                   for b in high_paydex for m in range(1, 13)]
    low_scores = [_row_for(b, datetime(2026, m, 1))["PAYDEX_SCORE"]
                  for b in low_paydex for m in range(1, 13)]

    high_mean = mean(high_scores)
    low_mean = mean(low_scores)

    # Hard expectations from the rowspec's industry bias table
    assert high_mean > 82, f"high-paydex industry mean = {high_mean:.2f}, expected > 82"
    assert low_mean < 73, f"low-paydex industry mean = {low_mean:.2f}, expected < 73"
    assert high_mean - low_mean >= 8.0, (
        f"PAYDEX_SCORE gap between high ({high_mean:.2f}) and low ({low_mean:.2f}) "
        f"industries should be ≥8.0 — row factory may be ignoring INDUSTRY"
    )


# ---------- Property 5: Schema contract ----------

EXPECTED_KEYS = {
    "ACCOUNT_ID", "PROFILE_MONTH",
    "DUNS_NUMBER", "DNB_RATING",
    "FINANCIAL_STRENGTH_TIER", "COMPOSITE_RISK_SCORE",
    "PAYDEX_SCORE", "AVERAGE_DAYS_BEYOND_TERMS",
    "FAILURE_RISK_SCORE", "DELINQUENCY_PREDICTOR_SCORE",
    "SUPPLIER_RISK_LEVEL", "CORPORATE_FAMILY_SIZE",
    "ULTIMATE_PARENT_DUNS", "VERIFICATION_STATUS",
    "GENERATED_AT",
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
    assert set(EXPECTED_OUTPUT_COLUMNS) == EXPECTED_KEYS


def test_financial_scores_in_range(in_audience_anchors):
    """Validate numeric score ranges per rowspec."""
    if not in_audience_anchors:
        pytest.skip("empty audience")
    for anchor in in_audience_anchors[:20]:
        row = _row_for(anchor, datetime(2026, 5, 1))
        composite = row["COMPOSITE_RISK_SCORE"]
        paydex = row["PAYDEX_SCORE"]
        avg_days = row["AVERAGE_DAYS_BEYOND_TERMS"]
        failure_risk = row["FAILURE_RISK_SCORE"]
        delinquency = row["DELINQUENCY_PREDICTOR_SCORE"]
        family_size = row["CORPORATE_FAMILY_SIZE"]

        assert 1 <= composite <= 4, f"COMPOSITE_RISK_SCORE={composite}, expected 1-4"
        assert 0 <= paydex <= 100, f"PAYDEX_SCORE={paydex}, expected 0-100"
        assert 0 <= avg_days <= 180, f"AVERAGE_DAYS_BEYOND_TERMS={avg_days}, expected 0-180"
        assert 1 <= failure_risk <= 100, f"FAILURE_RISK_SCORE={failure_risk}, expected 1-100"
        assert 1 <= delinquency <= 100, f"DELINQUENCY_PREDICTOR_SCORE={delinquency}, expected 1-100"
        assert family_size >= 1, f"CORPORATE_FAMILY_SIZE={family_size}, expected ≥1"


def test_family_size_positive(in_audience_anchors):
    """CORPORATE_FAMILY_SIZE must be ≥1."""
    if not in_audience_anchors:
        pytest.skip("empty audience")
    for anchor in in_audience_anchors[:20]:
        row = _row_for(anchor, datetime(2026, 5, 1))
        size = row["CORPORATE_FAMILY_SIZE"]
        assert size >= 1, f"CORPORATE_FAMILY_SIZE={size}, expected ≥1"


def test_supplier_risk_level_is_canonical(in_audience_anchors):
    """SUPPLIER_RISK_LEVEL must be one of the canonical values."""
    canonical = {"Low", "Moderate", "High", "Severe"}
    if not in_audience_anchors:
        pytest.skip("empty audience")
    for anchor in in_audience_anchors[:20]:
        row = _row_for(anchor, datetime(2026, 5, 1))
        risk = row["SUPPLIER_RISK_LEVEL"]
        assert risk in canonical, f"unknown supplier risk level {risk}"


def test_verification_status_is_canonical(in_audience_anchors):
    """VERIFICATION_STATUS must be one of the canonical values."""
    canonical = {"Verified", "Probable", "Unverified"}
    if not in_audience_anchors:
        pytest.skip("empty audience")
    for anchor in in_audience_anchors[:20]:
        row = _row_for(anchor, datetime(2026, 5, 1))
        status = row["VERIFICATION_STATUS"]
        assert status in canonical, f"unknown verification status {status}"


def test_financial_strength_tier_is_canonical(in_audience_anchors):
    """FINANCIAL_STRENGTH_TIER must be one of the 11 documented codes."""
    canonical = {"5A", "4A", "3A", "2A", "1A", "BA", "BB", "CB", "CC", "DC", "DD"}
    if not in_audience_anchors:
        pytest.skip("empty audience")
    for anchor in in_audience_anchors[:20]:
        row = _row_for(anchor, datetime(2026, 5, 1))
        tier = row["FINANCIAL_STRENGTH_TIER"]
        assert tier in canonical, f"unknown tier {tier}"


# ---------- Extra D&B tests ----------

def test_duns_stable_across_months(in_audience_anchors):
    """DUNS_NUMBER must be stable for the same account across calendar months
    (real DUNS are permanent identifiers). Year-rollover IS allowed to roll —
    intentional rowspec simplification."""
    if not in_audience_anchors:
        pytest.skip("empty audience")
    anchor = in_audience_anchors[0]
    jan = _row_for(anchor, datetime(2026, 1, 15))["DUNS_NUMBER"]
    jul = _row_for(anchor, datetime(2026, 7, 1))["DUNS_NUMBER"]
    dec = _row_for(anchor, datetime(2026, 12, 31))["DUNS_NUMBER"]
    assert jan == jul == dec, f"DUNS not stable across 2026: {jan} {jul} {dec}"
    # Year-rollover allowed to differ
    jan_2027 = _row_for(anchor, datetime(2027, 1, 1))["DUNS_NUMBER"]
    assert jan_2027 != jan, "DUNS unexpectedly stable across year rollover"


def test_duns_unique_across_audience(in_audience_anchors):
    """In a 50-anchor BUSINESS sample, DUNS collisions should be 0 (or
    at most 1 — birthday paradox at 50 over 10^9 is negligible)."""
    if len(in_audience_anchors) < 10:
        pytest.skip("need >= 10 anchors")
    duns = [_row_for(a, datetime(2026, 5, 1))["DUNS_NUMBER"] for a in in_audience_anchors]
    collisions = len(duns) - len(set(duns))
    assert collisions == 0, f"{collisions} DUNS collisions across {len(duns)} accounts"


def test_parent_duns_null_when_standalone(in_audience_anchors):
    """ULTIMATE_PARENT_DUNS is NULL iff CORPORATE_FAMILY_SIZE=1 (standalone)."""
    if not in_audience_anchors:
        pytest.skip("empty audience")
    for anchor in in_audience_anchors[:20]:
        row = _row_for(anchor, datetime(2026, 5, 1))
        if row["CORPORATE_FAMILY_SIZE"] == 1:
            assert row["ULTIMATE_PARENT_DUNS"] is None, (
                f"expected NULL parent for standalone, "
                f"got {row['ULTIMATE_PARENT_DUNS']}"
            )
        else:
            assert row["ULTIMATE_PARENT_DUNS"] is not None, (
                f"expected non-NULL parent for size={row['CORPORATE_FAMILY_SIZE']}"
            )


def test_dnb_rating_composes_tier_and_composite(in_audience_anchors):
    """DNB_RATING string equals f'{FINANCIAL_STRENGTH_TIER}{COMPOSITE_RISK_SCORE}'."""
    if not in_audience_anchors:
        pytest.skip("empty audience")
    for anchor in in_audience_anchors[:20]:
        row = _row_for(anchor, datetime(2026, 5, 1))
        expected = f"{row['FINANCIAL_STRENGTH_TIER']}{row['COMPOSITE_RISK_SCORE']}"
        assert row["DNB_RATING"] == expected, (
            f"rating {row['DNB_RATING']} != tier+composite {expected}"
        )
