"""Shared helpers for derivers — seeded RNG, weighted pickers, value-band utilities."""
from __future__ import annotations

import functools
import hashlib
import random
from pathlib import Path
from typing import Sequence

import yaml


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


def income_band(annual_income: float | None) -> str:
    """Return income band name from AnnualIncome.

    Bands per spec §4.1:
      entry    < $50k
      middle   < $150k
      affluent < $400k
      hnw      < $1M
      uhnw     ≥ $1M
    Missing income falls back to 'entry' (most conservative).
    """
    if annual_income is None:
        return "entry"
    if annual_income < 50_000:
        return "entry"
    if annual_income < 150_000:
        return "middle"
    if annual_income < 400_000:
        return "affluent"
    if annual_income < 1_000_000:
        return "hnw"
    return "uhnw"


def business_size(annual_revenue: float | None) -> str:
    """Return business size band from AnnualRevenue.

    Bands per spec §4.1:
      micro      < $1M
      small      < $10M
      mid        < $100M
      large      < $1B
      enterprise ≥ $1B
    """
    if annual_revenue is None:
        return "micro"
    if annual_revenue < 1_000_000:
        return "micro"
    if annual_revenue < 10_000_000:
        return "small"
    if annual_revenue < 100_000_000:
        return "mid"
    if annual_revenue < 1_000_000_000:
        return "large"
    return "enterprise"


_BACKFILL_PICKLIST_PATH = (
    Path(__file__).resolve().parents[2] / "config" / "backfill_picklists.yaml"
)


@functools.lru_cache(maxsize=1)
def _load_picklist_yaml() -> dict[str, dict]:
    """Cache the YAML once per process."""
    if not _BACKFILL_PICKLIST_PATH.exists():
        return {}
    with _BACKFILL_PICKLIST_PATH.open() as fh:
        data = yaml.safe_load(fh) or {}
    return data


def load_picklist_yaml(field_name: str) -> dict | None:
    """Return {'values': [...], 'weights': [...]} for a picklist field, or None."""
    return _load_picklist_yaml().get(field_name)
