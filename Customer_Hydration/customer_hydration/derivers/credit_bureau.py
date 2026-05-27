"""credit_bureau deriver — B2B bureau scores (rule 17).

All scores derive from `archetype.business_credit_quality` (0–1):
  - PAYDEX 1–100 (positive)
  - Delinquency 101–670 (positive)
  - Failure 1001–1610 (INVERSE — high quality = low failure score)
  - Intelliscore 1–100 (positive)
  - Equifax Credit Risk 101–992 (positive)
  - Equifax Failure 1000–1610 (INVERSE)
  - Equifax Payment Index 0–100 (positive)

Business accounts only. See spec §4.2 rule 17 + §4.4 row 'credit_bureau.py'.
"""
from __future__ import annotations

import hashlib
from random import Random
from typing import Any

from customer_hydration.derivers._archetype import PersonaArchetype


def _scale_positive(quality: float, low: int, high: int, rng: Random) -> int:
    """Scale a 0-1 quality to a [low, high] integer with small Gaussian jitter.
    quality=1 → near high; quality=0 → near low.
    """
    span = high - low
    base = low + quality * span
    # Jitter is ±5% of span — preserves rank while adding variation
    jitter = rng.gauss(0, span * 0.05)
    return max(low, min(high, int(round(base + jitter))))


def _scale_inverse(quality: float, low: int, high: int, rng: Random) -> int:
    """Scale a 0-1 quality to a [low, high] integer with INVERSE relationship.
    quality=1 → near low; quality=0 → near high.
    """
    return _scale_positive(1 - quality, low, high, rng)


# Fitch rating bands by quality
_FITCH_RATING_BANDS: list[tuple[float, str, str]] = [
    (0.95, "AAA", "Investment Grade"),
    (0.85, "AA",  "Investment Grade"),
    (0.70, "A",   "Investment Grade"),
    (0.55, "BBB", "Investment Grade"),
    (0.40, "BB",  "Speculative"),
    (0.25, "B",   "Speculative"),
    (0.00, "CCC", "Speculative"),
]


def _fitch_from_quality(quality: float) -> tuple[str, str]:
    for threshold, rating, category in _FITCH_RATING_BANDS:
        if quality >= threshold:
            return rating, category
    return "CCC", "Speculative"


# DNB rating: letter from quality, number from rng
def _dnb_rating(quality: float, rng: Random) -> str:
    letter_idx = int(round((1 - quality) * 4))  # quality 1 → A, 0 → E
    letter = ["1A", "2A", "3A", "BA", "CB"][min(4, letter_idx)]
    number = rng.randint(1, 4)
    return f"{letter}{number}"


def _experian_risk_band(intelliscore: int) -> str:
    """Experian Risk Band: 1 (lowest risk) — 6 (highest risk)."""
    if intelliscore >= 80:
        return "1"
    if intelliscore >= 60:
        return "2"
    if intelliscore >= 40:
        return "3"
    if intelliscore >= 20:
        return "4"
    if intelliscore >= 10:
        return "5"
    return "6"


def _synth_fein(account_id: str) -> str:
    """Synthetic 9-digit FEIN deterministic from account_id."""
    digest = hashlib.sha256(("fein:" + account_id).encode()).digest()
    n = int.from_bytes(digest[:5], "big") % 1_000_000_000
    return f"{n:09d}"


class CreditBureauDeriver:
    """B2B bureau scores. Business accounts only. See spec rule 17."""

    name = "credit_bureau"
    fields = [
        "DNB_PAYDEX_Score__c",
        "DNB_Delinquency_Score__c",
        "DNB_Failure_Score__c",
        "DNB_Rating__c",
        "Equifax_Credit_Risk_Score__c",
        "Equifax_Failure_Score_CR__c",
        "Equifax_Payment_Index__c",
        "Experian_Intelliscore__c",
        "Experian_Risk_Band__c",
        "Fitch_Category__c",
        "Fitch_Rating__c",
        "INS_FEIN_Tax_ID__c",
    ]

    def applies_to(self, archetype: PersonaArchetype) -> bool:
        return not archetype.is_person

    def derive(
        self,
        archetype: PersonaArchetype,
        record: dict,
        rng: Random,
    ) -> dict[str, Any]:
        out: dict[str, Any] = {}
        # Default to mid-range quality if archetype didn't compute one
        quality = archetype.business_credit_quality
        if quality is None:
            quality = 0.5

        # PAYDEX — positive
        paydex = _scale_positive(quality, 1, 100, rng)
        out["DNB_PAYDEX_Score__c"] = paydex

        # Delinquency — positive
        out["DNB_Delinquency_Score__c"] = _scale_positive(quality, 101, 670, rng)

        # Failure — INVERSE
        out["DNB_Failure_Score__c"] = _scale_inverse(quality, 1001, 1610, rng)

        # DNB Rating string
        out["DNB_Rating__c"] = _dnb_rating(quality, rng)

        # Equifax Credit Risk — positive
        out["Equifax_Credit_Risk_Score__c"] = _scale_positive(quality, 101, 992, rng)

        # Equifax Failure — INVERSE
        out["Equifax_Failure_Score_CR__c"] = _scale_inverse(quality, 1000, 1610, rng)

        # Equifax Payment Index — positive
        out["Equifax_Payment_Index__c"] = _scale_positive(quality, 0, 100, rng)

        # Experian Intelliscore + Risk Band
        intelliscore = _scale_positive(quality, 1, 100, rng)
        out["Experian_Intelliscore__c"] = intelliscore
        out["Experian_Risk_Band__c"] = _experian_risk_band(intelliscore)

        # Fitch Rating + Category
        rating, category = _fitch_from_quality(quality)
        out["Fitch_Rating__c"] = rating
        out["Fitch_Category__c"] = category

        # FEIN — synthetic 9-digit deterministic
        out["INS_FEIN_Tax_ID__c"] = _synth_fein(archetype.account_id)

        return out
