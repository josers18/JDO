"""Tests for the Phase 4d production guard (spec §6.1, §6.2 row 'Production-org guardrail tripped')."""
import pytest

from customer_hydration.backfill.production_guard import (
    KNOWN_PRODUCTION_ORG_IDS,
    is_production_org,
    enforce_production_guard,
)


def test_known_production_ids_is_a_frozenset_of_15char_ids():
    """The known-prod list is a frozenset so accidental mutation is a TypeError."""
    assert isinstance(KNOWN_PRODUCTION_ORG_IDS, frozenset)
    for org_id in KNOWN_PRODUCTION_ORG_IDS:
        assert len(org_id) == 15, f"{org_id!r} is not a 15-char SF org id"


def test_is_production_org_returns_true_for_known_prod():
    """If an org id is in the known-prod list, is_production_org returns True."""
    if not KNOWN_PRODUCTION_ORG_IDS:
        pytest.skip("KNOWN_PRODUCTION_ORG_IDS is empty (no prod orgs registered yet)")
    sample = next(iter(KNOWN_PRODUCTION_ORG_IDS))
    assert is_production_org(sample) is True


def test_is_production_org_returns_false_for_demo_org():
    """jdo-uqj0jr's id is 00Dam00000Uo32qE — not on the prod list."""
    assert is_production_org("00Dam00000Uo32qE") is False


def test_enforce_raises_when_prod_and_not_allowed():
    """If org is prod and --allow-production not set, raise PermissionError."""
    if not KNOWN_PRODUCTION_ORG_IDS:
        pytest.skip("no prod orgs registered")
    sample = next(iter(KNOWN_PRODUCTION_ORG_IDS))
    with pytest.raises(PermissionError):
        enforce_production_guard(sample, allow_production=False)


def test_enforce_passes_when_prod_and_allowed():
    """If org is prod but --allow-production set, do not raise."""
    if not KNOWN_PRODUCTION_ORG_IDS:
        pytest.skip("no prod orgs registered")
    sample = next(iter(KNOWN_PRODUCTION_ORG_IDS))
    enforce_production_guard(sample, allow_production=True)  # should not raise


def test_enforce_passes_for_non_prod_org():
    """Non-prod org should never raise regardless of allow_production."""
    enforce_production_guard("00Dam00000Uo32qE", allow_production=False)
    enforce_production_guard("00Dam00000Uo32qE", allow_production=True)
