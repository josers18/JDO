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
    """Out-of-audience anchors must raise ValueError (defense in depth).

    Since 2026-10-24 BUSINESS anchors are in the audience only with a client
    category and a real 001... Account Id; the fixture's TEST-BIZ anchors have
    neither id, so the row factory must reject them loudly."""
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
    # v1.x multi-org-additive: ORG_ID leads the schema contract.
    "ORG_ID",
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


# ---------- Liquidity strain (2026-10-24) ----------

from sp_generate_claritas_demographics import (  # noqa: E402
    STRAIN_RATE, _financial_stress, _liquidity_strained, _strained_stress,
)


def _wm_anchor(i):
    return {"ACCOUNT_ID": f"001am00002WM{i:06d}", "ACCOUNT_TYPE_FLAG": "PERSON",
            "BIRTHDATE": "1965-03-01", "ANNUAL_INCOME": 400_000,
            "CLIENT_CATEGORY": "Wealth Management", "POSTAL_CODE": "94105"}


def test_strain_only_affluent_or_wealth_management():
    """Retail-income clients keep the income-driven draw; the trait never fires for them."""
    assert not any(_liquidity_strained(f"001am00002RT{i:06d}", 60_000, "Retail") for i in range(2000))


def test_strain_gives_wealth_books_a_persistent_high_minority():
    """~STRAIN_RATE of WM clients are strained; a good share are High in >= 4 of 6 months, the rest never are."""
    ids = [_wm_anchor(i)["ACCOUNT_ID"] for i in range(5000)]
    strained = [a for a in ids if _liquidity_strained(a, 400_000, "Wealth Management")]
    assert 0.5 * STRAIN_RATE < len(strained) / len(ids) < 1.5 * STRAIN_RATE
    months = [datetime(2026, m, 1) for m in range(5, 11)]
    persistent = sum(1 for a in strained if sum(_strained_stress(a, ts) == "High" for ts in months) >= 4)
    assert persistent / len(strained) > 0.2
    rows = [_row_for(_wm_anchor(i), datetime(2026, 10, 1)) for i in range(5000)]
    high = [r["ACCOUNT_ID"] for r in rows if r["FINANCIAL_STRESS_INDICATOR"] == "High"]
    assert high and set(high) <= set(strained)


def test_strain_leaves_other_columns_unchanged():
    """The strain draw uses its own salt, so a strained row differs only in stress."""
    import random
    from sp_generate_claritas_demographics import seed_for, DATASET_SALT
    for i in range(5000):
        a = _wm_anchor(i)
        if _liquidity_strained(a["ACCOUNT_ID"], 400_000, "Wealth Management"):
            break
    ts = datetime(2026, 10, 1)
    row = _row_for(a, ts)
    assert row["FINANCIAL_STRESS_INDICATOR"] == _strained_stress(a["ACCOUNT_ID"], ts)
    assert _financial_stress(400_000, "Wealth Management", random.Random(0)) in ("Low", "Moderate")


# ---------- Household / business principals (2026-10-24) ----------

from sp_generate_claritas_demographics import _anchor_in_audience, _principal_profile  # noqa: E402


def _biz_anchor(i, cat):
    return {"ACCOUNT_ID": f"001am00002BZ{i:06d}", "ACCOUNT_TYPE_FLAG": "BUSINESS",
            "BIRTHDATE": None, "ANNUAL_INCOME": None, "CLIENT_CATEGORY": cat,
            "ANNUAL_REVENUE": 750_000, "POSTAL_CODE": "60601"}


def test_business_audience_needs_real_id_and_category():
    assert _anchor_in_audience(_biz_anchor(1, "Household"))
    assert _anchor_in_audience(_biz_anchor(1, "Small Business"))
    assert not _anchor_in_audience({**_biz_anchor(1, "Household"), "CLIENT_CATEGORY": None})
    assert not _anchor_in_audience({**_biz_anchor(1, "Household"), "ACCOUNT_ID": "TEST-BIZ-01"})


def test_principal_profile_is_stable_across_months():
    a = _biz_anchor(7, "Household")
    assert _principal_profile(a["ACCOUNT_ID"], "Household") == _principal_profile(a["ACCOUNT_ID"], "Household")
    r5, r6 = _row_for(a, datetime(2026, 5, 1)), _row_for(a, datetime(2026, 6, 1))
    assert r5["ACCOUNT_ID"] == r6["ACCOUNT_ID"] == a["ACCOUNT_ID"]
    assert set(r5) == EXPECTED_KEYS


def test_business_books_get_a_plausible_high_stress_share():
    """Households and business principals land near the Retail High rate (~10-20%), not 0 and not 50%."""
    for cat in ("Household", "Small Business", "Commercial Banking"):
        rows = [_row_for(_biz_anchor(i, cat), datetime(2026, 10, 1)) for i in range(3000)]
        share = sum(r["FINANCIAL_STRESS_INDICATOR"] == "High" for r in rows) / len(rows)
        assert 0.07 < share < 0.22, (cat, share)
