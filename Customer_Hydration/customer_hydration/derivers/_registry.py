"""Deriver registry — enumerates derivers and runs them per record.

Plan 4d: per-deriver exception isolation. If a deriver raises during
applies_to() or derive(), the failure is logged to registry.errors and the
loop continues with the next deriver. The orchestrator surfaces these in
the manifest.
"""
from __future__ import annotations

import logging
import traceback
from random import Random
from typing import Any

from customer_hydration.derivers._archetype import PersonaArchetype
from customer_hydration.derivers._base import Deriver

logger = logging.getLogger(__name__)


class Registry:
    """Holds an ordered list of derivers and runs them in registration order.

    Each deriver's output is merged into the candidates dict; later derivers
    can overwrite earlier values (rare; should not happen given disjoint
    field ownership).

    Plan 4d: each call resets ``self.errors`` and accumulates one entry
    per deriver that raises during ``applies_to`` or ``derive``.
    """

    def __init__(self) -> None:
        self.derivers: list[Deriver] = []
        self.errors: list[dict] = []

    def register(self, deriver: Deriver) -> None:
        self.derivers.append(deriver)

    def run(
        self,
        archetype: PersonaArchetype,
        record: dict,
        rng: Random,
    ) -> dict[str, Any]:
        """Run all applicable derivers; return merged candidates dict.

        Resets ``self.errors`` at the start of each call. A deriver that
        raises is captured in ``self.errors`` and skipped — the loop
        continues with the next deriver.
        """
        self.errors = []
        candidates: dict[str, Any] = {}
        for d in self.derivers:
            try:
                if not d.applies_to(archetype):
                    continue
                candidates.update(d.derive(archetype, record, rng))
            except Exception as exc:  # noqa: BLE001
                self.errors.append({
                    "deriver": getattr(d, "name", repr(d)),
                    "account_id": archetype.account_id,
                    "exception": f"{type(exc).__name__}: {exc}",
                    "traceback": traceback.format_exc(),
                })
                logger.warning(
                    "Registry: deriver %r raised on account %s: %s",
                    getattr(d, "name", d), archetype.account_id, exc,
                )
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
