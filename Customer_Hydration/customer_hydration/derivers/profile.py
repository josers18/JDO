"""profile deriver — Tier, ServiceModel, NetWorth, RiskTolerance triple, etc.

Plan 4b ships the person-applicable fields. Plan 4c extends with AnnualRevenue,
NumberOfEmployees, TotalRevenue (B2B). See spec §4.2 rules 1, 16.
"""
from __future__ import annotations

from random import Random
from typing import Any

from customer_hydration.derivers._archetype import PersonaArchetype
from customer_hydration.derivers._helpers import load_picklist_yaml, weighted_pick


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


# Rule 18 — B2B revenue/employees ranges by business_size
_BUSINESS_REVENUE_RANGE: dict[str, tuple[int, int]] = {
    "micro":      (50_000,         1_000_000),
    "small":      (1_000_000,      10_000_000),
    "mid":        (10_000_000,     100_000_000),
    "large":      (100_000_000,    1_000_000_000),
    "enterprise": (1_000_000_000,  50_000_000_000),
}


_BUSINESS_EMPLOYEES_RANGE: dict[str, tuple[int, int]] = {
    "micro":      (1,    10),
    "small":      (10,   50),
    "mid":        (50,   500),
    "large":      (500,  5000),
    "enterprise": (5000, 100000),
}



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
        # Plan 4c B2B fields
        "AnnualRevenue",
        "NumberOfEmployees",
        "FinServ__TotalRevenue__c",
    ]

    def applies_to(self, archetype: PersonaArchetype) -> bool:
        return True

    def derive(
        self,
        archetype: PersonaArchetype,
        record: dict,
        rng: Random,
    ) -> dict[str, Any]:
        out: dict[str, Any] = {}

        # Status — common to both person and B2B
        out["FinServ__Status__c"] = "Active"

        if archetype.is_person:
            # Person-side: Tier/ServiceModel chain, NetWorth, Risk triple,
            # BorrowingHistory, CustomerType=Individual.
            tier = _TIER_BY_INCOME_BAND.get(archetype.income_band, "Silver")
            out["Tier__c"] = tier
            out["FinServ__ServiceModel__c"] = _SERVICE_MODEL_BY_TIER[tier]
            out["FinServ__CustomerType__c"] = "Individual"

            rollups = [
                record.get("FinServ__TotalInvestments__c"),
                record.get("FinServ__TotalBankDeposits__c"),
                record.get("FinServ__TotalNonfinancialAssets__c"),
                record.get("FinServ__TotalLiabilities__c"),
            ]
            if all(v is not None for v in rollups):
                inv, deposits, nonfin, liab = rollups
                base = float(inv) + float(deposits) + float(nonfin) - float(liab)
                out["FinServ__NetWorth__c"] = round(
                    base * archetype.net_worth_multiple, 2
                )

            weights = _RISK_WEIGHTS_BY_PERSONA.get(
                archetype.persona, _RISK_WEIGHTS_BY_PERSONA["retail"]
            )
            triple_index = weighted_pick(rng, ["0", "1", "2"], weights)
            risk, horizon, exp = _RISK_TRIPLES[int(triple_index)]
            out["FinServ__RiskTolerance__c"] = risk
            out["FinServ__TimeHorizon__c"] = horizon
            out["FinServ__InvestmentExperience__c"] = exp

            borrowing_picklist = load_picklist_yaml("FinServ__BorrowingHistory__c")
            if borrowing_picklist:
                out["FinServ__BorrowingHistory__c"] = weighted_pick(
                    rng, borrowing_picklist["values"], borrowing_picklist["weights"]
                )

            return out

        # B2B branch (rule 18)
        out["FinServ__CustomerType__c"] = "Business"

        # Only fill AnnualRevenue if the record doesn't already have one
        if record.get("AnnualRevenue") is None:
            rev_low, rev_high = _BUSINESS_REVENUE_RANGE[archetype.business_size]
            revenue = rng.randint(rev_low, rev_high - 1)
            out["AnnualRevenue"] = revenue
            out["FinServ__TotalRevenue__c"] = revenue

        # NumberOfEmployees coherent with business_size
        if record.get("NumberOfEmployees") is None:
            emp_low, emp_high = _BUSINESS_EMPLOYEES_RANGE[archetype.business_size]
            out["NumberOfEmployees"] = rng.randint(emp_low, emp_high)

        return out
