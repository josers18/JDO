"""relationship deriver — RelationshipStartDate, KYC fields, LifetimeValue, NextReview.

See spec §4.4 (relationship row) and §4.2 rules 4, 5, 6, 7, 8.
"""
from __future__ import annotations

from datetime import date, timedelta
from random import Random
from typing import Any

from customer_hydration.derivers._archetype import PersonaArchetype
from customer_hydration.derivers._helpers import load_picklist_yaml, weighted_pick


# Rule 6 — KYCStatus distribution by engagement_level
_KYC_WEIGHTS_BY_ENGAGEMENT: dict[str, list[float]] = {
    "dormant": [0.60, 0.05, 0.35],
    "light":   [0.80, 0.10, 0.10],
    "regular": [0.92, 0.06, 0.02],
    "heavy":   [0.98, 0.02, 0.00],
}


# Rule 7 — engagement multiplier on LifetimeValue
_ENGAGEMENT_MULT: dict[str, float] = {
    "dormant": 0.02,
    "light":   0.05,
    "regular": 0.10,
    "heavy":   0.20,
}


# Rule 7 + 1 — tier multiplier on LifetimeValue (income_band → Tier → multiplier)
_TIER_BY_INCOME_BAND: dict[str, str] = {
    "entry":    "Bronze",
    "middle":   "Silver",
    "affluent": "Gold",
    "hnw":      "Platinum",
    "uhnw":     "Diamond",
}


_TIER_LIFETIME_MULT: dict[str, float] = {
    "Bronze":   1.00,   # multiplied with engagement_mult; dormant/Bronze = 0.02 × 1.00 = 0.02
    "Silver":   1.10,
    "Gold":     1.25,
    "Platinum": 1.40,
    "Diamond":  1.50,   # heavy/Diamond = 0.20 × 1.50 = 0.30
}


# Rule 8 — NextReview cadence by Tier
_NEXT_REVIEW_DAYS: dict[str, int] = {
    "Diamond":  30,
    "Platinum": 60,
    "Gold":     90,
    "Silver":   180,
    "Bronze":   365,
}


class RelationshipDeriver:
    """Owns relationship-lifecycle fields. See spec §4.4 row 'relationship.py'."""

    name = "relationship"
    fields = [
        "FinServ__RelationshipStartDate__c",
        "FinServ__LengthOfRelationship__c",
        "FinServ__KYCDate__c",
        "FinServ__KYCStatus__c",
        "FinServ__NextReview__c",
        "FinServ__LifetimeValue__c",
        "FinServ__LastInteraction__c",
    ]

    def applies_to(self, archetype: PersonaArchetype) -> bool:
        """Relationship fields apply to every account with a CreatedDate."""
        return True

    def derive(
        self,
        archetype: PersonaArchetype,
        record: dict,
        rng: Random,
    ) -> dict[str, Any]:
        out: dict[str, Any] = {}
        today = date.today()

        # Rule 4 — RelationshipStartDate = CreatedDate
        out["FinServ__RelationshipStartDate__c"] = archetype.created_date.isoformat()

        # LengthOfRelationship — already on archetype as tenure_years
        out["FinServ__LengthOfRelationship__c"] = round(archetype.tenure_years, 2)

        # Rule 5 — KYCDate uniform(created_date, today)
        span_days = max(1, (today - archetype.created_date).days)
        kyc_offset = rng.randint(0, span_days)
        out["FinServ__KYCDate__c"] = (
            archetype.created_date + timedelta(days=kyc_offset)
        ).isoformat()

        # Rule 6 — KYCStatus weighted by engagement_level
        weights = _KYC_WEIGHTS_BY_ENGAGEMENT.get(archetype.engagement_level,
                                                  [0.90, 0.08, 0.02])
        kyc_picklist = load_picklist_yaml("FinServ__KYCStatus__c")
        kyc_values = (
            kyc_picklist["values"] if kyc_picklist else ["Approved", "Pending", "Expired"]
        )
        out["FinServ__KYCStatus__c"] = weighted_pick(rng, kyc_values, weights)

        # Rule 7 — LifetimeValue (only when AnnualIncome present)
        income = record.get("FinServ__AnnualIncome__pc")
        if income is not None:
            tier = _TIER_BY_INCOME_BAND.get(archetype.income_band, "Silver")
            engagement_mult = _ENGAGEMENT_MULT.get(archetype.engagement_level, 0.10)
            tier_mult = _TIER_LIFETIME_MULT.get(tier, 1.10)
            ltv = float(income) * archetype.tenure_years * engagement_mult * tier_mult
            out["FinServ__LifetimeValue__c"] = round(ltv, 2)

        # Rule 8 — NextReview cadence by Tier
        tier = _TIER_BY_INCOME_BAND.get(archetype.income_band, "Silver")
        out["FinServ__NextReview__c"] = (
            today + timedelta(days=_NEXT_REVIEW_DAYS[tier])
        ).isoformat()

        # LastInteraction top-off (only when record value is null)
        if record.get("FinServ__LastInteraction__c") is None:
            offset = rng.randint(0, 365)
            out["FinServ__LastInteraction__c"] = (today - timedelta(days=offset)).isoformat()

        return out
