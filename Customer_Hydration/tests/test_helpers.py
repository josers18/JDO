"""Tests for customer_hydration.derivers._helpers."""
import pytest
from customer_hydration.derivers._helpers import seeded_rng, weighted_pick


def test_seeded_rng_returns_random_instance():
    rng = seeded_rng("001xx000000ABC")
    assert hasattr(rng, "random")
    assert hasattr(rng, "gauss")


def test_seeded_rng_is_deterministic():
    """Same account_id must produce identical RNG sequence across calls."""
    rng1 = seeded_rng("001xx000000ABC")
    rng2 = seeded_rng("001xx000000ABC")
    seq1 = [rng1.random() for _ in range(10)]
    seq2 = [rng2.random() for _ in range(10)]
    assert seq1 == seq2


def test_seeded_rng_differs_per_id():
    """Different account_ids produce different sequences (with high probability)."""
    rng1 = seeded_rng("001xx000000ABC")
    rng2 = seeded_rng("001xx000000XYZ")
    seq1 = [rng1.random() for _ in range(5)]
    seq2 = [rng2.random() for _ in range(5)]
    assert seq1 != seq2


def test_weighted_pick_returns_value_from_list():
    rng = seeded_rng("test_pick_1")
    result = weighted_pick(rng, ["A", "B", "C"], [0.5, 0.3, 0.2])
    assert result in ("A", "B", "C")


def test_weighted_pick_is_deterministic():
    rng1 = seeded_rng("test_pick_2")
    rng2 = seeded_rng("test_pick_2")
    r1 = weighted_pick(rng1, ["X", "Y", "Z"], [0.1, 0.5, 0.4])
    r2 = weighted_pick(rng2, ["X", "Y", "Z"], [0.1, 0.5, 0.4])
    assert r1 == r2


def test_weighted_pick_respects_weights_at_scale():
    """Heavily-weighted value should dominate across many draws."""
    rng = seeded_rng("test_pick_3")
    counts = {"A": 0, "B": 0}
    for _ in range(1000):
        result = weighted_pick(rng, ["A", "B"], [0.95, 0.05])
        counts[result] += 1
    assert counts["A"] > 800
    assert counts["B"] < 200


def test_weighted_pick_rejects_mismatched_lengths():
    rng = seeded_rng("test_pick_4")
    with pytest.raises(ValueError):
        weighted_pick(rng, ["A", "B"], [0.5, 0.3, 0.2])


def test_weighted_pick_rejects_empty():
    rng = seeded_rng("test_pick_5")
    with pytest.raises(ValueError):
        weighted_pick(rng, [], [])
