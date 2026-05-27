"""PersonaArchetype — the coherence layer (spec §4.1).

A small set of latent variables computed once per Account from existing-data
anchors. All derivers consume the archetype, making cross-field coherence
structural rather than test-enforced.
"""
from __future__ import annotations

import hashlib
import math
from dataclasses import dataclass
from datetime import date, datetime
from random import Random
from typing import Any

from customer_hydration.derivers._helpers import (
    business_size as compute_business_size,
)
from customer_hydration.derivers._helpers import (
    income_band as compute_income_band,
)


# 50-metro pool keyed off account_id hash (spec §4.1 step 8)
US_METROS: list[tuple[str, str]] = [
    ("New York", "NY"), ("Los Angeles", "CA"), ("Chicago", "IL"),
    ("Houston", "TX"), ("Phoenix", "AZ"), ("Philadelphia", "PA"),
    ("San Antonio", "TX"), ("San Diego", "CA"), ("Dallas", "TX"),
    ("San Jose", "CA"), ("Austin", "TX"), ("Jacksonville", "FL"),
    ("Fort Worth", "TX"), ("Columbus", "OH"), ("Charlotte", "NC"),
    ("San Francisco", "CA"), ("Indianapolis", "IN"), ("Seattle", "WA"),
    ("Denver", "CO"), ("Washington", "DC"), ("Boston", "MA"),
    ("El Paso", "TX"), ("Nashville", "TN"), ("Detroit", "MI"),
    ("Oklahoma City", "OK"), ("Portland", "OR"), ("Las Vegas", "NV"),
    ("Memphis", "TN"), ("Louisville", "KY"), ("Baltimore", "MD"),
    ("Milwaukee", "WI"), ("Albuquerque", "NM"), ("Tucson", "AZ"),
    ("Fresno", "CA"), ("Sacramento", "CA"), ("Mesa", "AZ"),
    ("Kansas City", "MO"), ("Atlanta", "GA"), ("Long Beach", "CA"),
    ("Colorado Springs", "CO"), ("Raleigh", "NC"), ("Miami", "FL"),
    ("Virginia Beach", "VA"), ("Omaha", "NE"), ("Oakland", "CA"),
    ("Minneapolis", "MN"), ("Tulsa", "OK"), ("Arlington", "TX"),
    ("New Orleans", "LA"), ("Wichita", "KS"),
]


# Industry → NAICS lookup (subset; expand in Plan 4c if needed)
INDUSTRY_TO_NAICS: dict[str, str] = {
    "Banking": "522110",
    "Finance": "523000",
    "Insurance": "524113",
    "Healthcare": "621111",
    "Manufacturing": "336111",
    "Retail": "452210",
    "Technology": "541512",
    "Real Estate": "531210",
    "Education": "611110",
    "Hospitality": "721110",
    "Energy": "211120",
    "Agriculture": "111110",
}


@dataclass(frozen=True)
class PersonaArchetype:
    """The coherence layer. See spec §4.1 for field semantics."""

    # Anchors
    account_id: str
    created_date: date
    record_type: str
    is_person: bool
    persona: str

    # Person latents
    age: int
    gender: str
    marital_status: str
    household_size: int

    # Financial latents
    income_band: str
    credit_quality: float
    net_worth_multiple: float

    # Relationship latents
    tenure_years: float
    engagement_level: str

    # Geographic
    home_metro: str

    # Business latents (None on person accounts)
    business_size: str | None
    industry_code: str | None
    business_credit_quality: float | None


def _persona_from_external_id_or_rt(record: dict) -> str:
    """Map External_ID__c prefix or RecordType.Name to one of:
    retail | wealth | smb | commercial | household | unknown.
    """
    ext_id = record.get("External_ID__c") or ""
    if ext_id.startswith("HYDRATE-RTL-"):
        return "retail"
    if ext_id.startswith("HYDRATE-WLT-"):
        return "wealth"
    if ext_id.startswith("HYDRATE-SMB-"):
        return "smb"
    if ext_id.startswith("HYDRATE-COM-"):
        return "commercial"
    if ext_id.startswith("HYDRATE-HH-"):
        return "household"

    rt = record.get("RecordType.Name") or ""
    is_person = bool(record.get("IsPersonAccount"))
    if is_person:
        return "retail"
    if rt in ("Business", "Entity", "Partner"):
        return "commercial"
    if rt == "Household":
        return "household"
    return "unknown"


def _parse_date(value: Any) -> date | None:
    """Parse a date from SOQL response (ISO string or already-date)."""
    if value is None:
        return None
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        # Handles 'YYYY-MM-DD' and 'YYYY-MM-DDTHH:MM:SSZ'
        return datetime.fromisoformat(value.replace("Z", "+00:00")).date()
    raise ValueError(f"Cannot parse date from {value!r}")


def _age_from_birthdate(birthdate: date | None, today: date) -> int | None:
    if birthdate is None:
        return None
    years = today.year - birthdate.year
    if (today.month, today.day) < (birthdate.month, birthdate.day):
        years -= 1
    return years


def _engagement_from_last_interaction(last_interaction: date | None, today: date) -> str | None:
    """heavy < 30d, regular < 90d, light < 365d, dormant ≥ 365d."""
    if last_interaction is None:
        return None
    days = (today - last_interaction).days
    if days < 30:
        return "heavy"
    if days < 90:
        return "regular"
    if days < 365:
        return "light"
    return "dormant"


def _net_worth_multiple_from_age(age: int) -> float:
    """Rough wealth-by-life-stage curve (spec §4.1 step 6)."""
    if age < 25:
        return 0.5
    if age < 35:
        return 1.5
    if age < 50:
        return 4.0
    if age < 65:
        return 8.0
    return 10.0


def _income_band_score(band: str) -> float:
    """Map income band to 0–1 score for credit_quality computation."""
    return {"entry": 0.2, "middle": 0.5, "affluent": 0.7, "hnw": 0.85, "uhnw": 0.95}.get(band, 0.5)


def _tenure_score(years: float) -> float:
    """Saturating tenure score: 0y → 0, 5y → 0.5, 10y+ → 1.0."""
    return min(1.0, years / 10.0)


def _age_score(age: int) -> float:
    """Saturating age score: 25 → 0, 60 → 1."""
    return min(1.0, max(0.0, (age - 25) / 35.0))


def _pick_metro(account_id: str) -> str:
    """Deterministic metro pick from US_METROS keyed off account_id hash."""
    digest = hashlib.sha256(account_id.encode("utf-8")).digest()
    idx = int.from_bytes(digest[:4], "big") % len(US_METROS)
    city, state = US_METROS[idx]
    return f"{city}, {state}"


def build_archetype(
    record: dict,
    rng: Random,
    life_events: list[dict] | None = None,
    *,
    today: date | None = None,
) -> PersonaArchetype:
    """Build a PersonaArchetype from a raw SOQL record + Phase 3c LifeEvents.

    See spec §4.1 for the 11-step construction.
    """
    today = today or date.today()
    life_events = life_events or []

    # 1. Anchors
    account_id = record["Id"]
    created_date = _parse_date(record.get("CreatedDate")) or today
    record_type = record.get("RecordType.Name") or ""
    is_person = bool(record.get("IsPersonAccount"))
    persona = _persona_from_external_id_or_rt(record)

    # 2. Person anchors (when present)
    birthdate = _parse_date(record.get("PersonBirthdate"))
    age_anchor = _age_from_birthdate(birthdate, today)
    age = age_anchor if age_anchor is not None else 30 + rng.randint(0, 30)

    gender = record.get("PersonGender") or rng.choice(["Male", "Female"])
    marital_status = record.get("FinServ__MaritalStatus__pc") or "Single"

    # 2b. LifeEvent integration (spec rule 22) — fills nulls only, never overwrites
    LIFE_EVENT_MARITAL_MAP = {
        "Marriage": "Married",
        "Divorce": "Divorced",
        "Death of Spouse": "Widowed",
    }
    if marital_status == "Single":  # only override the default
        for event in life_events:
            event_type = event.get("FinServ__EventType__c")
            if event_type in LIFE_EVENT_MARITAL_MAP and \
               record.get("FinServ__MaritalStatus__pc") is None:
                marital_status = LIFE_EVENT_MARITAL_MAP[event_type]
                break

    # 3. tenure_years
    tenure_years = (today - created_date).days / 365.25

    # 4. income_band (also drives B2B branch)
    annual_income = record.get("FinServ__AnnualIncome__pc")
    annual_revenue = record.get("AnnualRevenue")
    if is_person:
        ib = compute_income_band(annual_income)
    else:
        # B2B accounts use revenue band, mapped onto the same 5-tier scale
        bs = compute_business_size(annual_revenue)
        ib = {"micro": "entry", "small": "middle", "mid": "affluent",
              "large": "hnw", "enterprise": "uhnw"}[bs]

    # 5. credit_quality
    cq = (
        0.4
        + 0.4 * _income_band_score(ib)
        + 0.1 * _tenure_score(tenure_years)
        + 0.1 * _age_score(age)
        + rng.gauss(0, 0.08)
    )
    credit_quality = max(0.0, min(1.0, cq))

    # 6. net_worth_multiple
    net_worth_multiple = _net_worth_multiple_from_age(age)

    # 7. engagement_level
    last_interaction = _parse_date(record.get("FinServ__LastInteraction__c"))
    engagement = _engagement_from_last_interaction(last_interaction, today)
    if engagement is None:
        engagement = rng.choices(
            ["dormant", "light", "regular", "heavy"],
            weights=[0.10, 0.25, 0.40, 0.25],
            k=1,
        )[0]

    # 8. home_metro
    home_metro = _pick_metro(account_id)

    # 9. household_size (person accounts only)
    if is_person:
        dependents = record.get("FinServ__NumberOfDependents__pc") or 0
        marital_bump = 1 if marital_status in ("Married",) else 0
        household_size = 1 + max(int(dependents), marital_bump)
    else:
        household_size = 0

    # 10. Business latents
    if is_person:
        bsize: str | None = None
        industry_code: str | None = None
        bcq: float | None = None
    else:
        bsize = compute_business_size(annual_revenue)
        industry = record.get("Industry")
        industry_code = INDUSTRY_TO_NAICS.get(industry or "") if industry else None
        if industry_code is None:
            # Seeded fallback: pick from catalog
            keys = list(INDUSTRY_TO_NAICS.values())
            digest = hashlib.sha256(account_id.encode("utf-8")).digest()
            industry_code = keys[int.from_bytes(digest[4:8], "big") % len(keys)]
        bcq = max(
            0.0,
            min(
                1.0,
                0.4
                + 0.5 * _income_band_score(ib)
                + 0.1 * _tenure_score(tenure_years)
                + rng.gauss(0, 0.08),
            ),
        )

    return PersonaArchetype(
        account_id=account_id,
        created_date=created_date,
        record_type=record_type,
        is_person=is_person,
        persona=persona,
        age=age,
        gender=gender,
        marital_status=marital_status,
        household_size=household_size,
        income_band=ib,
        credit_quality=credit_quality,
        net_worth_multiple=net_worth_multiple,
        tenure_years=tenure_years,
        engagement_level=engagement,
        home_metro=home_metro,
        business_size=bsize,
        industry_code=industry_code,
        business_credit_quality=bcq,
    )
