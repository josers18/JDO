"""Phase 4d hotfix: post-derive value translation for org-restricted picklists.

Derivers produce spec-defined values (e.g., `Tier="Diamond"`), but the org's
restricted picklist may accept a different vocabulary (e.g., `Tier` expects
`A`/`B`/`C`). Rather than re-engineer every deriver to know the org's exact
picklist, we translate values *after* derivation, just before CSV write.

Same precedent as `customer_hydration/fieldmap.py` for field NAMES — this is
the same pattern for field VALUES. The mapping lives in
`config/account_value_translator.yaml` and is keyed by field name. Values
not in the mapping pass through unchanged.

A future enhancement would auto-generate this YAML from a per-org picklist
audit (`python hydrate.py audit-picklists`); for v1 it's hand-curated from
discoveries during the live-run iteration.
"""
from __future__ import annotations

import functools
import logging
from pathlib import Path
from typing import Any

import yaml

logger = logging.getLogger(__name__)


_VALUE_TRANSLATOR_PATH = (
    Path(__file__).resolve().parents[2]
    / "config"
    / "account_value_translator.yaml"
)


@functools.lru_cache(maxsize=1)
def _load_translator_yaml() -> dict[str, dict[str, str]]:
    """Cache the translator YAML once per process. Returns empty on missing file."""
    if not _VALUE_TRANSLATOR_PATH.exists():
        return {}
    with _VALUE_TRANSLATOR_PATH.open() as fh:
        data = yaml.safe_load(fh) or {}
    return data


def translate_delta(delta: dict[str, Any]) -> dict[str, Any]:
    """Apply YAML-driven value translations to a delta dict.

    For each (field, value) pair in delta where the YAML has a mapping for
    that field AND that value, replace the value. All other entries pass
    through unchanged.

    The function is pure — it returns a new dict and does not mutate `delta`.
    """
    rules = _load_translator_yaml()
    if not rules:
        return dict(delta)

    out: dict[str, Any] = {}
    for field, value in delta.items():
        field_rules = rules.get(field)
        if field_rules is None:
            out[field] = value
            continue
        # Only translate string keys; leave numeric/None values alone.
        if isinstance(value, str) and value in field_rules:
            translated = field_rules[value]
            if translated is None:
                # Explicit drop — caller skips this field
                continue
            out[field] = translated
        else:
            out[field] = value
    return out


def translation_summary() -> dict[str, list[str]]:
    """Return {field: list of source values that have translations} — used by
    the orchestrator's manifest to surface which fields are subject to value
    translation in this run.
    """
    rules = _load_translator_yaml()
    return {field: sorted(mapping.keys()) for field, mapping in rules.items()}
