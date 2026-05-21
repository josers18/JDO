"""Tests for the LifeEvent generator (Plan 2 / Task 7).

The LifeEvent generator emits FinServ__LifeEvent__c rows. This object's
schema diverges from the spec — `FinServ__Account__c` →
`FinServ__Client__c`, `FinServ__Contact__c` is dropped, and
`FinServ__Status__c` is dropped. The fieldmap encodes these renames /
drops; tests verify the generator emits the right physical names AFTER
fieldmap translation.

Picklist surface for `FinServ__EventType__c` on jdo-fw51xz is
RESTRICTIVE — only six values are accepted. The generator must reject
any other value with ValueError. Idempotency uses
`FinServ__SourceSystemId__c` (no External_ID__c on this object).
"""
from __future__ import annotations

from datetime import date

import pytest

from customer_hydration.generators.lifecycle import (
    LifeEventBundle,
    LifeEventRequest,
    generate_life_events,
)


_VALID_EVENT_TYPES = {
    "New Baby",
    "New Job",
    "New Home",
    "College",
    "New Business",
    "Retirement",
}


@pytest.fixture
def sample_requests() -> list[LifeEventRequest]:
    return [
        LifeEventRequest(
            client_account_external_id="HYDRATE-RT-000001",
            event_type="New Baby",
            event_date=date(2025, 6, 14),
        ),
        LifeEventRequest(
            client_account_external_id="HYDRATE-RT-000002",
            event_type="New Job",
            event_date=date(2024, 11, 1),
        ),
        LifeEventRequest(
            client_account_external_id="HYDRATE-WL-000001",
            event_type="New Home",
            event_date=date(2025, 3, 22),
        ),
        LifeEventRequest(
            client_account_external_id="HYDRATE-WL-000002",
            event_type="College",
            event_date=date(2025, 8, 15),
        ),
        LifeEventRequest(
            client_account_external_id="HYDRATE-RT-000003",
            event_type="New Business",
            event_date=date(2024, 9, 1),
        ),
        LifeEventRequest(
            client_account_external_id="HYDRATE-WL-000003",
            event_type="Retirement",
            event_date=date(2026, 1, 31),
        ),
    ]


@pytest.fixture
def gen_kwargs(fixed_seed, sample_requests):
    return {
        "seed": fixed_seed,
        "starting_seq": 1,
        "requests": sample_requests,
    }


class TestGenerateLifeEvents:
    def test_generates_one_life_event_per_request(self, gen_kwargs):
        bundle = generate_life_events(**gen_kwargs)
        assert isinstance(bundle, LifeEventBundle)
        assert len(bundle.life_events) == len(gen_kwargs["requests"])

    def test_uses_source_system_id_for_idempotency(self, gen_kwargs):
        # No External_ID__c on this object — only FinServ__SourceSystemId__c.
        gen_kwargs["starting_seq"] = 7
        bundle = generate_life_events(**gen_kwargs)
        for i, le in enumerate(bundle.life_events):
            ssid = le["FinServ__SourceSystemId__c"]
            assert ssid == f"HYDRATE-LE-{7 + i:06d}"
            # Tail is exactly 6 digits zero-padded.
            assert len(ssid.split("-")[-1]) == 6
            # External_ID__c MUST NOT exist on LifeEvent rows.
            assert "External_ID__c" not in le

    def test_uses_client_field_not_account(self, gen_kwargs):
        # FinServ__Account__c → FinServ__Client__c via fieldmap.
        bundle = generate_life_events(**gen_kwargs)
        for le in bundle.life_events:
            assert "FinServ__Client__c" in le
            assert le["FinServ__Client__c"]
            assert "FinServ__Account__c" not in le

    def test_does_not_emit_status_field(self, gen_kwargs):
        # FinServ__Status__c is DROPPED by fieldmap — must never appear.
        bundle = generate_life_events(**gen_kwargs)
        for le in bundle.life_events:
            assert "FinServ__Status__c" not in le

    def test_does_not_emit_contact_field(self, gen_kwargs):
        # FinServ__Contact__c is DROPPED by fieldmap — must never appear.
        bundle = generate_life_events(**gen_kwargs)
        for le in bundle.life_events:
            assert "FinServ__Contact__c" not in le

    def test_event_type_is_one_of_six_valid_values(self, gen_kwargs):
        bundle = generate_life_events(**gen_kwargs)
        for le in bundle.life_events:
            assert le["FinServ__EventType__c"] in _VALID_EVENT_TYPES

    def test_invalid_event_type_raises(self, fixed_seed):
        # Spec assumed Marriage / Divorce / Death of Spouse / Inheritance
        # / Sale of Business / Diagnosis — none of these are valid in
        # jdo-fw51xz. Generator must reject them with ValueError.
        bad_requests = [
            LifeEventRequest(
                client_account_external_id="HYDRATE-RT-000001",
                event_type="Marriage",
                event_date=date(2025, 6, 14),
            )
        ]
        with pytest.raises(ValueError):
            generate_life_events(
                seed=fixed_seed, starting_seq=1, requests=bad_requests
            )

    def test_event_date_emitted_as_iso_date(self, gen_kwargs):
        bundle = generate_life_events(**gen_kwargs)
        for le, req in zip(bundle.life_events, gen_kwargs["requests"]):
            ev_date = le["FinServ__EventDate__c"]
            assert isinstance(ev_date, str)
            assert ev_date == req.event_date.isoformat()
            # YYYY-MM-DD shape — 10 chars, two dashes at positions 4, 7.
            assert len(ev_date) == 10
            assert ev_date[4] == "-" and ev_date[7] == "-"

    def test_persona_flavored_discussion_note_set(self, gen_kwargs):
        bundle = generate_life_events(**gen_kwargs)
        for le in bundle.life_events:
            note = le["FinServ__DiscussionNote__c"]
            assert isinstance(note, str)
            assert note.strip(), "DiscussionNote must be non-empty"

    def test_name_includes_event_type(self, gen_kwargs):
        bundle = generate_life_events(**gen_kwargs)
        for le, req in zip(bundle.life_events, gen_kwargs["requests"]):
            name = le["Name"]
            assert isinstance(name, str)
            assert name  # non-empty
            # Either the literal event_type appears, or the name is
            # otherwise persona-flavored to reference it. The default
            # template is "{event_type} - {event_date}", so event_type
            # MUST appear in name.
            assert req.event_type in name

    def test_links_to_client_account(self, gen_kwargs):
        bundle = generate_life_events(**gen_kwargs)
        for le, req in zip(bundle.life_events, gen_kwargs["requests"]):
            assert le["FinServ__Client__c"] == req.client_account_external_id

    def test_same_seed_produces_identical_output(self, gen_kwargs):
        bundle1 = generate_life_events(**gen_kwargs)
        bundle2 = generate_life_events(**gen_kwargs)
        assert bundle1.life_events == bundle2.life_events
