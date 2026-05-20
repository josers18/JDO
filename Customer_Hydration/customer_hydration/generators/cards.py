"""Card generator (Plan 2 / Task 4).

Emits FinServ__Card__c rows from a list of CardRequests. This org uses a
CUSTOM Card model — most fields are renamed away from the spec's FSC
defaults (Card_Type__c, Card_Product__c, Card_Status__c, Card_Number__c,
FinServ__ValidUntil__c, FinServ__AccountHolder__c). The fieldmap encodes
those renames; the generator builds a "logical" row using spec field names
where renames apply (and physical names where no rename applies), then
runs JDO_FIELDMAP.apply("FinServ__Card__c", ...) to produce the row that
matches the org's actual schema.

Cards do NOT carry credit limit / balance — those live on the linked FA,
and the fieldmap drops them defensively.
"""
from __future__ import annotations

import random
from dataclasses import dataclass, field
from datetime import date, timedelta

from customer_hydration.fieldmap import JDO_FIELDMAP


_CARD_TYPES = {"Credit", "Debit", "Corporate", "Purchasing"}
_CARD_PRODUCTS = {"Cash Rewards", "Travel Points", "Secured", "Corporate"}
_PAYMENT_NETWORKS = ["Visa", "Mastercard", "Amex"]
_CARD_FORMATS = ["Physical", "Virtual", "Both"]
_CARD_FORMAT_WEIGHTS = [7, 2, 1]
_DAILY_SPEND_LIMITS = [2000, 3000, 5000, 7500, 10000]


@dataclass
class CardRequest:
    """Per-customer per-card spec.

    The orchestrator emits one CardRequest per card it wants generated.
    Logical card_type / card_product values are validated; the generator
    passes them through to the fieldmap-renamed picklist columns.
    """

    account_external_id: str
    fa_external_id: str
    cardholder_name: str
    card_type: str
    card_product: str


@dataclass
class CardBundle:
    """All FinServ__Card__c rows produced for a batch of CardRequests."""

    cards: list[dict] = field(default_factory=list)


def generate_cards(
    *,
    seed: int,
    starting_seq: int,
    requests: list[CardRequest],
) -> CardBundle:
    """Generate FinServ__Card__c rows from card requests.

    Sequencing: External_ID__c = f"HYDRATE-CARD-{starting_seq + i:06d}".
    All linkages are external-id references — the loader rewrites the
    column header to *.External_ID__c reference syntax for Bulk API 2.0.
    """
    rng = random.Random(seed)
    today = date.today()
    bundle = CardBundle()

    for i, req in enumerate(requests):
        if req.card_type not in _CARD_TYPES:
            raise ValueError(
                f"Unknown card_type {req.card_type!r}; expected one of "
                f"{sorted(_CARD_TYPES)}"
            )
        if req.card_product not in _CARD_PRODUCTS:
            raise ValueError(
                f"Unknown card_product {req.card_product!r}; expected one of "
                f"{sorted(_CARD_PRODUCTS)}"
            )

        seq = starting_seq + i
        ext_id = f"HYDRATE-CARD-{seq:06d}"

        issued_offset_months = rng.randint(0, 24)
        issued = today - timedelta(days=issued_offset_months * 30)
        valid_offset_months = rng.randint(36, 48)
        valid_until = today + timedelta(days=valid_offset_months * 30)

        last_four = rng.randint(1000, 9999)
        masked_number = f"****-****-****-{last_four}"

        payment_network = rng.choice(_PAYMENT_NETWORKS)
        card_format = rng.choices(_CARD_FORMATS, weights=_CARD_FORMAT_WEIGHTS, k=1)[0]
        daily_limit = rng.choice(_DAILY_SPEND_LIMITS)
        contactless = rng.random() < 0.9
        status = "Active" if rng.random() < 0.95 else "Closed"

        # Build the logical row (spec field names where renames apply,
        # physical names where no rename applies), then translate via
        # fieldmap. The fieldmap drops FinServ__CreditLimit__c and
        # FinServ__Balance__c — they live on the linked FA, not the Card.
        logical_card = {
            # Renamed by fieldmap → physical Card_Type__c et al.
            "FinServ__CardType__c": req.card_type,
            "FinServ__CardSubType__c": req.card_product,
            "FinServ__CardStatus__c": status,
            "FinServ__CardNumber__c": masked_number,
            "FinServ__ExpirationDate__c": valid_until.isoformat(),
            "FinServ__Account__c": req.account_external_id,
            # No rename — emit directly.
            "FinServ__FinancialAccount__c": req.fa_external_id,
            "Issued_Date__c": issued.isoformat(),
            "Name_On_Card__c": req.cardholder_name.upper(),
            "Payment_Network__c": payment_network,
            "Card_Format__c": card_format,
            "Daily_Spend_Limit__c": daily_limit,
            "Contactless_Enabled__c": contactless,
            "External_ID__c": ext_id,
        }
        card = JDO_FIELDMAP.apply("FinServ__Card__c", logical_card)
        bundle.cards.append(card)

    return bundle
