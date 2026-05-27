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
from customer_hydration.derivers._helpers import weighted_pick


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
    ]

    def applies_to(self, archetype: PersonaArchetype) -> bool:
        return archetype.is_person

    def derive(
        self,
        archetype: PersonaArchetype,
        record: dict,
        rng: Random,
    ) -> dict[str, Any]:
        out: dict[str, Any] = {}

        # MiddleName — single letter from a deterministic pool
        digest = hashlib.sha256(("mid:" + archetype.account_id).encode()).digest()
        out["MiddleName"] = string.ascii_uppercase[digest[0] % 26]

        # Rule 24 — PersonTitle by (age, gender)
        title_values, title_weights = _person_title_weights(
            archetype.age, archetype.gender
        )
        title = weighted_pick(rng, title_values, title_weights)
        out["PersonTitle"] = title
        # Salutation = same as title (org convention)
        out["Salutation"] = title

        # Assistant name + phone (only for affluent+)
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

        # Department + LeadSource
        out["PersonDepartment"] = weighted_pick(
            rng, _DEPARTMENT_VALUES, _DEPARTMENT_WEIGHTS
        )
        out["PersonLeadSource"] = weighted_pick(
            rng, _LEADSOURCE_VALUES, _LEADSOURCE_WEIGHTS
        )

        # AccountNumber — formatted from external id (or hash fallback)
        out["AccountNumber"] = _account_number(record, archetype.account_id)

        # Description — top-off (only if null)
        if record.get("Description") is None:
            template_idx = digest[1] % len(_DESCRIPTION_TEMPLATES)
            out["Description"] = _DESCRIPTION_TEMPLATES[template_idx]

        return out
