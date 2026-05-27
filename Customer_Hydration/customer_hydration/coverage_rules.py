"""Coverage rules engine — fills partial-field gaps after the deriver pass.

See spec §4.5. Each rule is a dict from `config/coverage_rules.yaml` with:
  field          — the CRM field name
  expected_when  — predicate(s) the record/archetype must satisfy
  ignore_when    — predicate(s) that, if any matches, skip the rule
  fill_with      — dotted name of a deriver function (deriver.method_name)

The engine resolves `fill_with` by looking up the named method on the matching
deriver in the registry. If the function isn't found, the rule is logged and
skipped — never crashes the run.
"""
from __future__ import annotations

import functools
import logging
from pathlib import Path
from random import Random
from typing import Any

import yaml

from customer_hydration.derivers._archetype import PersonaArchetype
from customer_hydration.derivers._registry import Registry

logger = logging.getLogger(__name__)


_COVERAGE_RULES_PATH = Path(__file__).resolve().parents[1] / "config" / "coverage_rules.yaml"


@functools.lru_cache(maxsize=1)
def load_coverage_rules() -> list[dict]:
    """Load coverage_rules.yaml. Cached once per process."""
    if not _COVERAGE_RULES_PATH.exists():
        return []
    with _COVERAGE_RULES_PATH.open() as fh:
        data = yaml.safe_load(fh) or []
    return list(data)


def _matches_predicate(
    archetype: PersonaArchetype,
    record: dict,
    predicate: dict,
) -> bool:
    """Return True if the given predicate dict matches the archetype/record."""
    if "record_type_in" in predicate:
        if archetype.record_type not in predicate["record_type_in"]:
            return False
    if "record_type_not_in" in predicate:
        if archetype.record_type in predicate["record_type_not_in"]:
            return False
    if "is_person_account" in predicate:
        if archetype.is_person != bool(predicate["is_person_account"]):
            return False
    if "persona_in" in predicate:
        if archetype.persona not in predicate["persona_in"]:
            return False
    return True


def _resolve_fill_function(rule: dict, registry: Registry):
    """Resolve a `fill_with: 'deriver_name.method_name'` string to a callable.

    Returns None if the method or deriver isn't found.
    """
    fill_with = rule.get("fill_with")
    if not fill_with or "." not in fill_with:
        return None
    deriver_name, method_name = fill_with.split(".", 1)
    for d in registry.derivers:
        if d.name == deriver_name:
            return getattr(d, method_name, None)
    return None


def _apply_with_rules(
    rules: list[dict],
    archetype: PersonaArchetype,
    record: dict,
    delta: dict,
    registry: Registry,
    rng: Random,
) -> None:
    """Apply a list of coverage rules to the running delta dict in place."""
    for rule in rules:
        field = rule.get("field")
        if not field:
            continue

        # Skip if delta or record already has the field populated
        if field in delta:
            continue
        if record.get(field) is not None:
            continue

        # Evaluate expected_when (must match)
        expected = rule.get("expected_when") or {}
        if expected and not _matches_predicate(archetype, record, expected):
            continue

        # Evaluate ignore_when (must NOT match)
        ignore = rule.get("ignore_when") or {}
        if ignore and _matches_predicate(archetype, record, ignore):
            continue

        # Resolve fill_with and call it
        fill_fn = _resolve_fill_function(rule, registry)
        if fill_fn is None:
            logger.warning(
                "coverage_rules: fill_with %r not found; skipping field %s",
                rule.get("fill_with"), field,
            )
            continue

        try:
            value = fill_fn(archetype, record, rng)
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "coverage_rules: fill_with %r raised %r; skipping field %s",
                rule.get("fill_with"), exc, field,
            )
            continue

        if value is not None:
            delta[field] = value


def apply_coverage_rules(
    archetype: PersonaArchetype,
    record: dict,
    delta: dict,
    registry: Registry,
    rng: Random,
) -> None:
    """Apply all configured coverage rules to the running delta in place."""
    _apply_with_rules(
        load_coverage_rules(), archetype, record, delta, registry, rng
    )
