"""Deterministic RECORD_ID generation for Cumulus enrichment tables.

Every enrichment row gets a stable UUID-formatted identifier derived from its
composite PK columns.  The formula is intentionally reproducible in SQL so
existing rows can be backfilled without the Python runtime:

    Python:  record_id_for(org_id, account_id, profile_month)
    SQL:     REGEXP_REPLACE(
               LEFT(SHA2(CONCAT_WS('|', ORG_ID, ACCOUNT_ID, PROFILE_MONTH, 'record_id'), 256), 32),
               '(.{8})(.{4})(.{4})(.{4})(.{12})',
               '\\1-\\2-\\3-\\4-\\5')
"""
from __future__ import annotations

import hashlib


def record_id_for(*pk_values: object) -> str:
    """Return a deterministic UUID-formatted string from PK column values.

    Args:
        *pk_values: The composite-PK column values in declaration order.
                    Each is stringified via str().

    Returns:
        A lowercase 36-char UUID string (8-4-4-4-12 hex with dashes).
    """
    payload = "|".join(str(v) for v in pk_values) + "|record_id"
    hex32 = hashlib.sha256(payload.encode("utf-8")).hexdigest()[:32]
    return f"{hex32[:8]}-{hex32[8:12]}-{hex32[12:16]}-{hex32[16:20]}-{hex32[20:32]}"
