"""Phase 4d writability preflight.

Describes the target sObject once at startup and identifies fields that the
deriver layer wants to write but the platform won't accept on update — typically
formula fields, rollup-summary fields, system audit fields, and managed-package
fields with read-only access for the running user.

Returned set is consumed by the orchestrator to:
  1. Strip those columns from each row in `output_buffer` before CSV write
  2. Strip them from `registry.all_owned_fields()` for the manifest
  3. Log them to the manifest so operators see what was dropped

Discovered via `sf sobject describe --sobject Account --json`. Fields with
`updateable: false` AND `createable: false` are unwritable. Some fields are
`updateable: false` but `createable: true` (set-on-create only) — for backfill
which uses upsert against an existing record, those still can't be written, so
we treat both as unwritable.

See spec §6.2 row 'Schema drift — field renamed/removed' for the precedent.
"""
from __future__ import annotations

import logging
from typing import Iterable

logger = logging.getLogger(__name__)


def find_unwritable_fields(
    sf_runner,
    sobject: str,
    candidate_fields: Iterable[str],
) -> set[str]:
    """Return the subset of `candidate_fields` the platform won't accept on update.

    A field is considered unwritable if its describe metadata shows
    `updateable: false`. (Createable-only fields can't be set on upsert
    against an existing record either, so they're treated the same.)

    `candidate_fields` is the deriver-owned set; system fields like Id and
    External_ID__c that the orchestrator handles separately are not included.
    """
    candidates = set(candidate_fields)
    if not candidates:
        return set()

    try:
        payload = sf_runner.describe(sobject)
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "writability preflight skipped — describe failed for %s: %s",
            sobject, exc,
        )
        return set()

    fields = payload.get("fields") or payload.get("result", {}).get("fields") or []
    if not fields:
        logger.warning(
            "writability preflight skipped — describe payload had no `fields` "
            "for %s", sobject,
        )
        return set()

    unwritable: set[str] = set()
    for f in fields:
        name = f.get("name")
        if name in candidates and not f.get("updateable", True):
            unwritable.add(name)
    return unwritable
