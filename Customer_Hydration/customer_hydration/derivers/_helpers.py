"""Shared helpers for derivers — seeded RNG, weighted pickers, value-band utilities."""
from __future__ import annotations

import hashlib
import random
from typing import Sequence


def seeded_rng(account_id: str) -> random.Random:
    """Return a Random instance seeded deterministically from account_id.

    Uses sha256 of the account_id to produce a stable seed so the same input
    yields the same RNG sequence across runs and processes.
    """
    digest = hashlib.sha256(account_id.encode("utf-8")).digest()
    seed = int.from_bytes(digest[:8], "big")
    return random.Random(seed)
