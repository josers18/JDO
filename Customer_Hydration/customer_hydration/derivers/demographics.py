"""demographics deriver — Person Account demographics (rules 9, 10, 11, 12, 14, 15).

Person accounts only. See spec §4.4 row 'demographics.py'.
"""
from __future__ import annotations

import hashlib
from datetime import date, timedelta
from random import Random
from typing import Any

from customer_hydration.derivers._archetype import PersonaArchetype
from customer_hydration.derivers._helpers import load_picklist_yaml, weighted_pick


# Rule 9 — HomeOwnership weights by (age_bucket, income_bucket)
def _home_ownership_weights(age: int, income_band: str) -> list[float]:
    """Return weight list for HomeOwnership picklist (values from YAML).
    Order matches load_picklist_yaml('FinServ__HomeOwnership__pc')['values']:
    [Own, Rent, Other].
    """
    if age < 25:
        return [0.15, 0.80, 0.05]
    if age < 40 and income_band in ("middle", "affluent", "hnw", "uhnw"):
        return [0.60, 0.35, 0.05]
    if age >= 40 and income_band in ("affluent", "hnw", "uhnw"):
        return [0.92, 0.05, 0.03]
    return [0.55, 0.40, 0.05]  # default fallback


# Rule 14 — 2025 single-filer brackets (low end of bracket)
_TAX_BRACKETS: list[tuple[float, str]] = [
    (11_600,  "10%"),
    (47_150,  "12%"),
    (100_525, "22%"),
    (191_950, "24%"),
    (243_725, "32%"),
    (609_350, "35%"),
]


def _tax_bracket(income: float) -> str:
    """Return the marginal bracket name for a given AnnualIncome."""
    if income <= 11_600:
        return "10%"
    if income <= 47_150:
        return "12%"
    if income <= 100_525:
        return "22%"
    if income <= 191_950:
        return "24%"
    if income <= 243_725:
        return "32%"
    if income <= 609_350:
        return "35%"
    return "37%"


def _synth_tax_id(account_id: str) -> str:
    """Synthetic 9-digit tax id, deterministic from account_id."""
    digest = hashlib.sha256(("taxid:" + account_id).encode()).digest()
    n = int.from_bytes(digest[:5], "big") % 1_000_000_000
    return f"{n:09d}"


def _synth_last_four_ssn(account_id: str) -> str:
    """Synthetic last-four SSN, deterministic from account_id (independent of tax id)."""
    digest = hashlib.sha256(("ssn:" + account_id).encode()).digest()
    n = int.from_bytes(digest[:3], "big") % 10_000
    return f"{n:04d}"


# Rule 13 — dependents prior mean varies by persona × income_band.
def _dependents_mean(persona: str, income_band: str) -> float:
    if persona == "wealth" and income_band == "uhnw":
        return 0.8
    if persona == "wealth":
        return 1.2
    if income_band == "middle":
        return 1.8
    return 1.4


# Maiden-name pool for rule (deterministic from account_id)
_MAIDEN_POOL = [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
    "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson",
    "Thomas", "Taylor", "Moore", "Jackson", "Martin",
]


_GENDER_VALUES = ["Male", "Female", "Non-Binary", "Prefer Not to Say"]
_GENDER_WEIGHTS = [0.49, 0.49, 0.01, 0.01]


_PRONOUN_BY_GENDER: dict[str, str] = {
    "Male":     "he/him",
    "Female":   "she/her",
}


_CONTACT_PREF_VALUES = ["Email", "Phone", "Text", "Mail"]
_CONTACT_PREF_WEIGHTS = [0.55, 0.20, 0.20, 0.05]


_COMMUNICATION_PREFS = "Email;Text"


class DemographicsDeriver:
    """Owns 18 person-only demographic fields."""

    name = "demographics"
    fields = [
        "FinServ__HomeOwnership__pc",
        "FinServ__EmployedSince__pc",
        "FinServ__TaxBracket__pc",
        "FinServ__TaxId__pc",
        "FinServ__LastFourDigitSSN__pc",
        "FinServ__MotherMaidenName__pc",
        "FinServ__NumberOfChildren__pc",
        "FinServ__NumberOfDependents__pc",
        "FinServ__WeddingAnniversary__pc",
        "PersonGender",
        "PersonGenderIdentity",
        "PersonPronouns",
        "FinServ__Gender__pc",
        "FinServ__LanguagesSpoken__pc",
        "FinServ__CountryOfResidence__pc",
        "FinServ__CommunicationPreferences__pc",
        "FinServ__ContactPreference__pc",
        "Cust360_Contact_Picture_URL__pc",
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
        today = date.today()

        # Rule 9 — HomeOwnership
        ho_picklist = load_picklist_yaml("FinServ__HomeOwnership__pc")
        ho_weights = _home_ownership_weights(archetype.age, archetype.income_band)
        if ho_picklist:
            out["FinServ__HomeOwnership__pc"] = weighted_pick(
                rng, ho_picklist["values"], ho_weights
            )

        # Rule 10 — EmployedSince ≥ birthdate + 18y
        birthdate_str = record.get("PersonBirthdate")
        if birthdate_str:
            birthdate = date.fromisoformat(birthdate_str)
            # Leap-year safety: a Feb-29 birthdate can't `.replace(year=...)`
            # to a non-leap year (date raises ValueError). Clamp Feb 29 to
            # Feb 28 when the target year isn't a leap year.
            target_year = birthdate.year + 18
            try:
                eighteenth = birthdate.replace(year=target_year)
            except ValueError:
                eighteenth = birthdate.replace(year=target_year, day=28)
            # Pick uniform between eighteenth birthday and (today - 1 month)
            span = max(1, (today - eighteenth).days - 30)
            offset = rng.randint(0, span)
            out["FinServ__EmployedSince__pc"] = (eighteenth + timedelta(days=offset)).isoformat()
        else:
            # No birthdate → pick a tenure between 2 and 30 years
            offset = rng.randint(2 * 365, 30 * 365)
            out["FinServ__EmployedSince__pc"] = (today - timedelta(days=offset)).isoformat()

        # Rule 14 — TaxBracket strict from AnnualIncome (no rng)
        income = record.get("FinServ__AnnualIncome__pc")
        if income is not None:
            out["FinServ__TaxBracket__pc"] = _tax_bracket(float(income))

        # Rule 15 — TaxId + LastFourDigitSSN paired
        out["FinServ__TaxId__pc"] = _synth_tax_id(archetype.account_id)
        out["FinServ__LastFourDigitSSN__pc"] = _synth_last_four_ssn(archetype.account_id)

        # MotherMaidenName — picked deterministically
        digest = hashlib.sha256(("maiden:" + archetype.account_id).encode()).digest()
        out["FinServ__MotherMaidenName__pc"] = _MAIDEN_POOL[
            int.from_bytes(digest[:2], "big") % len(_MAIDEN_POOL)
        ]

        # Rule 11 + 13 — NumberOfDependents bounded by household_size
        dep_max = max(0, archetype.household_size - 1)
        if dep_max == 0:
            dependents = 0
        else:
            target_mean = _dependents_mean(archetype.persona, archetype.income_band)
            # Use a small Poisson-like distribution by picking 0..dep_max with
            # weights tilted toward target_mean.
            choices = list(range(dep_max + 1))
            weights = [
                # higher weight when |k - target_mean| is small
                1.0 / (1.0 + abs(k - target_mean))
                for k in choices
            ]
            dependents = int(weighted_pick(rng, [str(c) for c in choices], weights))
        out["FinServ__NumberOfDependents__pc"] = dependents

        # Rule 11 — NumberOfChildren ≤ NumberOfDependents
        if dependents == 0:
            children = 0
        else:
            children = rng.randint(0, dependents)
        out["FinServ__NumberOfChildren__pc"] = children

        # Rule 12 — WeddingAnniversary consistent with marital_status
        if archetype.marital_status in ("Married", "Divorced", "Widowed"):
            # Pick anniversary 1–30 years before today
            offset = rng.randint(1 * 365, 30 * 365)
            out["FinServ__WeddingAnniversary__pc"] = (
                today - timedelta(days=offset)
            ).isoformat()

        # Gender / GenderIdentity / Pronouns
        gender = archetype.gender
        out["PersonGender"] = gender
        out["FinServ__Gender__pc"] = gender
        # Use existing PersonGenderIdentity if present, else mirror
        gid = record.get("PersonGenderIdentity") or gender
        out["PersonGenderIdentity"] = gid
        out["PersonPronouns"] = _PRONOUN_BY_GENDER.get(gender, "they/them")

        # Languages, country, contact prefs
        out["FinServ__LanguagesSpoken__pc"] = "English"
        out["FinServ__CountryOfResidence__pc"] = "United States"
        out["FinServ__CommunicationPreferences__pc"] = _COMMUNICATION_PREFS
        out["FinServ__ContactPreference__pc"] = weighted_pick(
            rng, _CONTACT_PREF_VALUES, _CONTACT_PREF_WEIGHTS
        )

        # Cust360 contact picture URL — synthetic placeholder URL
        out["Cust360_Contact_Picture_URL__pc"] = (
            f"https://cust360-photos.example.com/{archetype.account_id}.jpg"
        )

        return out
