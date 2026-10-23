from datetime import date, datetime
from decimal import Decimal
import random

from attrcsat.common import as_date, as_float, clamp, jitter, month_rng, stable_rng


def test_stable_rng_month_independent():
    assert stable_rng("001amX", "s").random() == stable_rng("001amX", "s").random()


def test_month_rng_changes_by_month():
    oct_ = month_rng("001amX", "s", datetime(2026, 10, 1)).random()
    nov = month_rng("001amX", "s", datetime(2026, 11, 1)).random()
    assert oct_ != nov
    assert oct_ == month_rng("001amX", "s", datetime(2026, 10, 23)).random()


def test_jitter_bounded():
    rng = random.Random(7)
    v = 1000.0
    for _ in range(1000):
        assert 0.97 * v <= jitter(v, rng) <= 1.03 * v


def test_clamp():
    assert clamp(5, 0, 3) == 3
    assert clamp(-1, 0, 3) == 0
    assert clamp(2, 0, 3) == 2


def test_as_float():
    assert as_float(None) is None
    assert as_float("") is None
    assert as_float("  ") is None
    assert as_float("abc") is None
    assert as_float(Decimal("12.5")) == 12.5
    assert as_float(3) == 3.0
    assert as_float("4.25") == 4.25
    assert as_float(float("nan")) is None


def test_as_date():
    assert as_date(None) is None
    assert as_date("") is None
    assert as_date(date(2000, 1, 2)) == date(2000, 1, 2)
    assert as_date(datetime(2000, 1, 2, 3, 4)) == date(2000, 1, 2)
    assert as_date("1990-05-17") == date(1990, 5, 17)
    assert as_date("1990-05-17T10:00:00") == date(1990, 5, 17)
    assert as_date("garbage") is None


def test_conftest_feature_rows(feature_rows):
    from tests.conftest import FEED_KEYS, make_feature

    assert len(feature_rows) >= 60
    assert len({r["ACCOUNT_ID"] for r in feature_rows}) == len(feature_rows)
    assert all(r["ACCOUNT_ID"].startswith("001am") for r in feature_rows)
    assert set(feature_rows[0]) == set(make_feature())
    people = [r for r in feature_rows if r["ACCOUNT_TYPE_FLAG"] == "PERSON"]
    biz = [r for r in feature_rows if r["CLIENT_CATEGORY"] in ("SmallBusiness", "CommercialBanking")]
    hh = [r for r in feature_rows if r["CLIENT_CATEGORY"] == "Household"]
    assert (len(people), len(biz), len(hh)) == (35, 15, 10)
    for grp in (people, biz):
        assert sum(r["N_PRODUCTS"] is None for r in grp) >= len(grp) / 3
    assert all(all(r[k] is None for k in FEED_KEYS) for r in hh)
    assert sum(r["SANCTIONS_HIT"] or r["PEP_HIT"] or r["ADVERSE_MEDIA_HIT"] for r in feature_rows) >= 5
    assert sum(r["RISK_RATING"] == "Severe" for r in feature_rows) >= 3
