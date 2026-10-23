"""Enrollment row factory and its consistency gate.

Each flag is a sticky draw (stable_rng, no month) so an account keeps its profile from month to
month; a small per-month drift (month_rng) flips a flag now and then. MFA always implies digital.
"""
from __future__ import annotations

from datetime import datetime

from attrcsat.common import clamp, month_rng, stable_rng
from attrcsat.vocab import BOOL_COLUMNS, CATEGORIES, ENROLLMENT_COLUMNS, RANGES

_EN_DRIFT_P = 0.02
_EN_LOW_WIRE_P = 0.10  # cohorts below this base rate only drift toward False
_EN_REVIEW_STATUS = ("Under Review", "Pending")
_EN_REVIEW_KYC_CLEAN = ("Current", "Expired")
_EN_REVIEW_AML_CLEAN = ("Cleared", "None")


def _en_draw(aid: str, flag: str) -> float:
    return stable_rng(aid, "attrcsat-enr-" + flag).random()


def _en_drift(aid: str, flag: str, run_ts: datetime) -> bool:
    return month_rng(aid, "attrcsat-drift-" + flag, run_ts).random() < _EN_DRIFT_P


def _en_wire_p(p: dict) -> float:
    if p["kind"] == "BUSINESS":
        base = 0.6
    elif p["kind"] == "HOUSEHOLD":
        base = 0.15
    elif p["client_category"] == "WealthManagement":
        base = 0.35
    else:
        base = 0.03
    if p["total_balance"] >= 250000:
        base += 0.1
    return base


def _en_status(aid: str, salt: str, options: tuple, weights: tuple) -> str:
    u = stable_rng(aid, "attrcsat-enr-" + salt).random()
    acc = 0.0
    for opt, w in zip(options, weights):
        acc += w
        if u < acc:
            return opt
    return options[-1]


def _en_kyc_aml(p: dict) -> tuple[str, str]:
    aid = p["account_id"]
    if p["risk"] == "REVIEW":
        return (_en_status(aid, "kyc", _EN_REVIEW_STATUS, (0.5, 0.5)),
                _en_status(aid, "aml", _EN_REVIEW_STATUS, (0.5, 0.5)))
    if p["risk"] == "WATCH":
        return (_en_status(aid, "kyc", ("Current", "Pending"), (0.7, 0.3)),
                _en_status(aid, "aml", ("Cleared", "Pending"), (0.6, 0.4)))
    return (_en_status(aid, "kyc", ("Expired", "Current"), (0.05, 0.95)),
            _en_status(aid, "aml", ("None", "Cleared"), (0.03, 0.97)))


def enrollment_row(profile: dict, run_ts: datetime) -> dict:
    aid = profile["account_id"]
    aff = profile["digital_affinity"]
    online_p = clamp(0.55 + 0.35 * aff + (0.1 if profile["kind"] == "BUSINESS" else 0.0), 0.0, 1.0)
    mobile_p = clamp(0.15 + 0.75 * aff, 0.0, 1.0)

    def flip(col: str, value: bool) -> bool:
        return (not value) if _en_drift(aid, col, run_ts) else value

    online = flip("ONLINE_ENROLLED", _en_draw(aid, "online") < online_p)
    mobile = flip("MOBILE_ENROLLED", _en_draw(aid, "mobile") < mobile_p)
    digital = online or mobile
    # same sticky uniform, threshold follows the final digital state, then a small drift
    mfa = flip("MFA_STATUS", _en_draw(aid, "mfa") < 0.85) and digital
    paperless = flip("PAPERLESS_ENROLLED", _en_draw(aid, "paperless") < (0.6 if digital else 0.05))
    alerts = flip("ALERT_ENROLLED", _en_draw(aid, "alerts") < (0.65 if digital else 0.05))
    wire_p = _en_wire_p(profile)
    wire = _en_draw(aid, "wire") < wire_p
    if _en_drift(aid, "WIRE_ENABLED", run_ts):
        # low-wire cohorts only drift toward off, so their rate stays within the calibrated cap
        wire = False if wire_p < _EN_LOW_WIRE_P else not wire
    flags = {
        "ONLINE_ENROLLED": online, "MOBILE_ENROLLED": mobile, "MFA_STATUS": mfa,
        "PAPERLESS_ENROLLED": paperless, "ALERT_ENROLLED": alerts, "WIRE_ENABLED": wire,
    }

    kyc, aml = _en_kyc_aml(profile)
    row = {
        "ACCOUNTID": aid,
        "MOBILE_ENROLLED": flags["MOBILE_ENROLLED"],
        "ONLINE_ENROLLED": flags["ONLINE_ENROLLED"],
        "KYC_STATUS": kyc,
        "MFA_STATUS": flags["MFA_STATUS"],
        "PAPERLESS_ENROLLED": flags["PAPERLESS_ENROLLED"],
        "ALERT_ENROLLED": flags["ALERT_ENROLLED"],
        "WIRE_ENABLED": flags["WIRE_ENABLED"],
        "SAVINGS_RATE": round(clamp(profile["savings_rate"], 0.0, 0.40), 2),
        "CROSS_SELL_SCORE": 1 + round(9 * profile["cross_sell"]),
        "AML_STATUS": aml,
        "SNAPSHOT_DATE": f"{run_ts:%Y-%m}-01 00:00:00",
    }
    return {c: row[c] for c in ENROLLMENT_COLUMNS}


def enrollment_problems(rows: list[dict], profiles: list[dict]) -> list[str]:
    """Human-readable violations (empty = pass). rows and profiles are parallel lists."""
    out: list[str] = []
    if len(rows) != len(profiles):
        return [f"row/profile length mismatch: {len(rows)} vs {len(profiles)}"]
    for r, p in zip(rows, profiles):
        aid = str(r.get("ACCOUNTID"))
        if tuple(r) != ENROLLMENT_COLUMNS:
            out.append(f"{aid}: columns differ from ENROLLMENT_COLUMNS")
        for c in ENROLLMENT_COLUMNS:
            if r.get(c) is None:
                out.append(f"{aid}: {c} is NULL")
        if not aid.startswith("001am"):
            out.append(f"{aid}: ACCOUNTID does not start with 001am")
        for c in BOOL_COLUMNS:
            if r.get(c) is not None and not isinstance(r[c], bool):
                out.append(f"{aid}: {c} is not a boolean")
        for c in ("KYC_STATUS", "AML_STATUS"):
            if r.get(c) is not None and r[c] not in CATEGORIES[c]:
                out.append(f"{aid}: {c}={r[c]!r} outside vocabulary")
        for c, key in (("SAVINGS_RATE", "ENR.SAVINGS_RATE"), ("CROSS_SELL_SCORE", "ENR.CROSS_SELL_SCORE")):
            v = r.get(c)
            lo, hi = RANGES[key]
            if v is not None and not (lo <= v <= hi):
                out.append(f"{aid}: {c}={v} outside [{lo}, {hi}]")
        if r.get("MFA_STATUS") is True and not (r.get("ONLINE_ENROLLED") or r.get("MOBILE_ENROLLED")):
            out.append(f"{aid}: MFA_STATUS true but neither online nor mobile enrolled")
        kyc, aml = r.get("KYC_STATUS"), r.get("AML_STATUS")
        if p["risk"] == "REVIEW":
            if kyc in _EN_REVIEW_KYC_CLEAN:
                out.append(f"{aid}: REVIEW profile has clean KYC_STATUS {kyc}")
            if aml in _EN_REVIEW_AML_CLEAN:
                out.append(f"{aid}: REVIEW profile has clean AML_STATUS {aml}")
        elif p["risk"] == "CLEAN":
            if kyc in _EN_REVIEW_STATUS:
                out.append(f"{aid}: CLEAN profile has review KYC_STATUS {kyc}")
            if aml in _EN_REVIEW_STATUS:
                out.append(f"{aid}: CLEAN profile has review AML_STATUS {aml}")
    return out
