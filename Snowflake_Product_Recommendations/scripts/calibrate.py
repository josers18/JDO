#!/usr/bin/env python3
"""Read-only live calibration of the product-recommendation generator (Task 8).

Pulls both feature queries (and the existing training tables' numeric stats) with SELECT-only
`snow sql` calls, caches them to the gitignored output/calibration_pool.json (`--refresh` re-pulls),
then builds every input row, both training sets at run_ts = now, and rule labels for the input
population, and prints the calibration gates. Writes nothing to Snowflake.

Usage:
    .venv/bin/python scripts/calibrate.py [--refresh] [--connection NAME]
"""
from __future__ import annotations

import argparse
import json
import pathlib
import statistics
import subprocess
import sys
from collections import Counter
from datetime import datetime

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "procedures"))

from prodrec.business import business_input_row, business_profile  # noqa: E402
from prodrec.common import as_float  # noqa: E402
from prodrec.labels import business_scores, personal_scores, rule_label  # noqa: E402
from prodrec.personal import personal_input_row, personal_profile  # noqa: E402
from prodrec.sp_main import (  # noqa: E402
    BUSINESS_FEATURES_SQL, PERSONAL_FEATURES_SQL, _sp_BIZ_TRAINING, _sp_BIZ_TRAINING_SIZE,
    _sp_PER_TRAINING, _sp_PER_TRAINING_SIZE,
)
from prodrec.training import build_training_set, mix_problems  # noqa: E402
from prodrec.vocab import BUSINESS_SUBSET_COLUMNS, PERSONAL_SUBSET_COLUMNS  # noqa: E402

CACHE = REPO_ROOT / "output" / "calibration_pool.json"
WAREHOUSE = "MAIN_WH_XS"
_READ_ONLY = ("SELECT", "WITH", "DESCRIBE", "SHOW")


def snow_select(sql: str, connection: str) -> list[dict]:
    head = sql.lstrip().split(None, 1)[0].upper()
    if head not in _READ_ONLY or "&" in sql:
        raise ValueError(f"refusing non-read-only or '&'-bearing SQL: {head}")
    out = subprocess.run(
        ["snow", "sql", "-c", connection, "--warehouse", WAREHOUSE, "--format", "json", "-q", sql],
        check=True, capture_output=True, text=True,
    ).stdout
    return json.loads(out)


def numeric_cols(cols: tuple[str, ...], sample: dict) -> list[str]:
    return [c for c in cols if c != "ACCOUNTID" and isinstance(sample[c], (int, float))]


def training_stats_sql(table: str, cols: list[str]) -> str:
    parts = [f"MIN({c}) AS {c}__MIN, MEDIAN({c}) AS {c}__MED, MAX({c}) AS {c}__MAX" for c in cols]
    return f"SELECT COUNT(*) AS N, {', '.join(parts)} FROM {table}"


def load_pool(refresh: bool, connection: str) -> dict:
    if CACHE.exists() and not refresh:
        return json.loads(CACHE.read_text())
    print("pulling live feature rows (read-only)...", file=sys.stderr)
    pool = {
        "pulled_at": datetime.now().isoformat(timespec="seconds"),
        "business": snow_select(BUSINESS_FEATURES_SQL, connection),
        "personal": snow_select(PERSONAL_FEATURES_SQL, connection),
    }
    # Existing training-table stats over the numeric subset columns.
    probe_b = business_input_row(business_profile(pool["business"][0], pool["business"][0], datetime.now()))
    probe_p = personal_input_row(personal_profile(pool["personal"][0], pool["personal"][0], datetime.now()))
    pool["old_training_stats"] = {
        "business": snow_select(training_stats_sql(
            _sp_BIZ_TRAINING, numeric_cols(BUSINESS_SUBSET_COLUMNS, probe_b)), connection)[0],
        "personal": snow_select(training_stats_sql(
            _sp_PER_TRAINING, numeric_cols(PERSONAL_SUBSET_COLUMNS, probe_p)), connection)[0],
    }
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    CACHE.write_text(json.dumps(pool, default=str))
    return pool


def pct(counter: Counter, total: int) -> str:
    return ", ".join(f"{k} {v} ({v / total:.1%})" for k, v in counter.most_common())


def mmm(vals) -> str:
    vals = [float(v) for v in vals if v is not None]
    if not vals:
        return "n/a"
    return f"{min(vals):,.2f} / {statistics.median(vals):,.2f} / {max(vals):,.2f}"


def fallback(rows: list[dict], outputs: list[dict], feed: str, out_col: str, alt: str | None = None):
    """(present, rejected) for one real feed: rejected = present but the output isn't the real value."""
    present = rejected = 0
    for r, o in zip(rows, outputs):
        vals = [as_float(r.get(feed))] + ([as_float(r.get(alt))] if alt else [])
        vals = [v for v in vals if v is not None]
        if not vals:
            continue
        present += 1
        if o[out_col] not in {round(v) for v in vals}:
            rejected += 1
    return present, rejected


def report_side(side: str, rows: list[dict], old_stats: dict, run_ts: datetime, gates: list) -> None:
    if side == "business":
        prof_fn, in_fn, scores_fn = business_profile, business_input_row, business_scores
        cols, size = BUSINESS_SUBSET_COLUMNS, _sp_BIZ_TRAINING_SIZE
    else:
        prof_fn, in_fn, scores_fn = personal_profile, personal_input_row, personal_scores
        cols, size = PERSONAL_SUBSET_COLUMNS, _sp_PER_TRAINING_SIZE

    profiles = [prof_fn(r, r, run_ts) for r in rows]
    inputs = [in_fn(p) for p in profiles]
    input_labels = Counter(rule_label(scores_fn(p)) for p in profiles)
    training = build_training_set([(r, r) for r in rows], side, run_ts, size)
    t_labels = [t["RECOMMENDED_PRODUCT"] for t in training]
    t_mix = Counter(t_labels)
    consistent = sum(t["RECOMMENDED_PRODUCT"] == rule_label(scores_fn(t)) for t in training)
    rc = consistent / len(training)

    print(f"\n=== {side.upper()} ===")
    print(f"input rows: {len(inputs)} (distinct ids {len({i['ACCOUNTID'] for i in inputs})})")
    print(f"training rows: {len(training)}")
    print(f"training class mix ({len(t_mix)} classes): {pct(t_mix, len(training))}")
    print(f"input argmax mix ({len(input_labels)} classes): {pct(input_labels, len(inputs))}")
    print(f"rule-consistency (training): {rc:.3f}")

    p_train = mix_problems(t_labels, floor=100)
    p_input = mix_problems([rule_label(scores_fn(p)) for p in profiles])
    gates.append((f"{side} training mix", "PASS" if not p_train else "FAIL: " + "; ".join(p_train)))
    gates.append((f"{side} input argmax mix", "PASS" if not p_input else "FAIL: " + "; ".join(p_input)))
    gates.append((f"{side} rule-consistency {rc:.3f}", "PASS" if 0.70 <= rc <= 0.80 else "FAIL"))

    if side == "business":
        vol_in = Counter(p["CASH_FLOW_VOLATILITY"] for p in profiles)
        vol_tr = Counter(t["CASH_FLOW_VOLATILITY"] for t in training)
        print(f"CASH_FLOW_VOLATILITY input: {pct(vol_in, len(profiles))}")
        print(f"CASH_FLOW_VOLATILITY training: {pct(vol_tr, len(training))}")
        target = {"High": 0.50, "Medium": 0.32, "Low": 0.18}
        worst = max(abs(vol_in[k] / len(profiles) - v) for k, v in target.items())
        gates.append((f"business volatility max dev {worst * 100:.1f} pts",
                      "PASS" if worst <= 0.10 else "FAIL"))
        feed_vol = sum(1 for r in rows if as_float(r.get("MONTHLY_NET_SD")) is not None
                       and (as_float(r.get("FEED_MONTHS")) or 0) >= 2)
        no_credit = sum(1 for r in rows if as_float(r.get("MONTHLY_NET_SD")) is not None
                        and (as_float(r.get("FEED_MONTHS")) or 0) >= 2
                        and not as_float(r.get("MONTHLY_CREDITS")))
        print(f"volatility from feed: {feed_vol}/{len(rows)}; of which MONTHLY_CREDITS None/0: {no_credit}")
        cvs = sorted(as_float(r["MONTHLY_NET_SD"]) / max(as_float(r.get("MONTHLY_CREDITS")) or 0.0, 1.0)
                     for r in rows if as_float(r.get("MONTHLY_NET_SD")) is not None
                     and (as_float(r.get("FEED_MONTHS")) or 0) >= 2)
        if cvs:
            q = [cvs[int(len(cvs) * f)] for f in (0.1, 0.18, 0.25, 0.5, 0.75, 0.9)]
            print("feed cv quantiles p10/p18/p25/p50/p75/p90: " + " / ".join(f"{x:.3f}" for x in q))
        feeds = (("MONTHLY_CREDITS", "MONTHLY_AVG_DEPOSITS", None),
                 ("DEPOSIT_BALANCE", "OPERATING_ACCOUNT_BALANCE", None),
                 ("MONTHLY_NET", "NET_MONTHLY_CASH_FLOW", None))
    else:
        home = Counter(p["HOME_OWNERSHIP"] for p in profiles)
        emp = Counter(p["EMPLOYMENT_STATUS"] for p in profiles)
        print(f"HOME_OWNERSHIP input: {pct(home, len(profiles))}")
        print(f"HOME_OWNERSHIP training: {pct(Counter(t['HOME_OWNERSHIP'] for t in training), len(training))}")
        print(f"EMPLOYMENT_STATUS input: {pct(emp, len(profiles))}")
        feeds = (("DEPOSIT_BALANCE", "TOTAL_ACCOUNT_BALANCE", None),
                 ("DIRECT_DEPOSIT", "MONTHLY_DEPOSIT_AMOUNT", "MONTHLY_CREDITS"))

    print("feed fallback (present -> rejected):")
    for feed, out_col, alt in feeds:
        present, rejected = fallback(rows, profiles, feed, out_col, alt)
        rate = rejected / present if present else 0.0
        name = feed + (f"|{alt}" if alt else "")
        print(f"  {name}: coverage {present}/{len(rows)}, rejected {rejected} ({rate:.1%})")
        gates.append((f"{side} {name} fallback {rate:.1%}", "PASS" if rate < 0.25 else "FAIL"))

    print("numeric subset columns min / median / max  [input | new training | existing training]:")
    for c in numeric_cols(cols, inputs[0]):
        old = (f"{float(old_stats[c + '__MIN']):,.2f} / {float(old_stats[c + '__MED']):,.2f} / "
               f"{float(old_stats[c + '__MAX']):,.2f}") if old_stats else "n/a"
        print(f"  {c}: {mmm(i[c] for i in inputs)} | {mmm(t[c] for t in training)} | {old}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--refresh", action="store_true", help="re-pull the live pool")
    ap.add_argument("--connection", default="SFDC_DC_TECH_ARCH")
    args = ap.parse_args()

    pool = load_pool(args.refresh, args.connection)
    biz, per = pool["business"], pool["personal"]
    run_ts = datetime.now()
    overlap = len({r["ACCOUNT_ID"] for r in biz} & {r["ACCOUNT_ID"] for r in per})
    print(f"pool pulled_at {pool['pulled_at']}; run_ts {run_ts:%Y-%m-%d %H:%M}")
    print(f"business rows {len(biz)}, personal rows {len(per)}, overlap {overlap}")

    gates: list = [("overlap 0", "PASS" if overlap == 0 else "FAIL")]
    report_side("business", biz, pool["old_training_stats"]["business"], run_ts, gates)
    report_side("personal", per, pool["old_training_stats"]["personal"], run_ts, gates)
    print("\n=== GATES ===")
    for name, result in gates:
        print(f"  {name}: {result}")


if __name__ == "__main__":
    main()
