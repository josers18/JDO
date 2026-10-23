from collections import Counter
from datetime import datetime

from prodrec.training import build_training_set, mix_problems
from prodrec.vocab import (
    BUSINESS_PRODUCTS, BUSINESS_TRAINING_COLUMNS, PERSONAL_PRODUCTS, PERSONAL_TRAINING_COLUMNS,
)

T0 = datetime(2026, 10, 23)
SIZE = 400
FLOOR = 5


def _pop(anchors):
    feats = [
        {},
        {"MONTHLY_CREDITS": 120_000, "DEPOSIT_BALANCE": 300_000, "MONTHLY_NET": 9_000},
        {"DEPOSIT_BALANCE": 20_000, "PRODUCT_COUNT": 2},
    ]
    return [(a, feats[i % 3]) for i, a in enumerate(anchors)]


def test_size_and_keys(business_anchors):
    rows = build_training_set(_pop(business_anchors), "business", T0, SIZE, FLOOR)
    assert len(rows) == SIZE
    assert sorted(r["ACCOUNTID"] for r in rows) == [f"B-{i:06d}" for i in range(1, SIZE + 1)]


def test_personal_keys(person_anchors):
    rows = build_training_set(_pop(person_anchors), "personal", T0, 100, 2)
    assert sorted(r["ACCOUNTID"] for r in rows) == [f"P-{i:06d}" for i in range(1, 101)]
    assert {r["RECOMMENDED_PRODUCT"] for r in rows} <= set(PERSONAL_PRODUCTS)


def test_floor_lifts_rare_classes(business_anchors, monkeypatch):
    import prodrec.training as trn
    seen = []
    real = trn.draw_label

    def spy(scores, rng, *a, **k):
        lab = real(scores, rng, *a, **k)
        seen.append(lab)
        return lab

    monkeypatch.setattr(trn, "draw_label", spy)
    rows = build_training_set(_pop(business_anchors), "business", T0, SIZE, FLOOR)
    pool_counts = Counter(seen)
    row_counts = Counter(r["RECOMMENDED_PRODUCT"] for r in rows)
    for cls, n in pool_counts.items():
        if n >= FLOOR:
            assert row_counts[cls] >= FLOOR, cls
    assert set(row_counts) <= set(BUSINESS_PRODUCTS)


def test_keys_not_sorted_by_class(business_anchors):
    rows = build_training_set(_pop(business_anchors), "business", T0, SIZE, FLOOR)
    ordered = sorted(rows, key=lambda r: r["ACCOUNTID"])
    assert len({r["RECOMMENDED_PRODUCT"] for r in ordered[:100]}) >= 3


def test_deterministic_per_month(business_anchors):
    pop = _pop(business_anchors)
    a = build_training_set(pop, "business", datetime(2026, 10, 1), 120, FLOOR)
    b = build_training_set(pop, "business", datetime(2026, 10, 23), 120, FLOOR)
    assert a == b


def test_columns(business_anchors, person_anchors):
    for r in build_training_set(_pop(business_anchors), "business", T0, 60, 2):
        assert tuple(r) == tuple(BUSINESS_TRAINING_COLUMNS)
    for r in build_training_set(_pop(person_anchors), "personal", T0, 60, 2):
        assert tuple(r) == tuple(PERSONAL_TRAINING_COLUMNS)


def test_bad_inputs(business_anchors):
    import pytest
    with pytest.raises(ValueError):
        build_training_set([], "business", T0, 10)
    with pytest.raises(ValueError):
        build_training_set(_pop(business_anchors), "business", T0, 0)


def test_mix_problems():
    bad = mix_problems(["A"] * 50 + ["B"] * 50)
    assert any("max share" in p for p in bad)
    assert any("classes" in p for p in bad)
    healthy = [f"C{i}" for i in range(10)] * 10
    assert mix_problems(healthy) == []
    assert any("floor" in p for p in mix_problems(healthy, floor=11))
    assert mix_problems(healthy, floor=10) == []
