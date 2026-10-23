"""Per-row and cross-table gates for the three input tables."""
from __future__ import annotations

from attrcsat.vocab import (
    ATTRITION_COLUMNS, BOOL_COLUMNS, CATEGORIES, CSAT_COLUMNS, ENROLLMENT_COLUMNS, RANGES,
)

_CK_TABLES = {
    "ATTRITION": (ATTRITION_COLUMNS, "UNIQUEID", {}),
    "CSAT": (CSAT_COLUMNS, "ACCOUNTID", {"CROSS_SELL_SCORE": "CSAT.CROSS_SELL_SCORE"}),
    "ENROLLMENTS": (ENROLLMENT_COLUMNS, "ACCOUNTID",
                    {"CROSS_SELL_SCORE": "ENR.CROSS_SELL_SCORE", "SAVINGS_RATE": "ENR.SAVINGS_RATE"}),
}
_CK_ATT_TOL = 0.17
_CK_CSAT_TOL = 0.12


def row_problems(table: str, row: dict) -> list[str]:
    """Violations for one row (empty = pass): columns, NULLs, key prefix, vocabulary, ranges, booleans."""
    columns, key, range_keys = _CK_TABLES[table]
    rid = str(row.get(key))
    out: list[str] = []
    if tuple(row) != columns:
        out.append(f"{rid}: {table} columns differ from contract")
    for c in columns:
        v = row.get(c)
        if v is None:
            out.append(f"{rid}: {c} is NULL")
            continue
        if c in CATEGORIES and v not in CATEGORIES[c]:
            out.append(f"{rid}: {c}={v!r} outside vocabulary")
        if c in BOOL_COLUMNS and not isinstance(v, bool):
            out.append(f"{rid}: {c} is not a boolean")
        rng = RANGES.get(range_keys.get(c, c))
        if rng is not None and c not in CATEGORIES:
            if isinstance(v, bool) or not isinstance(v, (int, float)) or not (rng[0] <= v <= rng[1]):
                out.append(f"{rid}: {c}={v!r} outside [{rng[0]}, {rng[1]}]")
    if not rid.startswith("001am"):
        out.append(f"{rid}: {key} does not start with 001am")
    return out


def cross_table_problems(att: list, csat: list, enr: list) -> list[str]:
    """Agreement between the three tables for the same customer (lists aligned by account)."""
    if not (len(att) == len(csat) == len(enr)):
        return [f"table length mismatch: {len(att)}/{len(csat)}/{len(enr)}"]
    out: list[str] = []
    for a, c, e in zip(att, csat, enr):
        aid = e["ACCOUNTID"]
        if not (a["UNIQUEID"] == c["ACCOUNTID"] == aid):
            out.append(f"{aid}: account ids differ across tables")
            continue
        for col, flag in (("ONLINE_BANKING_C", "ONLINE_ENROLLED"), ("MOBILE_BANKING_C", "MOBILE_ENROLLED")):
            if (a[col] == "Yes") != bool(e[flag]):
                out.append(f"{aid}: {col}={a[col]} disagrees with {flag}={e[flag]}")
        enr_x = (e["CROSS_SELL_SCORE"] - 1) / 9
        if abs((a["CROSS_SELL_SCORE_C"] - 1) / 6 - enr_x) > _CK_ATT_TOL:
            out.append(f"{aid}: attrition cross-sell disagrees with enrollment")
        if abs(c["CROSS_SELL_SCORE"] / 100 - enr_x) > _CK_CSAT_TOL:
            out.append(f"{aid}: CSAT cross-sell disagrees with enrollment")
    return out
