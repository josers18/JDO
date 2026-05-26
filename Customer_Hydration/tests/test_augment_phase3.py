"""Tests for the Phase 3 augment planner (life events + campaign members).

Covers the pure planning logic — persona inference, life-event request
shape, deterministic re-runs. The org-touching code paths (build_plan
SOQL, run_augment loader integration) are exercised by the runner-level
contract tests, not duplicated here.
"""
from __future__ import annotations

from datetime import date

import pytest

from customer_hydration.augment_phase3 import (
    ANCHOR_DATE,
    derive_persona,
    plan_life_events,
)
from customer_hydration.generators.lifecycle import VALID_EVENT_TYPES


class TestDerivePersona:
    def test_each_prefix_maps_correctly(self) -> None:
        assert derive_persona("HYDRATE-RT-000001") == "retail"
        assert derive_persona("HYDRATE-WL-001234") == "wealth"
        assert derive_persona("HYDRATE-SB-000099") == "smb"
        assert derive_persona("HYDRATE-CM-000010") == "commercial"

    def test_non_customer_prefix_returns_none(self) -> None:
        # Households, financial accounts, FA roles, life events, campaign
        # members all use HYDRATE-* External_IDs but are not "customers".
        assert derive_persona("HYDRATE-HH-000001") is None
        assert derive_persona("HYDRATE-FA-000001") is None
        assert derive_persona("HYDRATE-FAR-000001") is None
        assert derive_persona("HYDRATE-LE-000001") is None
        assert derive_persona("HYDRATE-CMPMEM-000001") is None

    def test_malformed_returns_none(self) -> None:
        assert derive_persona("") is None
        assert derive_persona("HYDRATE-") is None
        assert derive_persona("notHYDRATE-RT-000001") is None
        assert derive_persona("HYDRATE-RT") is None  # missing seq part


class TestPlanLifeEvents:
    @pytest.fixture
    def population(self) -> dict[str, str]:
        # 100 of each persona keeps the 25% sampling well above noise.
        return {
            **{f"HYDRATE-RT-{i:06d}": "retail" for i in range(100)},
            **{f"HYDRATE-WL-{i:06d}": "wealth" for i in range(100)},
            **{f"HYDRATE-SB-{i:06d}": "smb" for i in range(100)},
            **{f"HYDRATE-CM-{i:06d}": "commercial" for i in range(100)},
        }

    def test_emits_only_valid_event_types(
        self, population: dict[str, str],
    ) -> None:
        reqs = plan_life_events(
            seed=42, anchor_date=ANCHOR_DATE,
            persona_for_ext=population,
        )
        for req in reqs:
            assert req.event_type in VALID_EVENT_TYPES

    def test_roughly_25pct_selection_rate(
        self, population: dict[str, str],
    ) -> None:
        reqs = plan_life_events(
            seed=42, anchor_date=ANCHOR_DATE,
            persona_for_ext=population,
        )
        # 0.25 * 400 = 100 expected; tolerate ±5pp drift seed-to-seed.
        assert 80 <= len(reqs) <= 120

    def test_deterministic_with_same_inputs(
        self, population: dict[str, str],
    ) -> None:
        a = plan_life_events(
            seed=42, anchor_date=ANCHOR_DATE,
            persona_for_ext=population,
        )
        b = plan_life_events(
            seed=42, anchor_date=ANCHOR_DATE,
            persona_for_ext=population,
        )
        assert a == b

    def test_different_seed_changes_output(
        self, population: dict[str, str],
    ) -> None:
        a = plan_life_events(
            seed=42, anchor_date=ANCHOR_DATE,
            persona_for_ext=population,
        )
        b = plan_life_events(
            seed=99, anchor_date=ANCHOR_DATE,
            persona_for_ext=population,
        )
        # At least one of selection-set OR per-account event-type/date
        # should differ. Equality would mean the seed isn't wired in.
        assert a != b

    def test_dates_span_past_anchor_and_future(
        self, population: dict[str, str],
    ) -> None:
        reqs = plan_life_events(
            seed=42, anchor_date=ANCHOR_DATE,
            persona_for_ext=population,
        )
        # The 70/20/10 split should produce all three buckets in a sample
        # this size — past-12mo, future-6mo, and on-anchor.
        assert any(r.event_date < ANCHOR_DATE for r in reqs)
        assert any(r.event_date > ANCHOR_DATE for r in reqs)
        assert any(r.event_date == ANCHOR_DATE for r in reqs)
        # And nothing escapes the bounded windows.
        for r in reqs:
            assert r.event_date >= ANCHOR_DATE - _days(365)
            assert r.event_date <= ANCHOR_DATE + _days(180)

    def test_persona_weights_skew_event_types(
        self, population: dict[str, str],
    ) -> None:
        reqs = plan_life_events(
            seed=42, anchor_date=ANCHOR_DATE,
            persona_for_ext=population,
        )
        # Bucket request counts by persona inferred from ext-id prefix.
        smb_events = [r for r in reqs if "-SB-" in r.client_account_external_id]
        wealth_events = [r for r in reqs if "-WL-" in r.client_account_external_id]
        # SMB skews New Business (50% of weights); should be the modal
        # event type at this seed/sample.
        if smb_events:
            modes = _modes_by_count([r.event_type for r in smb_events])
            assert "New Business" in modes
        # Wealth skews Retirement (35% of weights).
        if wealth_events:
            modes = _modes_by_count([r.event_type for r in wealth_events])
            assert "Retirement" in modes


def _days(n: int):
    from datetime import timedelta
    return timedelta(days=n)


def _modes_by_count(items: list[str]) -> set[str]:
    """Return the set of items tied for highest count."""
    counts: dict[str, int] = {}
    for item in items:
        counts[item] = counts.get(item, 0) + 1
    if not counts:
        return set()
    top = max(counts.values())
    return {k for k, v in counts.items() if v == top}


class TestPlanLifeEventsEdgeCases:
    def test_empty_population_returns_empty(self) -> None:
        assert plan_life_events(
            seed=42, anchor_date=date(2026, 1, 1), persona_for_ext={},
        ) == []

    def test_unknown_persona_raises_keyerror(self) -> None:
        # An unrecognized persona slipping in should fail loud, not be
        # silently dropped — tests the planner's bias toward fail-fast.
        with pytest.raises(KeyError):
            plan_life_events(
                seed=42,
                anchor_date=ANCHOR_DATE,
                persona_for_ext={"HYDRATE-RT-000001": "fintech-bro"},
            )
