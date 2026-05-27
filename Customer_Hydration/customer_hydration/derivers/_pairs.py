"""Paired-fields list — fields that must derive consistently together (spec §4.7).

When one half of a pair is non-null, the deriver reads the existing value and
produces the partner field from it deterministically rather than re-rolling
from rng. This prevents inconsistencies like CreditScore=750 + Rating=Excellent.
"""
from __future__ import annotations

PAIRED_FIELDS: list[tuple[str, str]] = [
    ("FinServ__CreditScore__c", "FinServ__CreditRating__c"),
    ("FinServ__RiskTolerance__c", "FinServ__TimeHorizon__c"),
    ("FinServ__RiskTolerance__c", "FinServ__InvestmentExperience__c"),
    ("Tier__c", "FinServ__ServiceModel__c"),
    ("FinServ__CustomerType__c", "FinServ__ClientCategory__c"),
    ("FinServ__RelationshipStartDate__c", "FinServ__LengthOfRelationship__c"),
    ("FinServ__TaxId__pc", "FinServ__LastFourDigitSSN__pc"),
    ("NAICS_Code__c", "Sic"),
]


def paired_partner(field_name: str) -> str | None:
    """Return the partner field for a given field, or None if not paired."""
    for a, b in PAIRED_FIELDS:
        if field_name == a:
            return b
        if field_name == b:
            return a
    return None


def read_paired_value(
    record: dict, field_name: str
) -> tuple[str, object] | None:
    """Return the populated half of a paired field, or None if both nulls.

    If `field_name` is paired with another field and either side has a non-null
    value on `record`, return `(populated_field_name, populated_value)` so a
    deriver can deterministically derive the partner from the existing value
    rather than re-rolling from rng. Returns None when the field isn't paired
    or both halves are null.
    """
    partner = paired_partner(field_name)
    if partner is None:
        return None
    own = record.get(field_name)
    pair = record.get(partner)
    if own is not None:
        return (field_name, own)
    if pair is not None:
        return (partner, pair)
    return None
