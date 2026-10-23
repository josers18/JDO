"""Stratified training-set sampler and label-mix gate."""
from collections import Counter
from datetime import datetime
from typing import Literal

from prodrec.business import business_profile
from prodrec.common import stable_rng
from prodrec.labels import business_scores, draw_label, personal_scores
from prodrec.personal import personal_profile
from prodrec.vocab import (
    BUSINESS_PRODUCTS, BUSINESS_TRAINING_COLUMNS, PERSONAL_PRODUCTS, PERSONAL_TRAINING_COLUMNS,
)


def _trn_side(side: str):
    if side == "business":
        return business_profile, business_scores, BUSINESS_PRODUCTS, BUSINESS_TRAINING_COLUMNS, "B"
    if side == "personal":
        return personal_profile, personal_scores, PERSONAL_PRODUCTS, PERSONAL_TRAINING_COLUMNS, "P"
    raise ValueError(f"unknown side: {side!r}")


def build_training_set(
    population: list[tuple[dict, dict]],
    side: Literal["business", "personal"],
    run_ts: datetime,
    size: int,
    floor: int = 100,
) -> list[dict]:
    profile_fn, scores_fn, products, columns, prefix = _trn_side(side)
    if not population:
        raise ValueError("empty population")
    if size < 1:
        raise ValueError("size must be >= 1")
    month = f"{run_ts:%Y-%m}"

    pool_rng = stable_rng(f"pool|{month}", side + "_training")
    pool: list[tuple[dict, str]] = []
    for i in range(3 * size):
        anchor, feats = population[pool_rng.randrange(len(population))]
        key = f"{anchor['ACCOUNT_ID']}#T{i}"
        profile = profile_fn(anchor, feats, run_ts, key=key)
        label = draw_label(scores_fn(profile), stable_rng(f"{key}|{month}", side + "_label"))
        pool.append((profile, label))

    taken: set[int] = set()
    for cls in products:
        n = 0
        for idx, (_, label) in enumerate(pool):
            if n >= floor or len(taken) >= size:
                break
            if label == cls and idx not in taken:
                taken.add(idx)
                n += 1
    for idx in range(len(pool)):
        if len(taken) >= size:
            break
        taken.add(idx)

    chosen = [pool[i] for i in sorted(taken)]
    stable_rng(f"shuffle|{month}", side + "_training").shuffle(chosen)

    rows = []
    for n, (profile, label) in enumerate(chosen, start=1):
        row = dict(profile)
        row["RECOMMENDED_PRODUCT"] = label
        row["ACCOUNTID"] = f"{prefix}-{n:06d}"
        rows.append({c: row[c] for c in columns})
    return rows


def mix_problems(
    labels: list[str],
    max_share: float = 0.40,
    min_classes: int = 8,
    floor: int | None = None,
) -> list[str]:
    counts = Counter(labels)
    total = len(labels)
    problems = []
    for cls, n in sorted(counts.items()):
        if total and n / total > max_share:
            problems.append(f"max share exceeded: {cls} is {n / total:.1%} (limit {max_share:.0%})")
    if len(counts) < min_classes:
        problems.append(f"classes: only {len(counts)} distinct (need at least {min_classes})")
    if floor is not None:
        for cls, n in sorted(counts.items()):
            if n < floor:
                problems.append(f"floor not met: {cls} has {n} rows (need at least {floor})")
    return problems
