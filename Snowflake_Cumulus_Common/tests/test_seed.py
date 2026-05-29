"""L1 tests for the deterministic seed function."""
from datetime import datetime
import pytest

from cumulus_common.seed import seed_for


def test_seed_is_deterministic():
    """Same (account, salt, ts) → same bytes."""
    a = seed_for("ACCT-001", "claritas", datetime(2026, 5, 1))
    b = seed_for("ACCT-001", "claritas", datetime(2026, 5, 1))
    assert a == b
    assert isinstance(a, bytes)
    assert len(a) == 32  # SHA-256 digest


def test_seed_differs_across_accounts():
    """Same salt + ts, different account → different seed."""
    a = seed_for("ACCT-001", "claritas", datetime(2026, 5, 1))
    b = seed_for("ACCT-002", "claritas", datetime(2026, 5, 1))
    assert a != b


def test_seed_differs_across_datasets():
    """Same account + ts, different dataset salt → different seed.

    This is the load-bearing property — without it, two datasets seeded
    only by ACCOUNT_ID produce correlated random draws.
    """
    a = seed_for("ACCT-001", "claritas", datetime(2026, 5, 1))
    b = seed_for("ACCT-001", "dnb", datetime(2026, 5, 1))
    assert a != b


def test_seed_buckets_by_year_month_only():
    """Different days within a month → SAME seed.

    A monthly generator should produce the same row whether re-run on
    May 1 or May 17. Different month → different seed.
    """
    a = seed_for("ACCT-001", "claritas", datetime(2026, 5, 1))
    b = seed_for("ACCT-001", "claritas", datetime(2026, 5, 17))
    c = seed_for("ACCT-001", "claritas", datetime(2026, 6, 1))
    assert a == b
    assert a != c


def test_seed_handles_unicode_account_ids():
    """Account IDs may contain non-ASCII; seed must not crash."""
    a = seed_for("ACCT-Δ-001", "claritas", datetime(2026, 5, 1))
    assert isinstance(a, bytes) and len(a) == 32


def test_seed_rejects_empty_salt():
    """An empty salt would silently make the salt useless. Fail loud."""
    with pytest.raises(ValueError, match="dataset_salt must be non-empty"):
        seed_for("ACCT-001", "", datetime(2026, 5, 1))


def test_seed_rejects_empty_account_id():
    """Empty account_id would collapse all accounts to the same seed. Fail loud."""
    with pytest.raises(ValueError, match="account_id must be non-empty"):
        seed_for("", "claritas", datetime(2026, 5, 1))


def test_seed_rejects_none_account_id():
    """None account_id should fail the same way as empty (defense against
    nullable anchor-view columns leaking through to the seed function)."""
    with pytest.raises(ValueError, match="account_id must be non-empty"):
        seed_for(None, "claritas", datetime(2026, 5, 1))  # type: ignore[arg-type]


def test_seed_rejects_none_salt():
    """None salt — same defense, on the other input."""
    with pytest.raises(ValueError, match="dataset_salt must be non-empty"):
        seed_for("ACCT-001", None, datetime(2026, 5, 1))  # type: ignore[arg-type]
