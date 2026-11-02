"""Distribution-level L1 check: the plan Task 8 (L3) targets, offline.

The 10-anchor fixture in conftest.py is tuned for code coverage and is NOT
representative of the live audience. This test drives the row factory over
an audience shaped like the live one instead, so spec-level misses (mix,
fresh rounds, runway, Frozen ratio, transitions) fail at L1 rather than
after a deploy.

tests/fixtures/live_audience_shape.csv is the plan section 2 audience
aggregated to (EMPLOYEE_BAND, FOUNDED_YEAR, INDUSTRY, CLIENT_CATEGORY,
FIRST_MONTH) -> ANCHORS, pulled read-only from DATA_JEDAIS.FINS__PUBLIC on
2026-11-02 (672 anchors, 4,587 rows over 2026-05 .. 2026-11, founded
2010-2023, 511 of 672 in the 1-10 band, bands account-stable). No account
IDs are stored; synthetic IDs stand in for them, and each shape row is
replicated REPLICAS times to damp seed noise.

Re-pull the shape (and re-check the thresholds) if the audience moves a lot.
"""
from __future__ import annotations

import csv
from collections import Counter, defaultdict
from datetime import date, datetime
from pathlib import Path

import pytest

from sp_generate_harmonic_company_signals import _row_for

SHAPE_CSV = Path(__file__).parent / "fixtures" / "live_audience_shape.csv"
WINDOW = [date(2026, m, 1) for m in range(5, 12)]   # the 7 live ZoomInfo months
REPLICAS = 3


def _audience():
    out = []
    with SHAPE_CSV.open(newline="") as fh:
        for i, rec in enumerate(csv.DictReader(fh)):
            first = date.fromisoformat(rec["FIRST_MONTH"] + "-01")
            for j in range(int(rec["ANCHORS"]) * REPLICAS):
                a = {"ORG_ID": "JDO", "ACCOUNT_ID": f"001DIST{i:04d}{j:05d}",
                     "ACCOUNT_TYPE_FLAG": "BUSINESS",
                     "CLIENT_CATEGORY": rec["CLIENT_CATEGORY"] or None,
                     "INDUSTRY": rec["INDUSTRY"] or None}
                zi = {m: {"EMPLOYEE_BAND": rec["EMPLOYEE_BAND"],
                          "FOUNDED_YEAR": int(rec["FOUNDED_YEAR"])} for m in WINDOW}
                out.append((a, zi, first))
    return out


@pytest.fixture(scope="module")
def live_shape_rows():
    """{account_id: [rows for the months the anchor is in the audience]}"""
    hist = defaultdict(list)
    for a, zi, first in _audience():
        for m in WINDOW:
            if m >= first:
                hist[a["ACCOUNT_ID"]].append(_row_for(a, zi, datetime(m.year, m.month, 1)))
    return hist


def test_shape_fixture_matches_live_probe():
    with SHAPE_CSV.open(newline="") as fh:
        recs = list(csv.DictReader(fh))
    assert sum(int(r["ANCHORS"]) for r in recs) == 672
    micro = sum(int(r["ANCHORS"]) for r in recs if r["EMPLOYEE_BAND"] == "1-10")
    assert micro == 511
    assert max(int(r["FOUNDED_YEAR"]) for r in recs) == 2023


def test_task8_funding_mix(live_shape_rows):
    rows = [r for rs in live_shape_rows.values() for r in rs]
    mix = Counter(r["FUNDING_STATUS"] for r in rows)
    share = {k: v / len(rows) for k, v in mix.items()}
    assert 0.55 <= share["Bootstrapped"] <= 0.70, share
    assert 0.15 <= share["Angel-Seed"] <= 0.25, share
    assert 0.08 <= share["Venture-Backed"] <= 0.18, share
    assert 0.03 <= share["PE-Backed"] <= 0.10, share


def test_task8_recently_funded_each_month(live_shape_rows):
    by_month = defaultdict(list)
    for rs in live_shape_rows.values():
        for r in rs:
            by_month[r["PROFILE_MONTH"]].append(r["RECENTLY_FUNDED_FLAG"])
    assert set(by_month) == set(WINDOW)
    for m, flags in sorted(by_month.items()):
        share = sum(flags) / len(flags)
        assert 0.02 <= share <= 0.06, (m, share)


def test_task8_bootstrapped_to_funded_transition(live_shape_rows):
    transitions = sum(
        any(x["FUNDING_STATUS"] == "Bootstrapped" and y["FUNDING_STATUS"] != "Bootstrapped"
            for x, y in zip(rs, rs[1:]))
        for rs in live_shape_rows.values())
    assert transitions >= 1


def test_task8_short_runway_share(live_shape_rows):
    av = [r for rs in live_shape_rows.values() for r in rs
          if r["FUNDING_STATUS"] in ("Angel-Seed", "Venture-Backed")]
    share = sum(r["EST_RUNWAY_MONTHS"] < 9 for r in av) / len(av)
    assert 0.15 <= share <= 0.30, share


def test_task8_frozen_tracks_negative_growth(live_shape_rows):
    rows = [r for rs in live_shape_rows.values() for r in rs]
    neg = [r for r in rows if r["HEADCOUNT_GROWTH_6M_PCT"] < 0]
    pos = [r for r in rows if r["HEADCOUNT_GROWTH_6M_PCT"] > 0]
    f_neg = sum(r["POSTINGS_TREND"] == "Frozen" for r in neg) / len(neg)
    f_pos = sum(r["POSTINGS_TREND"] == "Frozen" for r in pos) / len(pos)
    assert f_neg >= 2 * f_pos, (f_neg, f_pos)


def test_task8_demo_lists_non_empty(live_shape_rows):
    rows = [r for rs in live_shape_rows.values() for r in rs]
    treasury = [r for r in rows if r["RECENTLY_FUNDED_FLAG"] and r["LAST_ROUND_USD"] >= 5_000_000]
    risk = [r for r in rows if r["FUNDING_STATUS"] == "Venture-Backed"
            and r["EST_RUNWAY_MONTHS"] < 6 and r["POSTINGS_TREND"] in ("Slowing", "Frozen")]
    assert treasury and risk
