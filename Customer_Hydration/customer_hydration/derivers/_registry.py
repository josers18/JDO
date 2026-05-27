"""Deriver registry — enumerates derivers and runs them per record."""
from __future__ import annotations

from random import Random
from typing import Any

from customer_hydration.derivers._archetype import PersonaArchetype
from customer_hydration.derivers._base import Deriver


class Registry:
    """Holds an ordered list of derivers and runs them in registration order.

    Each deriver's output is merged into the candidates dict; later derivers
    can overwrite earlier values (rare; should not happen given disjoint
    field ownership).
    """

    def __init__(self) -> None:
        self.derivers: list[Deriver] = []

    def register(self, deriver: Deriver) -> None:
        self.derivers.append(deriver)

    def run(
        self,
        archetype: PersonaArchetype,
        record: dict,
        rng: Random,
    ) -> dict[str, Any]:
        """Run all applicable derivers and return merged candidates dict."""
        candidates: dict[str, Any] = {}
        for d in self.derivers:
            if d.applies_to(archetype):
                candidates.update(d.derive(archetype, record, rng))
        return candidates

    def all_owned_fields(self) -> list[str]:
        """Flat list of every field any registered deriver owns."""
        seen: set[str] = set()
        ordered: list[str] = []
        for d in self.derivers:
            for f in d.fields:
                if f not in seen:
                    seen.add(f)
                    ordered.append(f)
        return ordered
