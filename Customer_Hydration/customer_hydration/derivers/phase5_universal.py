"""Phase 5b — universal field backfill (~26 fields).

Single deriver covering 6 logical groups previously planned as separate derivers.
Consolidating into one keeps the registry small and avoids cross-group I/O
duplication. Per-row, the deriver picks values for:

  1. Multipicklists (5 fields):
        InvestmentObjectives, PersonalInterests, CustomerSegment,
        MarketingSegment, FinancialInterests
  2. FSC __pc shadows (3 fields):
        FinServ_Category__pc, FinServ_Contact_Status__pc, FinServ__IndividualType__pc
  3. Person→Biz parity (8 fields):
        CountryOfBirth__pc, CountryOfResidence__pc (biz: HQ-derived),
        InvestmentExperience__c, RiskTolerance__c, ServiceModel__c,
        BorrowingHistory__c, TimeHorizon__c, ContactPreference__pc
  4. Biz→Person parity (2 fields): Rating, Type
  5. Both-cohort standards (3 fields): AccountSource, Phone, Website
  6. IndividualType__c (5,610 missing biz rows)

PrimaryContact is a separate deriver (different shape: requires Contact synth
+ ACR creation pre-pass; can't be a pure derive() function).

Spec: docs/superpowers/specs/2026-05-27-phase-5-dmo-backfill-design.md §4.2
"""
from __future__ import annotations

import hashlib
from random import Random
from typing import Any

from customer_hydration.derivers._archetype import PersonaArchetype


# === Multipicklist templates ===
# Each value is a ;-delimited string. Picklist drift preflight keeps these
# in sync with the org's actual vocabulary; values not accepted by the org
# are filtered out at preflight time, not here.

_INVESTMENT_OBJECTIVES_BY_PERSONA: dict[str, list[str]] = {
    "wealth":     ["Balanced;Growth", "Aggressive Growth", "Income;Balanced"],
    "retail":     ["Balanced", "Growth", "Conservative Income"],
    "household":  ["Conservative Income;Income", "Balanced"],
    "smb":        ["Growth", "Balanced;Growth"],
    "commercial": ["Growth;Balanced", "Aggressive Growth"],
    "unknown":    ["Balanced"],
}

_PERSONAL_INTERESTS_BY_PERSONA: dict[str, list[str]] = {
    "wealth":     ["Wine;Hiking", "Cooking;Wine", "Hiking;Biking"],
    "retail":     ["College Basketball;Cooking", "Cooking;Hiking", "Biking"],
    "household":  ["Cooking;Hiking", "College Basketball"],
    "smb":        ["Cooking;Wine", "Hiking;Biking"],
    "commercial": ["Wine;Environment", "Cooking;Wine"],
    "unknown":    ["Cooking"],
}

_FINANCIAL_INTERESTS_BY_PERSONA: dict[str, list[str]] = {
    "wealth":     ["Fixed Income;Retirement", "Energy;Technology", "Municipal Bonds;Retirement"],
    "retail":     ["Retirement;College Planning", "Fixed Income"],
    "household":  ["College Planning;Retirement", "Fixed Income"],
    "smb":        ["Technology;Energy", "Fixed Income"],
    "commercial": ["Energy;Technology;Fixed Income", "Municipal Bonds"],
    "unknown":    ["Fixed Income"],
}

# CustomerSegment / MarketingSegment are FSC marketing-ops slices — rotate
# values that exist in the org's picklist vocab.
_CUSTOMER_SEGMENT_BY_PERSONA: dict[str, list[str]] = {
    "wealth":     ["Wealth Accumulation;Long Term Growth", "Mass Affluent;Wealth Accumulation"],
    "retail":     ["Mass Market;Transactional", "Mass Affluent"],
    "household":  ["Mass Market", "Mass Affluent;Borrower"],
    "smb":        ["SMB;Borrower", "Startup;SMB"],
    "commercial": ["Enterprise;Strategic", "Mid-Market;Enterprise"],
    "unknown":    ["Mass Market"],
}

_MARKETING_SEGMENT_BY_PERSONA: dict[str, list[str]] = {
    "wealth":     ["High Net Worth", "Mass Affluent;High Net Worth"],
    "retail":     ["Mass Affluent;Millennial", "Female Investor"],
    "household":  ["Mass Affluent", "Mass Affluent;Female Investor"],
    "smb":        ["Mass Affluent", "Millennial"],
    "commercial": ["High Net Worth", "High Net Worth;Mass Affluent"],
    "unknown":    ["Mass Affluent"],
}


# === Picklist-shadow mappings ===

# Map persona → Tier-equivalent for FinServ_Category__pc (org accepts
# Platinum/Gold/Silver/Bronze).
_CATEGORY_PC_BY_PERSONA: dict[str, str] = {
    "wealth":     "Platinum",
    "commercial": "Platinum",
    "smb":        "Gold",
    "household":  "Silver",
    "retail":     "Silver",
    "unknown":    "Bronze",
}

# Hydrated rows are existing customers, not prospects.
_CONTACT_STATUS_PC_DEFAULT = "Client"


# === Person→Biz parity defaults ===

# Country derivation: persons get assigned countries via existing data; biz
# get a U.S. default since hydration is U.S.-centric (see _archetype.US_METROS).
_COUNTRY_DEFAULT = "United States"

_INVESTMENT_EXPERIENCE_BY_PERSONA: dict[str, list[str]] = {
    "wealth":     ["Experienced", "Knowledgeable"],
    "commercial": ["Experienced"],
    "smb":        ["Knowledgeable", "Experienced"],
    "retail":     ["Beginner", "Knowledgeable"],
    "household":  ["Beginner", "Knowledgeable"],
    "unknown":    ["Beginner"],
}

_RISK_TOLERANCE_BY_PERSONA: dict[str, list[str]] = {
    "wealth":     ["Moderate", "High"],
    "commercial": ["High", "Moderate"],
    "smb":        ["Moderate", "High"],
    "retail":     ["Low", "Moderate"],
    "household":  ["Low", "Moderate"],
    "unknown":    ["Moderate"],
}

_SERVICE_MODEL_BY_PERSONA: dict[str, str] = {
    "wealth":     "Premier",
    "commercial": "Premier",
    "smb":        "Premier",
    "retail":     "Standard",
    "household":  "Standard",
    "unknown":    "Standard",
}

_BORROWING_HISTORY_BY_PERSONA: dict[str, list[str]] = {
    "wealth":     ["Excellent", "Good"],
    "commercial": ["Excellent", "Good"],
    "smb":        ["Good", "Fair"],
    "retail":     ["Good", "Fair"],
    "household":  ["Fair", "Good"],
    "unknown":    ["Fair"],
}

_TIME_HORIZON_BY_PERSONA: dict[str, list[str]] = {
    "wealth":     ["Long", "Medium"],
    "commercial": ["Long"],
    "smb":        ["Medium", "Long"],
    "retail":     ["Short", "Medium"],
    "household":  ["Medium", "Short"],
    "unknown":    ["Medium"],
}

_CONTACT_PREFERENCE_PC_DEFAULT = "Email"


# === Biz→Person parity ===

_RATING_BY_PERSONA: dict[str, str] = {
    "wealth":     "Hot",
    "commercial": "Hot",
    "smb":        "Warm",
    "retail":     "Warm",
    "household":  "Cool",
    "unknown":    "Cool",
}

_TYPE_BY_PERSONA: dict[str, str] = {
    "wealth":     "Person",
    "retail":     "Person",
    "household":  "Person",
    "smb":        "Small Business",
    "commercial": "Enterprise",
    "unknown":    "Person",
}


# === Standards ===

_ACCOUNT_SOURCE_DISTRIBUTION: list[tuple[str, int]] = [
    ("Website",         30),
    ("Referral",        25),
    ("Inbound Call",    15),
    ("Marketing Event", 10),
    ("Social Media",    10),
    ("Partner",          5),
    ("Cold Call",        5),
]


def _stable_pick(seed_str: str, options: list[str]) -> str:
    """Pick one option deterministically from a list keyed on seed_str."""
    if not options:
        return ""
    digest = hashlib.sha256(seed_str.encode("utf-8")).digest()
    return options[int.from_bytes(digest[:4], "big") % len(options)]


def _stable_pick_weighted(seed_str: str, weighted: list[tuple[str, int]]) -> str:
    """Weighted deterministic pick keyed on seed_str."""
    total = sum(w for _, w in weighted)
    if total == 0:
        return ""
    digest = hashlib.sha256(seed_str.encode("utf-8")).digest()
    roll = (int.from_bytes(digest[:4], "big") % total) + 1
    running = 0
    for value, weight in weighted:
        running += weight
        if roll <= running:
            return value
    return weighted[-1][0]


def _phone_number_from_id(account_id: str) -> str:
    """Generate a stable synthetic 10-digit phone number from account_id hash."""
    digest = hashlib.sha256(account_id.encode("utf-8")).digest()
    n = int.from_bytes(digest[:7], "big")
    area = 200 + (n % 800)         # 200-999
    exchange = 200 + ((n >> 10) % 800)  # 200-999
    line = (n >> 20) % 10000
    return f"({area:03d}) {exchange:03d}-{line:04d}"


class Phase5UniversalDeriver:
    """Owns ~26 fields across 6 logical groups. See module docstring."""

    name = "phase5_universal"
    fields = [
        # Multipicklists
        "FinServ__InvestmentObjectives__c",
        "FinServ__PersonalInterests__c",
        "FinServ__CustomerSegment__c",
        "FinServ__MarketingSegment__c",
        "FinServ__FinancialInterests__c",
        # FSC __pc shadows
        "FinServ_Category__pc",
        "FinServ_Contact_Status__pc",
        "FinServ__IndividualType__pc",
        # Person→Biz parity
        "FinServ__CountryOfBirth__pc",
        "FinServ__CountryOfResidence__pc",
        "FinServ__InvestmentExperience__c",
        "FinServ__RiskTolerance__c",
        "FinServ__ServiceModel__c",
        "FinServ__BorrowingHistory__c",
        "FinServ__TimeHorizon__c",
        "FinServ__ContactPreference__pc",
        # Biz→Person parity
        "Rating",
        "Type",
        # IndividualType __c
        "FinServ__IndividualType__c",
        # Standards (both cohorts)
        "AccountSource",
        "Phone",
        "Website",
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
        persona = archetype.persona
        is_person = archetype.is_person
        seed = archetype.account_id

        # === Multipicklists (everyone) ===
        out["FinServ__InvestmentObjectives__c"] = _stable_pick(
            f"{seed}|InvestmentObjectives",
            _INVESTMENT_OBJECTIVES_BY_PERSONA.get(persona, _INVESTMENT_OBJECTIVES_BY_PERSONA["unknown"]),
        )
        out["FinServ__PersonalInterests__c"] = _stable_pick(
            f"{seed}|PersonalInterests",
            _PERSONAL_INTERESTS_BY_PERSONA.get(persona, _PERSONAL_INTERESTS_BY_PERSONA["unknown"]),
        )
        out["FinServ__CustomerSegment__c"] = _stable_pick(
            f"{seed}|CustomerSegment",
            _CUSTOMER_SEGMENT_BY_PERSONA.get(persona, _CUSTOMER_SEGMENT_BY_PERSONA["unknown"]),
        )
        out["FinServ__MarketingSegment__c"] = _stable_pick(
            f"{seed}|MarketingSegment",
            _MARKETING_SEGMENT_BY_PERSONA.get(persona, _MARKETING_SEGMENT_BY_PERSONA["unknown"]),
        )
        out["FinServ__FinancialInterests__c"] = _stable_pick(
            f"{seed}|FinancialInterests",
            _FINANCIAL_INTERESTS_BY_PERSONA.get(persona, _FINANCIAL_INTERESTS_BY_PERSONA["unknown"]),
        )

        # === FSC __pc shadows ===
        # Person-only shadow fields stay person-only (the platform rejects
        # __pc writes on non-person accounts). Skip biz cohort.
        if is_person:
            out["FinServ_Category__pc"] = _CATEGORY_PC_BY_PERSONA.get(persona, "Bronze")
            out["FinServ_Contact_Status__pc"] = _CONTACT_STATUS_PC_DEFAULT
            out["FinServ__IndividualType__pc"] = "Individual"

        # === Person→Biz parity (8 fields) ===
        # CountryOfBirth/Residence are __pc shadow fields; only writable on
        # Person Accounts. Biz cohort: skip — these fields don't apply.
        # Persons that lack values get the U.S. default; persons that already
        # have values get null-filtered by the orchestrator's delta logic.
        if is_person:
            out["FinServ__CountryOfBirth__pc"] = _COUNTRY_DEFAULT
            out["FinServ__CountryOfResidence__pc"] = _COUNTRY_DEFAULT

        out["FinServ__InvestmentExperience__c"] = _stable_pick(
            f"{seed}|InvestmentExperience",
            _INVESTMENT_EXPERIENCE_BY_PERSONA.get(persona, _INVESTMENT_EXPERIENCE_BY_PERSONA["unknown"]),
        )
        out["FinServ__RiskTolerance__c"] = _stable_pick(
            f"{seed}|RiskTolerance",
            _RISK_TOLERANCE_BY_PERSONA.get(persona, _RISK_TOLERANCE_BY_PERSONA["unknown"]),
        )
        out["FinServ__ServiceModel__c"] = _SERVICE_MODEL_BY_PERSONA.get(persona, "Standard")
        out["FinServ__BorrowingHistory__c"] = _stable_pick(
            f"{seed}|BorrowingHistory",
            _BORROWING_HISTORY_BY_PERSONA.get(persona, _BORROWING_HISTORY_BY_PERSONA["unknown"]),
        )
        out["FinServ__TimeHorizon__c"] = _stable_pick(
            f"{seed}|TimeHorizon",
            _TIME_HORIZON_BY_PERSONA.get(persona, _TIME_HORIZON_BY_PERSONA["unknown"]),
        )
        if is_person:
            out["FinServ__ContactPreference__pc"] = _CONTACT_PREFERENCE_PC_DEFAULT

        # === Biz→Person parity ===
        out["Rating"] = _RATING_BY_PERSONA.get(persona, "Cool")
        out["Type"] = _TYPE_BY_PERSONA.get(persona, "Person")

        # === IndividualType__c (covers the 5,610 missing biz rows; Phase 4
        # already populated this on persons + households) ===
        out["FinServ__IndividualType__c"] = "Group" if not is_person else "Individual"

        # === Standards ===
        out["AccountSource"] = _stable_pick_weighted(
            f"{seed}|AccountSource", _ACCOUNT_SOURCE_DISTRIBUTION,
        )

        # Phone: businesses get it via biz Phone (top-level); persons mirror
        # PersonMobilePhone if it's already populated, else generate one.
        if is_person:
            out["Phone"] = record.get("PersonMobilePhone") or _phone_number_from_id(seed)
        else:
            out["Phone"] = _phone_number_from_id(seed)

        # Website: biz only. Persons skip.
        if not is_person:
            slug = seed[-12:].lower().rstrip("a") or "acct"
            out["Website"] = f"https://www.{slug}.example.com"

        return out
