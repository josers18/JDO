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
