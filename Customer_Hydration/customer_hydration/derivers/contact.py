"""contact deriver — person-side fields (rule 24).

Plan 4b: MiddleName, PersonTitle, PersonAssistantName/Phone, PersonDepartment,
PersonLeadSource, Salutation, AccountNumber, Description top-off.
Plan 4c: NAICS_Code__c, Sic, SicDesc, Site, TickerSymbol, Jigsaw, JigsawCompanyId,
Industry top-off, Type, Rating.
"""
from __future__ import annotations

import hashlib
import string
from random import Random
from typing import Any

from customer_hydration.derivers._archetype import PersonaArchetype
from customer_hydration.derivers._helpers import load_picklist_yaml, weighted_pick


# Rule 24 — PersonTitle distributions by (age_bucket, gender)
def _person_title_weights(age: int, gender: str) -> tuple[list[str], list[float]]:
    if gender == "Female":
        if age < 30:
            return ["Ms", "Miss", "Dr"], [0.70, 0.25, 0.05]
        if age < 50:
            return ["Ms", "Mrs", "Dr"], [0.60, 0.30, 0.10]
        return ["Mrs", "Ms", "Dr", "Hon"], [0.55, 0.30, 0.10, 0.05]
    if gender == "Male":
        if age < 30:
            return ["Mr", "Dr"], [0.95, 0.05]
        if age < 50:
            return ["Mr", "Dr"], [0.85, 0.15]
        return ["Mr", "Dr", "Sr", "Hon"], [0.60, 0.25, 0.10, 0.05]
    # Neutral / unknown gender
    return ["Dr", "Mx"], [0.60, 0.40]


_DEPARTMENT_VALUES = ["Engineering", "Operations", "Finance", "Sales", "Marketing",
                       "Legal", "HR", "Customer Service", "Other"]
_DEPARTMENT_WEIGHTS = [0.20, 0.20, 0.10, 0.10, 0.10, 0.05, 0.05, 0.10, 0.10]


_LEADSOURCE_VALUES = ["Web", "Referral", "Phone Inquiry", "Partner", "Other"]
_LEADSOURCE_WEIGHTS = [0.30, 0.40, 0.10, 0.15, 0.05]


_DESCRIPTION_TEMPLATES = [
    "Long-tenured customer with strong banking relationship.",
    "Recent customer; growing wallet share.",
    "Active client with diversified holdings.",
    "Reliable depositor; regular interaction with branch.",
    "High-value relationship; quarterly review cadence.",
]


# Rule 20 — NAICS → SIC mapping (subset; matches archetype's INDUSTRY_TO_NAICS)
_NAICS_TO_SIC: dict[str, tuple[str, str]] = {
    "522110": ("6020", "Commercial Banks"),
    "523000": ("6199", "Finance Services"),
    "524113": ("6311", "Life Insurance"),
    "621111": ("8011", "Offices of Doctors of Medicine"),
    "336111": ("3711", "Motor Vehicles & Passenger Car Bodies"),
    "452210": ("5331", "Variety Stores"),
    "541512": ("7372", "Prepackaged Software"),
    "531210": ("6531", "Real Estate Agents & Managers"),
    "611110": ("8211", "Elementary & Secondary Schools"),
    "721110": ("7011", "Hotels & Motels"),
    "211120": ("1311", "Crude Petroleum & Natural Gas"),
    "111110": ("0111", "Wheat"),
}


# Rule 21 — Industry top-off skipped when AccountSource indicates real data
_REAL_ACCOUNT_SOURCES = {"Web", "Phone Inquiry", "Partner Referral"}


_TICKER_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def _account_number(record: dict, account_id: str) -> str:
    """Format AccountNumber from External_ID__c digits, or a hash-based fallback."""
    ext = record.get("External_ID__c") or ""
    digits = "".join(c for c in ext if c.isdigit())
    if len(digits) >= 6:
        return f"ACCT-{digits[-8:]}"
    digest = hashlib.sha256(("acct:" + account_id).encode()).digest()
    n = int.from_bytes(digest[:4], "big") % 100_000_000
    return f"ACCT-{n:08d}"


class ContactDeriver:
    """Plan 4b: person-side. Plan 4c extends with B2B fields."""

    name = "contact"
    fields = [
        "MiddleName",
        "PersonTitle",
        "PersonAssistantName",
        "PersonAssistantPhone",
        "PersonDepartment",
        "PersonLeadSource",
        "Salutation",
        "AccountNumber",
        "Description",
        # Plan 4c B2B fields
        "NAICS_Code__c",
        "Sic",
        "SicDesc",
        "Site",
        "TickerSymbol",
        "Jigsaw",
        "JigsawCompanyId",
        "Industry",
        "Type",
        "Rating",
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

        # AccountNumber — common to both branches
        out["AccountNumber"] = _account_number(record, archetype.account_id)

        if archetype.is_person:
            # Person-side (rule 24)
            digest = hashlib.sha256(("mid:" + archetype.account_id).encode()).digest()
            out["MiddleName"] = string.ascii_uppercase[digest[0] % 26]

            title_values, title_weights = _person_title_weights(
                archetype.age, archetype.gender
            )
            title = weighted_pick(rng, title_values, title_weights)
            out["PersonTitle"] = title
            out["Salutation"] = title

            if archetype.income_band in ("hnw", "uhnw"):
                out["PersonAssistantName"] = "Executive Assistant"
                ph_digest = hashlib.sha256(
                    ("assist:" + archetype.account_id).encode()
                ).digest()
                n = int.from_bytes(ph_digest[:6], "big")
                out["PersonAssistantPhone"] = (
                    f"({200 + (n % 800):03d}) "
                    f"{(n >> 16) % 1000:03d}-{(n >> 8) % 10_000:04d}"
                )

            out["PersonDepartment"] = weighted_pick(
                rng, _DEPARTMENT_VALUES, _DEPARTMENT_WEIGHTS
            )
            out["PersonLeadSource"] = weighted_pick(
                rng, _LEADSOURCE_VALUES, _LEADSOURCE_WEIGHTS
            )

            if record.get("Description") is None:
                template_idx = digest[1] % len(_DESCRIPTION_TEMPLATES)
                out["Description"] = _DESCRIPTION_TEMPLATES[template_idx]

            return out

        # B2B branch (rules 19, 20, 21)
        digest = hashlib.sha256(archetype.account_id.encode()).digest()

        # Rule 20 — NAICS + Sic + SicDesc paired
        naics = archetype.industry_code or "541512"
        out["NAICS_Code__c"] = naics
        sic, sic_desc = _NAICS_TO_SIC.get(naics, ("7389", "Services-Business Services"))
        out["Sic"] = sic
        out["SicDesc"] = sic_desc

        # Site — synthetic URL keyed off account_id
        site_slug = digest[:3].hex()
        out["Site"] = f"https://cumulus-{site_slug}.example.com"

        # Rule 19 — TickerSymbol only for large/enterprise
        if archetype.business_size in ("large", "enterprise"):
            ticker_chars = [
                _TICKER_LETTERS[digest[i] % 26] for i in range(4)
            ]
            out["TickerSymbol"] = "".join(ticker_chars)

        # Jigsaw + JigsawCompanyId — synthetic 8-digit identifiers
        jig = int.from_bytes(digest[3:7], "big") % 100_000_000
        jig_company = int.from_bytes(digest[7:11], "big") % 100_000_000
        out["Jigsaw"] = f"{jig:08d}"
        out["JigsawCompanyId"] = f"{jig_company:08d}"

        # Rule 21 — Industry top-off (skip if real source or already set)
        account_source = record.get("AccountSource")
        existing_industry = record.get("Industry")
        if existing_industry is None and account_source not in _REAL_ACCOUNT_SOURCES:
            industry_picklist = load_picklist_yaml("Industry")
            if industry_picklist:
                out["Industry"] = weighted_pick(
                    rng, industry_picklist["values"], industry_picklist["weights"]
                )

        # Type + Rating — picklists
        type_picklist = load_picklist_yaml("Type")
        if type_picklist:
            out["Type"] = weighted_pick(
                rng, type_picklist["values"], type_picklist["weights"]
            )
        rating_picklist = load_picklist_yaml("Rating")
        if rating_picklist:
            out["Rating"] = weighted_pick(
                rng, rating_picklist["values"], rating_picklist["weights"]
            )

        # Description top-off — same templates as person side
        if record.get("Description") is None:
            template_idx = digest[1] % len(_DESCRIPTION_TEMPLATES)
            out["Description"] = _DESCRIPTION_TEMPLATES[template_idx]

        return out
