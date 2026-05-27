"""Tests for customer_hydration.derivers._helpers."""
from customer_hydration.derivers._helpers import seeded_rng


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
