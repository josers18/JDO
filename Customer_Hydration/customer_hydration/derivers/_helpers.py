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


def weighted_pick(rng: random.Random, values: Sequence[str], weights: Sequence[float]) -> str:
    """Pick one value from `values` with probability proportional to `weights`.

    Both lists must be the same length and non-empty. Weights need not sum to 1.0;
    they're normalized internally.
    """
    if not values or not weights:
        raise ValueError("weighted_pick requires non-empty values and weights")
    if len(values) != len(weights):
        raise ValueError(
            f"weighted_pick: values has {len(values)} items but weights has {len(weights)}"
        )
    return rng.choices(list(values), weights=list(weights), k=1)[0]
