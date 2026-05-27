"""profile deriver — Tier, ServiceModel, NetWorth, RiskTolerance triple, etc.

Plan 4b ships the person-applicable fields. Plan 4c extends with AnnualRevenue,
NumberOfEmployees, TotalRevenue (B2B). See spec §4.2 rules 1, 16.
"""
from __future__ import annotations

from random import Random
from typing import Any

from customer_hydration.derivers._archetype import PersonaArchetype
from customer_hydration.derivers._helpers import weighted_pick


# Rule 1 — Tier from income_band quintile
_TIER_BY_INCOME_BAND: dict[str, str] = {
    "entry":    "Bronze",
    "middle":   "Silver",
    "affluent": "Gold",
    "hnw":      "Platinum",
    "uhnw":     "Diamond",
}


# Rule 1 — ServiceModel from Tier
_SERVICE_MODEL_BY_TIER: dict[str, str] = {
    "Bronze":   "Self-Service",
    "Silver":   "Self-Service",
    "Gold":     "Standard",
    "Platinum": "Premier",
    "Diamond":  "Private",
}


# Rule 16 — three coherent risk triples
_RISK_TRIPLES: list[tuple[str, str, str]] = [
    ("Conservative", "Short-Term", "Beginner"),
    ("Moderate",     "Medium-Term", "Intermediate"),
    ("Aggressive",   "Long-Term",   "Experienced"),
]


# Rule 16 — triple weights by persona
_RISK_WEIGHTS_BY_PERSONA: dict[str, list[float]] = {
    "retail":     [0.30, 0.55, 0.15],
    "wealth":     [0.10, 0.30, 0.60],
    "smb":        [0.20, 0.50, 0.30],
    "commercial": [0.15, 0.45, 0.40],
    "household":  [0.30, 0.55, 0.15],
    "unknown":    [0.30, 0.55, 0.15],
}


_BORROWING_VALUES = ["Excellent", "Good", "Fair", "Poor", "None"]
_BORROWING_WEIGHTS = [0.25, 0.40, 0.20, 0.05, 0.10]


class ProfileDeriver:
    """Owns persona-tier + risk profile + net worth.

    Plan 4b ships the person-applicable subset. Plan 4c will extend `fields`
    and the derive body with B2B fields (AnnualRevenue, NumberOfEmployees,
    TotalRevenue).
    """

    name = "profile"
    fields = [
        "Tier__c",
        "FinServ__CustomerType__c",
        "FinServ__Status__c",
        "FinServ__ServiceModel__c",
        "FinServ__NetWorth__c",
        "FinServ__RiskTolerance__c",
        "FinServ__TimeHorizon__c",
        "FinServ__BorrowingHistory__c",
        "FinServ__InvestmentExperience__c",
    ]

    def applies_to(self, archetype: PersonaArchetype) -> bool:
        # Plan 4b ships person-side. Plan 4c will add `or not archetype.is_person`.
        return archetype.is_person

    def derive(
        self,
        archetype: PersonaArchetype,
        record: dict,
        rng: Random,
    ) -> dict[str, Any]:
        out: dict[str, Any] = {}

        # Rule 1 — Tier and ServiceModel
        tier = _TIER_BY_INCOME_BAND.get(archetype.income_band, "Silver")
        out["Tier__c"] = tier
        out["FinServ__ServiceModel__c"] = _SERVICE_MODEL_BY_TIER[tier]

        # CustomerType — Person Account → Individual (rule 16-adjacent)
        out["FinServ__CustomerType__c"] = "Individual"

        # Status — always Active for backfilled accounts
        out["FinServ__Status__c"] = "Active"

        # NetWorth = (TotalInvestments + TotalBankDeposits + TotalNonfinAssets
        #            - TotalLiabilities) × net_worth_multiple
        rollups = [
            record.get("FinServ__TotalInvestments__c"),
            record.get("FinServ__TotalBankDeposits__c"),
            record.get("FinServ__TotalNonfinancialAssets__c"),
            record.get("FinServ__TotalLiabilities__c"),
        ]
        if all(v is not None for v in rollups):
            inv, deposits, nonfin, liab = rollups
            base = float(inv) + float(deposits) + float(nonfin) - float(liab)
            out["FinServ__NetWorth__c"] = round(base * archetype.net_worth_multiple, 2)

        # Rule 16 — pick one risk triple
        weights = _RISK_WEIGHTS_BY_PERSONA.get(archetype.persona,
                                                _RISK_WEIGHTS_BY_PERSONA["retail"])
        triple_index = weighted_pick(rng, ["0", "1", "2"], weights)
        risk, horizon, exp = _RISK_TRIPLES[int(triple_index)]
        out["FinServ__RiskTolerance__c"] = risk
        out["FinServ__TimeHorizon__c"] = horizon
        out["FinServ__InvestmentExperience__c"] = exp

        # BorrowingHistory — picklist
        out["FinServ__BorrowingHistory__c"] = weighted_pick(
            rng, _BORROWING_VALUES, _BORROWING_WEIGHTS
        )

        return out
