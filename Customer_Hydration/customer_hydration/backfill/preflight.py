"""Phase 4d preflight checks — writability + picklist value drift.

Two preflight passes run once at orchestrator startup, both reading from
`sf sobject describe --sobject Account --json`:

1. **Writability** (`find_unwritable_fields`) — fields the platform won't
   accept on update (formula, rollup-summary, system audit, managed-package
   read-only). The orchestrator drops these from each row's delta.

2. **Picklist drift** (`find_picklist_drift`, `filter_picklist_yaml_to_org`)
   — values declared in `config/backfill_picklists.yaml` that the org's
   restricted picklist won't accept (AGENTS.md note 6: FSC picklists are
   restrictive). The orchestrator filters the in-memory YAML so derivers
   call `weighted_pick` over the org-accepted subset only. If a field's
   YAML and org sets disjoint, log the field and let derivers fall back.

See spec §6.1 (rc=4 SCHEMA_PICKLIST_DRIFT) and §6.2.
"""
from __future__ import annotations

import logging
from typing import Iterable

logger = logging.getLogger(__name__)


def _extract_fields(payload: dict) -> list[dict]:
    """Pull the fields list out of an `sf sobject describe` payload, handling
    both the bare and the {"result": {...}} wrapper forms."""
    return payload.get("fields") or payload.get("result", {}).get("fields") or []


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

    fields = _extract_fields(payload)
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


def _picklist_values_from_describe(payload: dict) -> dict[str, set[str]]:
    """Map field name → set of accepted picklist values from a describe payload.

    Only fields with type 'picklist' or 'multipicklist' are included.
    """
    values_by_field: dict[str, set[str]] = {}
    for f in _extract_fields(payload):
        if f.get("type") not in ("picklist", "multipicklist"):
            continue
        name = f.get("name")
        if not name:
            continue
        accepted = {
            v.get("value") for v in (f.get("picklistValues") or [])
            if v.get("active", True) and v.get("value")
        }
        if accepted:
            values_by_field[name] = accepted
    return values_by_field


def find_picklist_drift(
    sf_runner,
    sobject: str,
    yaml_dict: dict[str, dict],
) -> dict[str, dict]:
    """Compare YAML picklist values to the org's actual picklist values.

    Returns a dict keyed by field name with two lists per entry:
      ``invalid`` — values in YAML the org rejects (need to be filtered out)
      ``missing`` — values in the org not in YAML (informational only)

    Only fields present in BOTH the YAML and the describe payload are reported.
    Fields whose describe entry is missing (e.g., custom field not yet on the
    org) are silently skipped — caller falls back to YAML defaults.
    """
    if not yaml_dict:
        return {}

    try:
        payload = sf_runner.describe(sobject)
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "picklist preflight skipped — describe failed for %s: %s",
            sobject, exc,
        )
        return {}

    org_values = _picklist_values_from_describe(payload)
    if not org_values:
        logger.warning(
            "picklist preflight skipped — describe returned no picklist fields "
            "for %s", sobject,
        )
        return {}

    drift: dict[str, dict] = {}
    for field, entry in yaml_dict.items():
        if field not in org_values:
            continue
        yaml_values = set(entry.get("values") or [])
        org_set = org_values[field]
        invalid = yaml_values - org_set
        missing = org_set - yaml_values
        if invalid or missing:
            drift[field] = {
                "invalid": sorted(invalid),
                "missing": sorted(missing),
            }
    return drift


def filter_picklist_yaml_to_org(
    yaml_dict: dict[str, dict],
    drift: dict[str, dict],
) -> dict[str, dict]:
    """Return a deep-copied YAML dict with `invalid` values removed from each
    drifted field's values+weights lists.

    Fields where every YAML value is rejected (filtered list is empty) are
    omitted from the return so callers (`load_picklist_yaml`) get None and
    fall back to deriver-internal defaults.
    """
    filtered: dict[str, dict] = {}
    for field, entry in yaml_dict.items():
        invalid = set(drift.get(field, {}).get("invalid", []))
        if not invalid:
            # No drift for this field — copy through unchanged
            filtered[field] = {
                "values": list(entry.get("values") or []),
                "weights": list(entry.get("weights") or []),
            }
            continue
        # Filter out invalid values, keeping weight order
        keep_values: list[str] = []
        keep_weights: list[float] = []
        for v, w in zip(entry.get("values") or [], entry.get("weights") or []):
            if v not in invalid:
                keep_values.append(v)
                keep_weights.append(w)
        if keep_values:
            filtered[field] = {"values": keep_values, "weights": keep_weights}
        else:
            logger.warning(
                "picklist preflight: every value in YAML for %s rejected by org "
                "(%s) — field will fall back to deriver defaults",
                field, sorted(invalid),
            )
    return filtered


def install_picklist_overrides(filtered_yaml: dict[str, dict]) -> None:
    """Patch the cached `_load_picklist_yaml` result so all derivers see the
    org-filtered values via their existing `load_picklist_yaml(field)` calls.

    The cache is process-local; the orchestrator calls this once at startup
    after preflight. Idempotent — calling twice with different args replaces
    the previous override.
    """
    from customer_hydration.derivers import _helpers
    # Clear the lru_cache, then monkey-patch its underlying function so the
    # next call returns our filtered dict.
    _helpers._load_picklist_yaml.cache_clear()
    # Override by replacing the function's behaviour: simplest is to install
    # a sentinel attribute checked by load_picklist_yaml. Cleaner: replace
    # the public load_picklist_yaml's reader.
    _helpers._PICKLIST_OVERRIDE = filtered_yaml  # type: ignore[attr-defined]
