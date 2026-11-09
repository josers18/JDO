"""L1 tests for the World-Check AML row factory, written against the live SP.

`procedures/sp_generate_world_check_aml.py` was synced to the deployed body
(GET_DDL) on 2026-11-09. The live generator is simpler than the original
rowspec, and these tests pin what it actually does:

  - 13 jurisdictions in 4 tiers (Low / Medium / High / Prohibited), drawn
    uniformly per account.
  - `seed_for` buckets by year-month, so jurisdiction, the base hit flags,
    the noise bump and CASE_REFERENCE are stable within a calendar MONTH and
    re-drawn each month (not year-stable, whatever the comments say).
  - Each hit flag = month-stable base XOR a ~0.3% daily flip; flags are 0/1
    ints (the MERGE casts them with ::BOOLEAN).
  - Prohibited jurisdiction -> Severe, so ~2/13 of accounts are Severe.
  - CHANGE_SINCE_LAST_RUN is only "Changed" or "Unchanged".
  - CASE_REFERENCE = WC-YYYY-NNNNN for High/Severe, else None.
  - ADVERSE_MEDIA_CATEGORIES is one category or None (the pool includes None,
    so a media hit can still carry NULL categories).

The rowspec targets (Standard/Enhanced tiers, WCH- case IDs, five change
values) describe the original design, not the live data.
"""
from datetime import datetime, timedelta

import pytest

from sp_generate_world_check_aml import (
    EXPECTED_OUTPUT_COLUMNS,
    _JURISDICTIONS,
    _MEDIA_CATS,
    _overall_risk_rating,
    _row_for,
)


_TIER_BY_CODE = dict(_JURISDICTIONS)
_VALID_RATINGS = {"Low", "Medium", "High", "Severe"}
_VALID_TIERS = {"Low", "Medium", "High", "Prohibited"}
_VALID_CHANGES = {"Changed", "Unchanged"}

EXPECTED_KEYS = {
    "ORG_ID",
    "ACCOUNT_ID", "PROFILE_DATE", "OVERALL_RISK_RATING",
    "SANCTIONS_HIT", "PEP_HIT", "ADVERSE_MEDIA_HIT",
    "ADVERSE_MEDIA_CATEGORIES",
    "RISK_JURISDICTION_CODE", "RISK_JURISDICTION_TIER",
    "LAST_SCREENED_AT", "CHANGE_SINCE_LAST_RUN",
    "CASE_REFERENCE", "GENERATED_AT",
}


def _days(n: int) -> timedelta:
    return timedelta(days=n)


# ---------- Determinism ----------

def test_mid_day_reruns_are_byte_identical(in_audience_anchors):
    morning = datetime(2026, 5, 28, 3, 0, 0)
    night = datetime(2026, 5, 28, 23, 30, 0)
    for anchor in in_audience_anchors[:10]:
        assert _row_for(anchor, morning) == _row_for(anchor, night)


def test_noon_equals_midnight(in_audience_anchors):
    for anchor in in_audience_anchors[:10]:
        assert _row_for(anchor, datetime(2026, 5, 28)) == _row_for(
            anchor, datetime(2026, 5, 28, 12, 0, 0)
        )


# ---------- Audience ----------

def test_out_of_audience_cohort_is_empty(out_of_audience_anchors):
    if not out_of_audience_anchors:
        pytest.skip("Plan 7 audience is all-accounts — no violators by design")
    for bad in out_of_audience_anchors:
        _row_for(bad, datetime(2026, 5, 28))  # must not raise


def test_every_anchor_emits_a_row(in_audience_anchors):
    ts = datetime(2026, 5, 28)
    for anchor in in_audience_anchors:
        assert _row_for(anchor, ts)["ACCOUNT_ID"] == anchor["ACCOUNT_ID"]


def test_empty_account_id_raises():
    with pytest.raises(ValueError):
        _row_for({"ACCOUNT_ID": ""}, datetime(2026, 5, 28))


# ---------- Schema ----------

def test_output_keys_match_table(in_audience_anchors):
    row = _row_for(in_audience_anchors[0], datetime(2026, 5, 28))
    assert set(row) == EXPECTED_KEYS


def test_output_schema_constant_matches_test_set():
    assert set(EXPECTED_OUTPUT_COLUMNS) == EXPECTED_KEYS


def test_org_id_stamped_from_anchor_default_jdo(in_audience_anchors):
    anchor = dict(in_audience_anchors[0])
    ts = datetime(2026, 5, 28)
    anchor["ORG_ID"] = "00Dxx0000000001"
    assert _row_for(anchor, ts)["ORG_ID"] == "00Dxx0000000001"
    anchor.pop("ORG_ID")
    assert _row_for(anchor, ts)["ORG_ID"] == "JDO"


def test_dates_are_day_bucketed(in_audience_anchors):
    for n in range(7):
        ts = datetime(2026, 5, 28, 15, 45) + _days(n)
        row = _row_for(in_audience_anchors[0], ts)
        day = datetime(ts.year, ts.month, ts.day)
        assert row["PROFILE_DATE"] == day.date()
        assert row["LAST_SCREENED_AT"] == day
        assert row["GENERATED_AT"] == day


# ---------- Value vocabularies ----------

def test_values_in_live_vocabularies(in_audience_anchors):
    base = datetime(2026, 1, 1)
    for anchor in in_audience_anchors:
        for n in range(0, 365, 9):
            row = _row_for(anchor, base + _days(n))
            assert row["OVERALL_RISK_RATING"] in _VALID_RATINGS
            assert row["RISK_JURISDICTION_TIER"] in _VALID_TIERS
            assert row["CHANGE_SINCE_LAST_RUN"] in _VALID_CHANGES
            assert _TIER_BY_CODE[row["RISK_JURISDICTION_CODE"]] == row["RISK_JURISDICTION_TIER"]
            for f in ("SANCTIONS_HIT", "PEP_HIT", "ADVERSE_MEDIA_HIT"):
                assert row[f] in (0, 1)


def test_adverse_media_categories(in_audience_anchors):
    base = datetime(2026, 1, 1)
    hits = 0
    for anchor in in_audience_anchors:
        for n in range(0, 365, 3):
            row = _row_for(anchor, base + _days(n))
            if not row["ADVERSE_MEDIA_HIT"]:
                assert row["ADVERSE_MEDIA_CATEGORIES"] is None
            else:
                hits += 1
                assert row["ADVERSE_MEDIA_CATEGORIES"] in _MEDIA_CATS
    assert hits >= 5, f"only {hits} media hits sampled"


# ---------- Rollup ----------

@pytest.mark.parametrize(
    "sanctions,pep,media,tier,noise,expected",
    [
        (0, 0, 0, "Prohibited", False, "Severe"),
        (1, 1, 1, "Prohibited", False, "Severe"),
        (1, 0, 0, "Low", False, "High"),
        (0, 1, 1, "Low", False, "High"),
        (0, 1, 0, "Low", False, "Medium"),
        (0, 0, 1, "Medium", False, "Medium"),
        (0, 0, 0, "High", False, "Medium"),
        (0, 0, 0, "Low", True, "Medium"),
        (0, 0, 0, "Low", False, "Low"),
        (0, 0, 0, "Medium", False, "Low"),
    ],
)
def test_overall_risk_rating_rollup(sanctions, pep, media, tier, noise, expected):
    assert _overall_risk_rating(sanctions, pep, media, tier, noise) == expected


def test_prohibited_rows_are_always_severe(in_audience_anchors):
    seen = 0
    for anchor in in_audience_anchors:
        for month in range(1, 13):
            row = _row_for(anchor, datetime(2026, month, 15))
            if row["RISK_JURISDICTION_TIER"] == "Prohibited":
                assert row["OVERALL_RISK_RATING"] == "Severe"
                seen += 1
    assert seen >= 1


# ---------- Month-bucketed stability ----------

def test_jurisdiction_stable_within_a_month(in_audience_anchors):
    for anchor in in_audience_anchors:
        a = _row_for(anchor, datetime(2026, 5, 1))
        b = _row_for(anchor, datetime(2026, 5, 31))
        assert a["RISK_JURISDICTION_CODE"] == b["RISK_JURISDICTION_CODE"]


def test_jurisdiction_redrawn_across_months(in_audience_anchors):
    drifted = sum(
        _row_for(a, datetime(2026, 5, 15))["RISK_JURISDICTION_CODE"]
        != _row_for(a, datetime(2026, 6, 15))["RISK_JURISDICTION_CODE"]
        for a in in_audience_anchors
    )
    # Uniform draw over 13 codes: ~92% differ month to month.
    assert drifted >= 70, f"only {drifted}/100 redrawn May -> June"


def test_case_reference_iff_high_or_severe_and_month_stable(in_audience_anchors):
    base = datetime(2026, 3, 1)
    seen = 0
    for anchor in in_audience_anchors:
        refs = set()
        for n in range(31):
            row = _row_for(anchor, base + _days(n))
            if row["OVERALL_RISK_RATING"] in ("High", "Severe"):
                ref = row["CASE_REFERENCE"]
                assert ref is not None and ref.startswith("WC-2026-")
                num = ref.rsplit("-", 1)[1]
                assert len(num) == 5 and num.isdigit()
                refs.add(ref)
                seen += 1
            else:
                assert row["CASE_REFERENCE"] is None
        assert len(refs) <= 1, f"{anchor['ACCOUNT_ID']}: case ref changed within March"
    assert seen >= 1


# ---------- Rates ----------

def test_hit_rates(in_audience_anchors):
    """Marginal rate ≈ base + 0.003 × (1 − 2 × base): sanctions ~0.005,
    PEP ~0.012, media ~0.030. 120 months × 4 days × 100 anchors."""
    s = p = m = total = 0
    for year in range(2020, 2030):
        for month in range(1, 13):
            for day in (3, 10, 17, 24):
                ts = datetime(year, month, day)
                for anchor in in_audience_anchors:
                    row = _row_for(anchor, ts)
                    total += 1
                    s += row["SANCTIONS_HIT"]
                    p += row["PEP_HIT"]
                    m += row["ADVERSE_MEDIA_HIT"]
    assert 0.003 <= s / total <= 0.008, s / total
    assert 0.008 <= p / total <= 0.016, p / total
    assert 0.024 <= m / total <= 0.036, m / total


def test_mostly_unchanged_within_a_month(in_audience_anchors):
    """Inside a month only the ~0.3% daily flips move a rating; month starts
    re-draw jurisdiction and the base flags, so day 1 is excluded."""
    unchanged = total = 0
    for day in range(2, 29):
        ts = datetime(2026, 7, day)
        for anchor in in_audience_anchors:
            total += 1
            unchanged += _row_for(anchor, ts)["CHANGE_SINCE_LAST_RUN"] == "Unchanged"
    assert unchanged / total >= 0.96, unchanged / total


def test_month_start_reshuffles_ratings(in_audience_anchors):
    changed = sum(
        _row_for(a, datetime(2026, 7, 1))["CHANGE_SINCE_LAST_RUN"] == "Changed"
        for a in in_audience_anchors
    )
    assert changed >= 10, f"only {changed}/100 changed on a month boundary"
