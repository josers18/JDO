"""Tests for the native PersonLifeEvent generator (Phase 3 dual-write).

Native PersonLifeEvent is the lineage Data Cloud actually ingests via the
PersonLifeEvent_Home stream — the legacy FinServ__LifeEvent__c lineage
(see tests/test_lifecycle_generator.py) is NOT mapped to a DC stream in
jdo-uqj0jr. The augment writes both for AGENTS.md "schema continuity"
parity.
"""
from __future__ import annotations

from datetime import date

import pytest

from customer_hydration.native.person_life_event import (
    LEGACY_TO_NATIVE_EVENT_TYPE,
    VALID_NATIVE_EVENT_TYPES,
    NativePersonLifeEventRequest,
    generate_native_person_life_events,
    map_legacy_event_type,
)


@pytest.fixture
def sample_requests() -> list[NativePersonLifeEventRequest]:
    return [
        NativePersonLifeEventRequest(
            client_account_external_id="HYDRATE-RT-000001",
            event_type="Baby",
            event_date=date(2025, 6, 14),
        ),
        NativePersonLifeEventRequest(
            client_account_external_id="HYDRATE-WL-000099",
            event_type="Retirement",
            event_date=date(2026, 3, 1),
        ),
    ]


class TestGenerateNativePersonLifeEvents:
    def test_one_row_per_request(
        self, sample_requests: list[NativePersonLifeEventRequest],
    ) -> None:
        bundle = generate_native_person_life_events(
            starting_seq=1, requests=sample_requests,
        )
        assert len(bundle.rows) == len(sample_requests)

    def test_external_ids_use_nle_prefix_and_are_sequential(
        self, sample_requests: list[NativePersonLifeEventRequest],
    ) -> None:
        bundle = generate_native_person_life_events(
            starting_seq=42, requests=sample_requests,
        )
        # HYDRATE-NLE-* prefix keeps the native lineage seq pointer
        # distinct from legacy HYDRATE-LE-* — the augment increments each
        # independently.
        assert bundle.rows[0]["External_ID__c"] == "HYDRATE-NLE-000042"
        assert bundle.rows[1]["External_ID__c"] == "HYDRATE-NLE-000043"

    def test_primary_person_id_uses_resolve_marker(
        self, sample_requests: list[NativePersonLifeEventRequest],
    ) -> None:
        bundle = generate_native_person_life_events(
            starting_seq=1, requests=sample_requests,
        )
        # PrimaryPersonId points to Contact, not Account. The augment
        # rewrites this marker via IdResolver.contact_id_by_account_
        # external_id at load time.
        assert bundle.rows[0]["PrimaryPersonId"] == "RESOLVE:HYDRATE-RT-000001"
        assert bundle.rows[1]["PrimaryPersonId"] == "RESOLVE:HYDRATE-WL-000099"

    def test_event_date_is_iso_string(
        self, sample_requests: list[NativePersonLifeEventRequest],
    ) -> None:
        bundle = generate_native_person_life_events(
            starting_seq=1, requests=sample_requests,
        )
        assert bundle.rows[0]["EventDate"] == "2025-06-14"
        assert bundle.rows[1]["EventDate"] == "2026-03-01"

    def test_invalid_event_type_raises(self) -> None:
        # The org's PersonLifeEvent.EventType picklist is restrictive.
        # Anything outside VALID_NATIVE_EVENT_TYPES must fail loud at
        # generation time, not silently at Bulk load.
        with pytest.raises(ValueError, match="Invalid event_type"):
            generate_native_person_life_events(
                starting_seq=1,
                requests=[NativePersonLifeEventRequest(
                    client_account_external_id="HYDRATE-RT-000001",
                    event_type="New Baby",  # legacy form — must be mapped first
                    event_date=date(2025, 1, 1),
                )],
            )

    def test_source_system_fields_set(
        self, sample_requests: list[NativePersonLifeEventRequest],
    ) -> None:
        bundle = generate_native_person_life_events(
            starting_seq=1, requests=sample_requests,
        )
        # SourceSystem + SourceSystemIdentifier are part of the native
        # FSC schema. We set them so demo bankers can trace the row back
        # to its origin in audit/inspection workflows.
        assert bundle.rows[0]["SourceSystem"] == "Cumulus Hydration"
        assert bundle.rows[0]["SourceSystemIdentifier"] == "HYDRATE-NLE-000001"


class TestLegacyToNativeMapping:
    def test_every_legacy_value_maps_to_a_valid_native_value(self) -> None:
        # Defensive: if someone adds a new legacy event_type without
        # adding the mapping entry, this test fails loud.
        for legacy, native in LEGACY_TO_NATIVE_EVENT_TYPE.items():
            assert native in VALID_NATIVE_EVENT_TYPES, (
                f"legacy {legacy!r} maps to {native!r} which is not in "
                f"VALID_NATIVE_EVENT_TYPES"
            )

    def test_all_six_legacy_picklist_values_are_mapped(self) -> None:
        # Mirror lifecycle.VALID_EVENT_TYPES — every legacy value must
        # have an explicit translation. Don't rely on a default fallback.
        from customer_hydration.generators.lifecycle import VALID_EVENT_TYPES
        assert set(LEGACY_TO_NATIVE_EVENT_TYPE) == set(VALID_EVENT_TYPES)

    def test_map_function_translates_known_values(self) -> None:
        assert map_legacy_event_type("New Baby") == "Baby"
        assert map_legacy_event_type("Retirement") == "Retirement"
        assert map_legacy_event_type("College") == "Graduation"

    def test_map_function_raises_on_unknown(self) -> None:
        with pytest.raises(KeyError):
            map_legacy_event_type("Inheritance")  # spec value, not in jdo
