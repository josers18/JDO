"""Deriver Protocol — the contract every deriver in Phase 4 implements.

See spec §4.3.
"""
from __future__ import annotations

from random import Random
from typing import Any, Protocol, runtime_checkable

from customer_hydration.derivers._archetype import PersonaArchetype


@runtime_checkable
class Deriver(Protocol):
    """A pure function that derives a subset of Account fields from an archetype.

    Implementations:
      - relationship.RelationshipDeriver
      - credit_personal.CreditPersonalDeriver
      - credit_bureau.CreditBureauDeriver
      - profile.ProfileDeriver
      - demographics.DemographicsDeriver
      - addresses.AddressesDeriver
      - contact.ContactDeriver
    """

    name: str
    fields: list[str]

    def applies_to(self, archetype: PersonaArchetype) -> bool:
        """Return False if this deriver shouldn't run for this archetype."""
        ...

    def derive(
        self,
        archetype: PersonaArchetype,
        record: dict,
        rng: Random,
    ) -> dict[str, Any]:
        """Return desired field values. Caller null-filters and upserts."""
        ...
