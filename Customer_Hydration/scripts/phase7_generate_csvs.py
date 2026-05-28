"""Phase 7 — biz parity completion + person __pc shadow coverage.

Generates two update CSVs:
  - phase7a_biz.csv    : Email__c, FinServ__NetWorth__c, FinServ__CreditRating__c,
                         Tier__c, FinServ__LifetimeValue__c, FinServ__LastUsedChannel__c,
                         Ownership, TickerSymbol (gated to Public)
  - phase7b_person.csv : FinServ_Category__pc, FinServ_Contact_Status__pc,
                         FinServ__CommunicationPreferences__pc,
                         FinServ__ContactPreference__pc, FinServ__LastUsedChannel__c

Both are deterministic (sha256-keyed) so re-running yields the same values.
Cohort: External_ID__c LIKE 'MDM%' on jdo-uqj0jr (10,798 biz + 25,424 person).

Usage:
  python scripts/phase7_generate_csvs.py --target-org jdo-uqj0jr

CSVs are written to output/phase7-2026-05-27/. Bulk-update them via:
  sf data update bulk --sobject Account --file <csv> --target-org <org> --wait 30
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

OUT_DIR = Path("output/phase7-2026-05-27")

# Org-validated picklist vocabularies (from sObject describe).
TIER_BY_PERSONA = {
    "Wealth Management": "A",
    "Commercial Banking": "A",
    "Small Business":     "B",
    "Household":          "C",
    "Retail":             "C",
}

CREDIT_RATING_BANDS = [
    (700, "Excellent"),
    (550, "Good"),
    (400, "Fair"),
    (0,   "Poor"),
]

LAST_CHANNEL = ["Mobile", "Web", "Branch", "Call Center", "Other"]
OWNERSHIP    = ["Public", "Private", "Subsidiary", "Other"]

CATEGORY_PC_BY_PERSONA = {
    "Wealth Management": "Platinum",
    "Commercial Banking": "Platinum",
    "Small Business":     "Gold",
    "Household":          "Silver",
    "Retail":             "Silver",
}

CONTACT_PREF_PC = ["Email", "Phone", "Mobile"]

# Multipicklist combinations validated against org picklist values.
COMM_PREF_PC_BY_PERSONA = {
    "Wealth Management":  "Fraud:Email;Promotions:Email;Balance Activities:Email",
    "Commercial Banking": "Fraud:Email;Balance Activities:Email",
    "Small Business":     "Fraud:SMS;Promotions:Email;Balance Activities:SMS",
    "Household":          "Fraud:SMS;Balance Activities:Email",
    "Retail":             "Fraud:SMS;Promotions:Email;Balance Activities:SMS",
}


def stable_pick(seed: str, options: list[str]) -> str:
    digest = hashlib.sha256(seed.encode()).digest()
    return options[int.from_bytes(digest[:4], "big") % len(options)]


def credit_rating_for(equifax: int | None) -> str:
    if equifax is None:
        return "Fair"
    score = int(equifax)
    for threshold, label in CREDIT_RATING_BANDS:
        if score >= threshold:
            return label
    return "Poor"


def email_from_name(name: str, ext_id: str) -> str:
    """Build deterministic biz email like info@<slug>.com."""
    if not name:
        slug = ext_id.lower()
    else:
        slug = "".join(c for c in name.lower() if c.isalnum())[:24] or ext_id.lower()
    return f"info@{slug}.com"


def lifetime_value_biz(annual_revenue: float | None, persona: str) -> int:
    """Persona-coherent LTV: ~5-10% of annual revenue, banded."""
    if annual_revenue is None or annual_revenue <= 0:
        base = 50_000
    else:
        base = int(float(annual_revenue) * 0.07)
    if persona == "Commercial Banking":
        return max(base, 250_000)
    if persona == "Wealth Management":
        return max(base, 150_000)
    return max(base, 25_000)


def networth_biz(annual_revenue: float | None) -> int:
    """Net worth = revenue × 4 (conservative), floored at 100k."""
    if annual_revenue is None or annual_revenue <= 0:
        return 100_000
    return int(float(annual_revenue) * 4)


def query_all(org: str, soql: str) -> list[dict]:
    """Run a SOQL query and return all records (handles pagination)."""
    cmd = ["sf", "data", "query", "--target-org", org, "--query", soql, "--json", "--bulk", "--wait", "10"]
    proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if proc.returncode != 0:
        # Fall back to non-bulk for small results
        cmd_nb = ["sf", "data", "query", "--target-org", org, "--query", soql, "--json"]
        proc = subprocess.run(cmd_nb, capture_output=True, text=True, check=True)
    data = json.loads(proc.stdout)
    return data["result"]["records"]


def fetch_biz(org: str) -> list[dict]:
    soql = (
        "SELECT Id, External_ID__c, Name, FinServ__ClientCategory__c, "
        "Equifax_Credit_Risk_Score__c, AnnualRevenue, Tier__c, Ownership, TickerSymbol "
        "FROM Account "
        "WHERE External_ID__c LIKE 'MDM%' AND IsPersonAccount = false"
    )
    return query_all(org, soql)


def fetch_person(org: str) -> list[dict]:
    soql = (
        "SELECT Id, External_ID__c, FinServ__ClientCategory__c "
        "FROM Account "
        "WHERE External_ID__c LIKE 'MDM%' AND IsPersonAccount = true"
    )
    return query_all(org, soql)


def build_biz_rows(records: list[dict]) -> list[dict]:
    rows = []
    for r in records:
        rid = r["Id"]
        ext = r.get("External_ID__c") or rid
        persona = r.get("FinServ__ClientCategory__c") or "Retail"
        ar = r.get("AnnualRevenue")
        equifax = r.get("Equifax_Credit_Risk_Score__c")
        # Ownership is deterministic; ~10% Public matches the 145/10798 prior signal roughly.
        ownership = stable_pick(f"{ext}|Ownership", OWNERSHIP + ["Private"] * 8)
        ticker = ""
        if ownership == "Public":
            base = "".join(c for c in (r.get("Name") or ext).upper() if c.isalpha())[:4] or "MDMX"
            ticker = base
        rows.append({
            "Id": rid,
            "Email__c": email_from_name(r.get("Name") or "", ext),
            "FinServ__NetWorth__c": networth_biz(ar),
            "FinServ__CreditRating__c": credit_rating_for(equifax),
            "Tier__c": TIER_BY_PERSONA.get(persona, "C"),
            "FinServ__LifetimeValue__c": lifetime_value_biz(ar, persona),
            "FinServ__LastUsedChannel__c": stable_pick(f"{ext}|LastChannel", LAST_CHANNEL),
            "Ownership": ownership,
            "TickerSymbol": ticker,
        })
    return rows


def build_person_rows(records: list[dict]) -> list[dict]:
    rows = []
    for r in records:
        rid = r["Id"]
        ext = r.get("External_ID__c") or rid
        persona = r.get("FinServ__ClientCategory__c") or "Retail"
        rows.append({
            "Id": rid,
            "FinServ_Category__pc": CATEGORY_PC_BY_PERSONA.get(persona, "Bronze"),
            "FinServ_Contact_Status__pc": "Client",
            "FinServ__CommunicationPreferences__pc": COMM_PREF_PC_BY_PERSONA.get(
                persona, "Fraud:Email;Balance Activities:Email"
            ),
            "FinServ__ContactPreference__pc": stable_pick(f"{ext}|ContactPref", CONTACT_PREF_PC),
            "FinServ__LastUsedChannel__c": stable_pick(f"{ext}|LastChannel", LAST_CHANNEL),
        })
    return rows


def write_csv(path: Path, rows: list[dict], columns: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="\n") as f:
        w = csv.DictWriter(f, fieldnames=columns, lineterminator="\n")
        w.writeheader()
        for r in rows:
            w.writerow(r)


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--target-org", required=True)
    p.add_argument("--skip-biz", action="store_true")
    p.add_argument("--skip-person", action="store_true")
    args = p.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    if not args.skip_biz:
        print("[phase7a] Fetching biz cohort...", flush=True)
        biz = fetch_biz(args.target_org)
        print(f"[phase7a] {len(biz)} biz rows", flush=True)
        biz_rows = build_biz_rows(biz)
        biz_csv = OUT_DIR / "phase7a_biz.csv"
        write_csv(biz_csv, biz_rows, [
            "Id", "Email__c", "FinServ__NetWorth__c", "FinServ__CreditRating__c",
            "Tier__c", "FinServ__LifetimeValue__c", "FinServ__LastUsedChannel__c",
            "Ownership", "TickerSymbol",
        ])
        print(f"[phase7a] wrote {biz_csv}", flush=True)

    if not args.skip_person:
        print("[phase7b] Fetching person cohort...", flush=True)
        per = fetch_person(args.target_org)
        print(f"[phase7b] {len(per)} person rows", flush=True)
        per_rows = build_person_rows(per)
        per_csv = OUT_DIR / "phase7b_person.csv"
        write_csv(per_csv, per_rows, [
            "Id", "FinServ_Category__pc", "FinServ_Contact_Status__pc",
            "FinServ__CommunicationPreferences__pc", "FinServ__ContactPreference__pc",
            "FinServ__LastUsedChannel__c",
        ])
        print(f"[phase7b] wrote {per_csv}", flush=True)

    return 0


if __name__ == "__main__":
    sys.exit(main())
