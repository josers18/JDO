"""Deterministic per-row seed for Cumulus generators.

The single source of pseudorandom-but-deterministic seeds: every generator
calls `seed_for(account_id, dataset_salt, run_ts)` to get a 32-byte SHA-256
digest. Use the bytes as input to `random.Random(seed)` or directly with
`int.from_bytes` to derive deterministic field values.

Per-dataset salts make each dataset's distribution independent — without
them, two datasets seeded only by ACCOUNT_ID produce correlated random
draws (the same accounts skewing the same direction in every dataset).

Bucketing on year-month means a monthly generator re-run mid-month produces
the same row as the original run — idempotency by construction.
"""
from __future__ import annotations

import hashlib
from datetime import datetime


def seed_for(account_id: str, dataset_salt: str, run_ts: datetime) -> bytes:
    """Return the deterministic 32-byte seed for one (account, dataset, month).

    Args:
        account_id: The Salesforce Account ID, non-empty.
        dataset_salt: Per-dataset salt, e.g. ``"claritas"``, ``"dnb"``. Non-empty.
        run_ts: The execution timestamp; only year/month are used.

    Returns:
        A 32-byte SHA-256 digest. Stable across processes, machines, Python versions.

    Raises:
        ValueError: if ``account_id`` or ``dataset_salt`` is empty.
    """
    if not account_id:
        raise ValueError("account_id must be non-empty")
    if not dataset_salt:
        raise ValueError("dataset_salt must be non-empty")

    key = f"{account_id}|{dataset_salt}|{run_ts:%Y-%m}"
    return hashlib.sha256(key.encode("utf-8")).digest()
