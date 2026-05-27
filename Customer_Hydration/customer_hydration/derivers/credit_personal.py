"""credit_personal deriver — FinServ__CreditScore__c + CreditRating.

Person accounts only. See spec §4.2 rules 2, 3.
"""
from __future__ import annotations

from random import Random
from typing import Any

from customer_hydration.derivers._archetype import PersonaArchetype
from customer_hydration.derivers._pairs import read_paired_value


# Rule 2 — score distribution by income band (mean, std)
_SCORE_DIST_BY_BAND: dict[str, tuple[float, float]] = {
    "entry":    (580, 60),
    "middle":   (680, 50),
    "affluent": (740, 40),
    "hnw":      (790, 30),
    "uhnw":     (810, 20),
}


# Rule 3 — rating bucket boundaries
_RATING_BANDS: list[tuple[int, str]] = [
    (580, "Poor"),
    (670, "Fair"),
    (740, "Good"),
    (800, "Very Good"),
    (850, "Excellent"),
]


def _rating_from_score(score: int) -> str:
    """Bucket a numeric FICO score into one of five rating bands.

    <580 Poor, <670 Fair, <740 Good, <800 Very Good, ≥800 Excellent.
    """
    for upper, name in _RATING_BANDS:
        if score < upper:
            return name
    return "Excellent"


def _score_from_rating(rating: str, rng: Random) -> int:
    """Return a score consistent with a given rating (band median ± small jitter)."""
    band_lower = {
        "Poor":      (300, 580),
        "Fair":      (580, 670),
        "Good":      (670, 740),
        "Very Good": (740, 800),
        "Excellent": (800, 851),
    }
    lo, hi = band_lower.get(rating, (670, 740))
    # Median of band; rng allows ±10 jitter while staying inside band
    median = (lo + hi) // 2
    jitter = rng.randint(-10, 10)
    return max(lo, min(hi - 1, median + jitter))


class CreditPersonalDeriver:
    """Owns FICO + rating for person accounts. See spec §4.4 row 'credit_personal.py'."""

    name = "credit_personal"
    fields = ["FinServ__CreditScore__c", "FinServ__CreditRating__c"]

    def applies_to(self, archetype: PersonaArchetype) -> bool:
        return archetype.is_person

    def derive(
        self,
        archetype: PersonaArchetype,
        record: dict,
        rng: Random,
    ) -> dict[str, Any]:
        out: dict[str, Any] = {}

        # Paired-field check — if either side is already populated, derive the
        # partner from it deterministically (rule 3).
        existing = read_paired_value(record, "FinServ__CreditScore__c")
        if existing is not None:
            populated_field, populated_value = existing
            if populated_field == "FinServ__CreditScore__c":
                out["FinServ__CreditRating__c"] = _rating_from_score(int(populated_value))
            else:
                out["FinServ__CreditScore__c"] = _score_from_rating(populated_value, rng)
            return out

        # Both null — synth a score from the income-band distribution (rule 2)
        mean, std = _SCORE_DIST_BY_BAND.get(archetype.income_band, (680, 50))
        score = int(round(rng.gauss(mean, std)))
        score = max(300, min(850, score))
        out["FinServ__CreditScore__c"] = score
        out["FinServ__CreditRating__c"] = _rating_from_score(score)

        return out
