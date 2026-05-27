"""Production-org guardrail (spec §6.2).

KNOWN_PRODUCTION_ORG_IDS is a frozenset of 15-char SF org ids that the
package considers production. Any caller running against one of these MUST
pass --allow-production. The list is empty by default — operators add their
own org ids here as the package is deployed across organizations.

The 18-char id form is normalized to 15 chars by truncation (the last 3
chars are a checksum and don't change membership semantics).
"""
from __future__ import annotations


# Operators: add 15-char SF org ids here that should be considered production.
# Empty by default — JDO's demo orgs (jdo-uqj0jr, jdo-fw51xz) are sandboxes
# and never need to be on this list.
KNOWN_PRODUCTION_ORG_IDS: frozenset[str] = frozenset()


def _normalize_org_id(org_id: str) -> str:
    """Trim 18-char ids down to 15 (the last 3 chars are a case-folding checksum)."""
    return org_id[:15]


def is_production_org(org_id: str) -> bool:
    """Return True if org_id matches a known production org."""
    return _normalize_org_id(org_id) in KNOWN_PRODUCTION_ORG_IDS


def enforce_production_guard(org_id: str, *, allow_production: bool) -> None:
    """Raise PermissionError if org is prod and allow_production is False.

    Caller (the orchestrator) catches PermissionError and exits with rc=5.
    """
    if is_production_org(org_id) and not allow_production:
        raise PermissionError(
            f"Org {org_id} is on the known-production list. "
            f"Pass --allow-production to override."
        )
