"""Enrollment row factory and its consistency gate.

Each flag starts from a sticky base draw (stable_rng, no month). Drift is a one-time persistent change:
per (account, flag) a change month is drawn once from stable_rng (geometric hazard counted from
_EN_EPOCH); from that month on the flag is the base value inverted, so a flag changes at most once and
never reverts. Enrolment (False -> True) is likelier than un-enrolment. MFA always implies digital;
KYC/AML are sticky and follow the risk profile.
"""
from __future__ import annotations

import math
from datetime import datetime

from attrcsat.checks import row_problems
from attrcsat.common import clamp, stable_rng
from attrcsat.vocab import ENROLLMENT_COLUMNS

_EN_EPOCH = 2026 * 12  # month index of 2026-01; change months are counted from here
_EN_ENROL_P = 0.004    # monthly hazard for False -> True
_EN_UNENROL_P = 0.0015  # monthly hazard for True -> False
_EN_LOW_WIRE_P = 0.10  # cohorts below this base rate never drift toward wire-enabled
_EN_YOUNG_AGE = 25
_EN_WIRE_BALANCE = 250000
_EN_RETAIL_WIRE_CAP = 0.06  # book-level cap on the Retail-person wire rate
_EN_RETAIL_WIRE_MIN_N = 1000  # the cap is only meaningful on a book with at least this many Retail persons
_EN_REVIEW_STATUS = ("Under Review", "Pending")
_EN_REVIEW_KYC_CLEAN = ("Current", "Expired")
_EN_REVIEW_AML_CLEAN = ("Cleared", "None")


def _en_draw(aid: str, flag: str) -> float:
    return stable_rng(aid, "attrcsat-enr-" + flag).random()


def _en_month_index(run_ts: datetime) -> int:
    return run_ts.year * 12 + run_ts.month - 1


def _en_change_month(aid: str, flag: str, base: bool) -> int:
    """Month index at which the flag flips from base (geometric, drawn once per account and flag)."""
    p = _EN_UNENROL_P if base else _EN_ENROL_P
    u = stable_rng(aid, "attrcsat-chg-" + flag).random()
    return _EN_EPOCH + 1 + int(math.log(1.0 - u) / math.log(1.0 - p))


def _en_changed(aid: str, flag: str, base: bool, month: int) -> bool:
    return month >= _en_change_month(aid, flag, base)


def _en_young_retail(p: dict) -> bool:
    """Young, non-wealth, modest-balance persons (students, first jobs) never have wires enabled."""
    return (p["kind"] == "PERSON" and p["age"] < _EN_YOUNG_AGE and p["client_category"] != "WealthManagement"
            and p["total_balance"] < _EN_WIRE_BALANCE)


def _en_wire_p(p: dict) -> float:
    if _en_young_retail(p):
        return 0.0
    rich = p["total_balance"] >= _EN_WIRE_BALANCE
    if p["kind"] == "BUSINESS":
        base = 0.6
    elif p["kind"] == "HOUSEHOLD":
        base = 0.15
    elif p["client_category"] == "WealthManagement":
        base = 0.35
    else:
        # other persons stay under _EN_LOW_WIRE_P even when rich: no drift on, and the Retail cap holds
        return 0.05 if rich else 0.03
    return base + (0.1 if rich else 0.0)


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
    month = _en_month_index(run_ts)
    aff = profile["digital_affinity"]
    online_p = clamp(0.55 + 0.35 * aff + (0.1 if profile["kind"] == "BUSINESS" else 0.0), 0.0, 1.0)
    mobile_p = clamp(0.15 + 0.75 * aff, 0.0, 1.0)

    def drift(col: str, base: bool, allow: bool = True) -> bool:
        return base != (allow and _en_changed(aid, col, base, month))

    # Base state (month-independent). Paperless/alerts thresholds follow the base digital state.
    online0 = _en_draw(aid, "online") < online_p
    mobile0 = _en_draw(aid, "mobile") < mobile_p
    digital0 = online0 or mobile0
    mfa0 = _en_draw(aid, "mfa") < 0.85 and digital0
    paperless0 = _en_draw(aid, "paperless") < (0.6 if digital0 else 0.05)
    alerts0 = _en_draw(aid, "alerts") < (0.65 if digital0 else 0.05)
    wire_p = _en_wire_p(profile)
    wire0 = _en_draw(aid, "wire") < wire_p

    # Digital never goes True -> False: an account keeps at least one channel, so when both are on only the
    # channel with the earlier change month may un-enrol; a sole channel never un-enrols.
    if online0 and mobile0:
        first = ("ONLINE_ENROLLED" if _en_change_month(aid, "ONLINE_ENROLLED", True)
                 <= _en_change_month(aid, "MOBILE_ENROLLED", True) else "MOBILE_ENROLLED")
        online = drift("ONLINE_ENROLLED", online0, first == "ONLINE_ENROLLED")
        mobile = drift("MOBILE_ENROLLED", mobile0, first == "MOBILE_ENROLLED")
    else:
        online = drift("ONLINE_ENROLLED", online0, not online0)
        mobile = drift("MOBILE_ENROLLED", mobile0, not mobile0)
    digital = online or mobile
    # digital is constant (base on) or only switches on (base off), so MFA = pref and digital stays
    # monotone as long as pref moves the same way: with digital off at base, pref may only switch on.
    mfa_pref0 = _en_draw(aid, "mfa") < 0.85
    if digital0:
        mfa = drift("MFA_STATUS", mfa0)
    else:
        mfa = drift("MFA_STATUS", mfa_pref0, not mfa_pref0) and digital
    # Paperless/alerts follow digital: with digital off at base they may only switch on once digital is on
    # (both monotone, so the AND is too); with digital on at base they drift either way.
    if digital0:
        paperless = drift("PAPERLESS_ENROLLED", paperless0)
        alerts = drift("ALERT_ENROLLED", alerts0)
    else:
        paperless = paperless0 if paperless0 else (drift("PAPERLESS_ENROLLED", False) and digital)
        alerts = alerts0 if alerts0 else (drift("ALERT_ENROLLED", False) and digital)
    # low-wire cohorts (young retail included) never drift on, so their rate stays within the cap
    wire = drift("WIRE_ENABLED", wire0, wire0 or wire_p >= _EN_LOW_WIRE_P)
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
        out.extend(row_problems("ENROLLMENTS", r))
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
        if r.get("WIRE_ENABLED") is True and _en_young_retail(p):
            out.append(f"{aid}: WIRE_ENABLED on a young non-wealth person under {_EN_YOUNG_AGE}")
    retail = [r for r, p in zip(rows, profiles) if p["kind"] == "PERSON" and p["client_category"] == "Retail"]
    if len(retail) >= _EN_RETAIL_WIRE_MIN_N:
        rate = sum(1 for r in retail if r.get("WIRE_ENABLED") is True) / len(retail)
        if rate > _EN_RETAIL_WIRE_CAP:
            out.append(f"Retail-person wire rate {rate:.3f} above cap {_EN_RETAIL_WIRE_CAP}")
    return out
