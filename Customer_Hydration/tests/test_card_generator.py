"""Tests for the Card generator (Plan 2 / Task 4).

The Card generator emits FinServ__Card__c rows for previously-generated
customer accounts. This org uses a CUSTOM Card model — most fields are
renamed away from the spec's FSC defaults (Card_Type__c instead of
FinServ__CardType__c, FinServ__AccountHolder__c instead of
FinServ__Account__c, FinServ__ValidUntil__c instead of
FinServ__ExpirationDate__c, etc.). The fieldmap encodes those renames;
these tests verify the generator emits the right physical names AFTER
fieldmap translation.

Cards do NOT carry credit limit / balance — those live on the linked FA.
"""
from __future__ import annotations

import re

import pytest

from customer_hydration.generators.cards import (
    CardBundle,
    CardRequest,
    generate_cards,
)


def _make_request(
    *,
    seq: int = 1,
    card_type: str = "Credit",
    card_product: str = "Cash Rewards",
) -> CardRequest:
    return CardRequest(
        account_external_id=f"HYDRATE-RT-{seq:06d}",
        fa_external_id=f"HYDRATE-FA-{seq:06d}",
        cardholder_name=f"Customer {seq}",
        card_type=card_type,
        card_product=card_product,
    )


@pytest.fixture
def sample_requests() -> list[CardRequest]:
    return [
        _make_request(seq=1, card_type="Credit", card_product="Cash Rewards"),
        _make_request(seq=2, card_type="Debit", card_product="Cash Rewards"),
        _make_request(seq=3, card_type="Credit", card_product="Travel Points"),
        _make_request(seq=4, card_type="Corporate", card_product="Corporate"),
        _make_request(seq=5, card_type="Credit", card_product="Secured"),
    ]


@pytest.fixture
def gen_kwargs(fixed_seed, sample_requests):
    return {
        "seed": fixed_seed,
        "starting_seq": 1,
        "requests": sample_requests,
    }


class TestGenerateCards:
    def test_generates_one_card_per_request(self, gen_kwargs):
        bundle = generate_cards(**gen_kwargs)
        assert isinstance(bundle, CardBundle)
        assert len(bundle.cards) == len(gen_kwargs["requests"])

    def test_external_ids_sequential_zero_padded(self, gen_kwargs):
        gen_kwargs["starting_seq"] = 7
        bundle = generate_cards(**gen_kwargs)
        ids = [c["External_ID__c"] for c in bundle.cards]
        assert ids[0] == "HYDRATE-CARD-000007"
        assert ids[-1] == f"HYDRATE-CARD-{7 + len(gen_kwargs['requests']) - 1:06d}"
        assert all(len(i.split("-")[-1]) == 6 for i in ids)

    def test_card_uses_account_holder_field_not_account(self, gen_kwargs):
        bundle = generate_cards(**gen_kwargs)
        for card in bundle.cards:
            assert "FinServ__AccountHolder__c" in card
            assert card["FinServ__AccountHolder__c"].startswith("HYDRATE-RT-")
            assert "FinServ__Account__c" not in card

    def test_card_uses_card_type_renamed_field(self, gen_kwargs):
        bundle = generate_cards(**gen_kwargs)
        for card in bundle.cards:
            assert "Card_Type__c" in card
            assert card["Card_Type__c"] in {"Credit", "Debit", "Corporate", "Purchasing"}
            assert "FinServ__CardType__c" not in card

    def test_card_uses_valid_until_not_expiration_date(self, gen_kwargs):
        bundle = generate_cards(**gen_kwargs)
        for card in bundle.cards:
            assert "FinServ__ValidUntil__c" in card
            # ISO date string YYYY-MM-DD
            assert re.match(r"^\d{4}-\d{2}-\d{2}$", card["FinServ__ValidUntil__c"])
            assert "FinServ__ExpirationDate__c" not in card

    def test_card_links_to_fa_via_external_id_reference(self, gen_kwargs):
        bundle = generate_cards(**gen_kwargs)
        for card, req in zip(bundle.cards, gen_kwargs["requests"]):
            assert card["FinServ__FinancialAccount__c"] == req.fa_external_id

    def test_card_emits_payment_network_and_format_and_contactless(self, gen_kwargs):
        bundle = generate_cards(**gen_kwargs)
        for card in bundle.cards:
            assert card["Payment_Network__c"] in {"Visa", "Mastercard", "Amex", "Discover"}
            assert card["Card_Format__c"] in {"Physical", "Virtual", "Both"}
            assert isinstance(card["Contactless_Enabled__c"], bool)

    def test_credit_limit_and_balance_not_on_card(self, gen_kwargs):
        # Fieldmap drops these — they live on the linked FA, not the Card.
        bundle = generate_cards(**gen_kwargs)
        for card in bundle.cards:
            assert "FinServ__CreditLimit__c" not in card
            assert "FinServ__Balance__c" not in card

    def test_card_status_default_is_active(self, gen_kwargs):
        # New cards default to Active; a small minority may be Closed (5%).
        # With 5 cards and seed=42 the majority should still be Active.
        bundle = generate_cards(**gen_kwargs)
        statuses = [c["Card_Status__c"] for c in bundle.cards]
        assert all(s in {"Active", "Closed"} for s in statuses)
        assert statuses.count("Active") >= 1
        # And the field uses the renamed physical name
        assert all("FinServ__CardStatus__c" not in c for c in bundle.cards)

    def test_card_number_is_masked_format(self, gen_kwargs):
        bundle = generate_cards(**gen_kwargs)
        pattern = re.compile(r"^\*{4}-\*{4}-\*{4}-\d{4}$")
        for card in bundle.cards:
            assert "Card_Number__c" in card
            assert pattern.match(card["Card_Number__c"]), (
                f"unexpected card number: {card['Card_Number__c']}"
            )
            assert "FinServ__CardNumber__c" not in card

    def test_same_seed_produces_identical_output(self, gen_kwargs):
        bundle1 = generate_cards(**gen_kwargs)
        bundle2 = generate_cards(**gen_kwargs)
        assert bundle1.cards == bundle2.cards

    def test_different_seeds_produce_different_card_numbers(self, gen_kwargs):
        bundle1 = generate_cards(**gen_kwargs)
        gen_kwargs2 = {**gen_kwargs, "seed": 99}
        bundle2 = generate_cards(**gen_kwargs2)
        nums1 = [c["Card_Number__c"] for c in bundle1.cards]
        nums2 = [c["Card_Number__c"] for c in bundle2.cards]
        assert nums1 != nums2


class TestCardSubTypeMapping:
    def test_secured_card_for_low_credit_tier_request(self, fixed_seed):
        req = CardRequest(
            account_external_id="HYDRATE-RT-000001",
            fa_external_id="HYDRATE-FA-000001",
            cardholder_name="Sample Customer",
            card_type="Credit",
            card_product="Secured",
        )
        bundle = generate_cards(seed=fixed_seed, starting_seq=1, requests=[req])
        assert bundle.cards[0]["Card_Product__c"] == "Secured"
        assert "FinServ__CardSubType__c" not in bundle.cards[0]
