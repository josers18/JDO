"""L1 tests for the World-Check AML row factory, written against the live SP.

`procedures/sp_generate_world_check_aml.py` was synced to the deployed body
(GET_DDL) on 2026-11-09. The live generator is simpler than the original
rowspec, and these tests pin what it actually does:

  - 30 jurisdictions in 4 tiers (Low / Medium / High / Prohibited), drawn
    with weights per account (US ~80%, Prohibited ~0.2%).
  - `seed_for` buckets by year-month, so jurisdiction, the base hit flags,
    the noise bump and CASE_REFERENCE are stable within a calendar MONTH and
    re-drawn each month (not year-stable, whatever the comments say).
  - Each hit flag = month-stable base XOR a ~0.3% daily flip; flags are 0/1
    ints (the MERGE casts them with ::BOOLEAN).
  - Prohibited jurisdiction -> Severe, so only ~0.2% of accounts are Severe.
  - CHANGE_SINCE_LAST_RUN is "New" (no row on the prior PROFILE_DATE),
    otherwise "Changed" or "Unchanged".
  - CASE_REFERENCE = WC-YYYY-NNNNN for High/Severe, else None.
  - ADVERSE_MEDIA_CATEGORIES is one category or None (the pool includes None,
    so a media hit can still carry NULL categories).

The rowspec targets (Standard/Enhanced tiers, WCH- case IDs, five change
values) describe the original design, not the live data.
"""
import inspect
from datetime import datetime, timedelta

import pytest

from sp_generate_world_check_aml import (
    EXPECTED_OUTPUT_COLUMNS,
    _JURISDICTIONS,
    _JURISDICTION_POOL,
    _JURISDICTION_WEIGHTS,
    _MEDIA_CATS,
    _change_since_last_run,
    _risk_jurisdiction_stable,
    _overall_risk_rating,
    _row_for,
)


_TIER_BY_CODE = dict(_JURISDICTIONS)
_VALID_RATINGS = {"Low", "Medium", "High", "Severe"}
_VALID_TIERS = {"Low", "Medium", "High", "Prohibited"}
_VALID_CHANGES = {"New", "Changed", "Unchanged"}

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


def test_prohibited_rows_are_always_severe():
    seen = 0
    # Prohibited is ~0.2% of draws, so use a larger synthetic population.
    for i in range(3000):
        anchor = {"ACCOUNT_ID": f"PRH-{i:05d}"}
        for month in (3, 9):
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
    # Weighted draw (US ~80%): P(differ) = 1 - sum(p^2) ~ 0.36.
    assert drifted >= 15, f"only {drifted}/100 redrawn May -> June"


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
    ids = [{"ACCOUNT_ID": f"MB-{i:05d}"} for i in range(4000)]
    changed = sum(
        _row_for(a, datetime(2026, 7, 1))["CHANGE_SINCE_LAST_RUN"] == "Changed"
        for a in ids
    )
    # Weighted pool: most accounts stay Low across a redraw, so only a few %
    # change rating (jurisdiction tier / base flags re-drawn on the 1st).
    assert changed >= 40, f"only {changed}/4000 changed on a month boundary"


# ---------- Weighted jurisdiction pool ----------

def test_pool_weights_sum_to_100_and_codes_unique():
    assert abs(sum(_JURISDICTION_WEIGHTS) - 100.0) < 1e-9
    codes = [c for c, _, _ in _JURISDICTION_POOL]
    assert len(codes) == len(set(codes)) == len(_JURISDICTIONS)
    assert all(len(c) == 2 for c in codes)


def test_pool_tier_masses():
    mass = {}
    for _, tier, w in _JURISDICTION_POOL:
        mass[tier] = mass.get(tier, 0.0) + w
    assert mass["Low"] == pytest.approx(90.0)
    assert mass["Medium"] == pytest.approx(8.0)
    assert mass["High"] == pytest.approx(1.8)
    assert mass["Prohibited"] == pytest.approx(0.2)


def test_weighted_distribution_over_synthetic_ids():
    n = 20000
    ts = datetime(2026, 11, 9)
    codes = []
    tiers = []
    for i in range(n):
        code, tier = _risk_jurisdiction_stable(f"DIST-{i:06d}", ts)
        codes.append(code)
        tiers.append(tier)
    valid = set(_TIER_BY_CODE)
    assert set(codes) <= valid
    us = codes.count("US") / n * 100
    assert 77 <= us <= 83, us
    assert tiers.count("Prohibited") / n * 100 <= 0.5
    assert 6.5 <= tiers.count("Medium") / n * 100 <= 9.5
    assert tiers.count("High") / n * 100 <= 3.0
    assert all(_TIER_BY_CODE[c] == t for c, t in zip(codes, tiers))


def test_jurisdiction_draw_is_deterministic():
    ts = datetime(2026, 11, 9)
    first = [_risk_jurisdiction_stable(f"DET-{i}", ts) for i in range(200)]
    second = [_risk_jurisdiction_stable(f"DET-{i}", ts) for i in range(200)]
    assert first == second


def test_severe_share_is_small_with_weighted_pool():
    ids = [{"ACCOUNT_ID": f"SEV-{i:06d}"} for i in range(10000)]
    severe = sum(
        _row_for(a, datetime(2026, 11, 9))["OVERALL_RISK_RATING"] == "Severe"
        for a in ids
    )
    assert severe / len(ids) <= 0.01, severe / len(ids)


# ---------- New detection ----------

def test_none_prior_keys_never_emits_new(in_audience_anchors):
    for a in in_audience_anchors:
        assert _row_for(a, datetime(2026, 11, 9))["CHANGE_SINCE_LAST_RUN"] != "New"


def test_empty_prior_set_makes_every_row_new(in_audience_anchors):
    for a in in_audience_anchors:
        row = _row_for(a, datetime(2026, 11, 9), prior_keys=set())
        assert row["CHANGE_SINCE_LAST_RUN"] == "New"


def test_new_only_for_accounts_missing_from_prior_set(in_audience_anchors):
    ts = datetime(2026, 11, 9)
    present = {("JDO", a["ACCOUNT_ID"]) for a in in_audience_anchors[:50]}
    for i, a in enumerate(in_audience_anchors):
        change = _row_for(a, ts, prior_keys=present)["CHANGE_SINCE_LAST_RUN"]
        if i < 50:
            assert change in ("Changed", "Unchanged")
        else:
            assert change == "New"


def test_prior_set_is_keyed_by_org(in_audience_anchors):
    a = dict(in_audience_anchors[0], ORG_ID="00Dxx0000000001")
    ts = datetime(2026, 11, 9)
    other_org = {("JDO", a["ACCOUNT_ID"])}
    assert _row_for(a, ts, prior_keys=other_org)["CHANGE_SINCE_LAST_RUN"] == "New"
    same_org = {("00Dxx0000000001", a["ACCOUNT_ID"])}
    assert _row_for(a, ts, prior_keys=same_org)["CHANGE_SINCE_LAST_RUN"] != "New"


def test_non_new_matches_legacy_logic():
    # was_present True/None -> identical Changed/Unchanged result.
    for i in range(50):
        aid = f"LEG-{i}"
        ts = datetime(2026, 11, 9)
        assert _change_since_last_run(aid, ts, "Low", None) == _change_since_last_run(
            aid, ts, "Low", True
        )


def test_change_docstring_documents_three_values():
    doc = _change_since_last_run.__doc__
    assert "New" in doc and "Changed" in doc and "Unchanged" in doc
    assert "was_present" in inspect.signature(_change_since_last_run).parameters


# ---------- main(): RUN_DATE + prior-date query (fake session) ----------

class _FakeSession:
    """Routes the SP's SQL by substring; records merged rows."""

    def __init__(self, audience, on_date=(), prior=()):
        self.audience, self.on_date, self.prior = audience, list(on_date), list(prior)
        self.sql_log, self.merged = [], None

    def sql(self, q, params=None):
        self.sql_log.append(q)
        s = self

        class _R:
            def collect(_):
                if "QUALIFY ROW_NUMBER" in q:
                    return s.audience
                if "SELECT MAX(PROFILE_DATE)" in q:
                    return s.prior
                if "COALESCE(ORG_ID" in q:
                    return s.on_date
                if "COUNT(DISTINCT ACCOUNT_ID)" in q:
                    return [(len(s.merged or []),)]
                return []
        return _R()


def _run_main(monkeypatch, session, **kw):
    import sp_generate_world_check_aml as sp

    def fake_merge(_session, records):
        session.merged = records
        return len(records)
    monkeypatch.setattr(sp, "_merge", fake_merge)
    return sp.main(session, **kw)


def _aud(n):
    return [{"ORG_ID": "JDO", "ACCOUNT_ID": f"M-{i}"} for i in range(n)]


def test_main_no_prior_date_everything_new(monkeypatch):
    s = _FakeSession(_aud(5), prior=[])
    _run_main(monkeypatch, s)
    assert {r["CHANGE_SINCE_LAST_RUN"] for r in s.merged} == {"New"}


def test_main_run_date_restricts_to_existing_and_uses_run_date(monkeypatch):
    from datetime import date
    s = _FakeSession(_aud(5), on_date=[("JDO", "M-1"), ("JDO", "M-3")],
                     prior=[("JDO", "M-1")])
    _run_main(monkeypatch, s, run_date=date(2026, 11, 1))
    assert sorted(r["ACCOUNT_ID"] for r in s.merged) == ["M-1", "M-3"]
    assert all(r["PROFILE_DATE"] == date(2026, 11, 1) for r in s.merged)
    by = {r["ACCOUNT_ID"]: r["CHANGE_SINCE_LAST_RUN"] for r in s.merged}
    assert by["M-3"] == "New" and by["M-1"] in ("Changed", "Unchanged")
    assert any("'2026-11-01'::DATE" in q and "COUNT(DISTINCT" in q for q in s.sql_log)
    assert not any("CURRENT_DATE" in q for q in s.sql_log)


def test_main_run_date_with_no_existing_rows_keeps_full_audience(monkeypatch):
    from datetime import date
    s = _FakeSession(_aud(4), on_date=[], prior=[])
    _run_main(monkeypatch, s, run_date=date(2026, 11, 1))
    assert len(s.merged) == 4
