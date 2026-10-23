"""Seeded RNG helpers and defensive coercion shared by every prodrec module."""
from __future__ import annotations

import math
import random
from datetime import date, datetime

from cumulus_common.seed import seed_for


def stable_rng(key: str, salt: str) -> random.Random:
    """Month-independent RNG: categoricals and base values come from it."""
    return random.Random(seed_for(key, salt, datetime(2026, 1, 1)))


def month_rng(key: str, salt: str, run_ts: datetime) -> random.Random:
    """Per-month RNG: only used for month-to-month drift."""
    return random.Random(seed_for(key, salt + "|month", run_ts))


def jitter(value: float, rng: random.Random, pct: float = 0.03) -> float:
    """value * (1 + U(-pct, pct)); the only month-to-month drift on generated values."""
    return value * (1 + rng.uniform(-pct, pct))


def clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def as_float(v) -> float | None:
    """None/''/non-numeric/NaN -> None; Decimal/int/float/numeric str -> float."""
    if v is None or isinstance(v, bool):
        return None
    if isinstance(v, str):
        v = v.strip()
        if not v:
            return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(f) or math.isinf(f) else f


def as_date(v) -> date | None:
    """date/datetime/ISO 'YYYY-MM-DD...' str -> date; anything else -> None."""
    if v is None:
        return None
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    if isinstance(v, str):
        s = v.strip()[:10]
        try:
            return date.fromisoformat(s)
        except ValueError:
            return None
    return None


def allocate_flags(rates: dict, draws: dict, seeded: dict, target) -> dict:
    """0/1 product flags. `seeded` flags (from real feeds) are kept. Without a real product count the
    rest are drawn at their rates (draws[f] < rate). With one, exactly clamp(target) - sum(seeded) of the
    rest are 1, picked by Efraimidis-Spirakis order (draws[f] ** (1/rate)) so likelier products go first."""
    free = [f for f in rates if f not in seeded]
    flags = {f: int(seeded[f]) for f in rates if f in seeded}
    n = as_float(target)
    if n is None:
        flags.update({f: int(draws[f] < rates[f]) for f in free})
    else:
        on = sum(flags.values())
        k = int(clamp(int(n), on, on + len(free))) - on
        ranked = sorted(free, key=lambda f: draws[f] ** (1.0 / rates[f]), reverse=True)
        flags.update({f: int(f in ranked[:k]) for f in free})
    return {f: flags[f] for f in rates}
