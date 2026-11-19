"""Idempotent CRM seed for the Identify & Acquire demo (org jdo-oe0sdd).

Creates or updates 11 prospect Accounts (FinServ__Status__c = Prospect), one Lead per
Account linked via FinServ__RelatedAccount__c, and the hero's CFO Contact. Existing
records are matched by Account Name / Lead Company+LastName / Contact name, so re-runs
never duplicate. Writes ids.json, which the Snowflake step and rollback read.

    python3 seed_crm.py             # seed
    python3 seed_crm.py --rollback  # delete everything ids.json lists
"""
import json
import os
import re
import subprocess
import sys

ORG = "jdo-oe0sdd"
OWNER = "005am000003PbFDAA0"   # Allen Carter, owner of the commercial book
RT = "012am000001mrZqAAI"      # Account record type IndustriesBusiness
HERE = os.path.dirname(os.path.abspath(__file__))


def sf(*args):
    r = subprocess.run(["sf", *args, "--target-org", ORG, "--json"], capture_output=True, text=True)
    out = json.loads(r.stdout or "{}")
    if out.get("status") != 0:
        sys.exit(f"sf {' '.join(args[:3])} failed: {out.get('message') or r.stderr[:300]}")
    return out["result"]


def q(soql):
    return sf("data", "query", "-q", soql)["records"]


def esc(s):
    return s.replace("\\", "\\\\").replace("'", "\\'")


def kv(d):
    # sf --values syntax: Field='value' pairs, quotes inside values escaped.
    return " ".join(f"{k}='{str(v).replace(chr(39), chr(92) + chr(39))}'" for k, v in d.items())


def upsert(obj, existing_id, fields):
    if existing_id:
        sf("data", "update", "record", "-s", obj, "-i", existing_id, "-v", kv(fields))
        return existing_id
    return sf("data", "create", "record", "-s", obj, "-v", kv(fields))["id"]


def domain(name):
    words = re.sub(r"[^a-z ]", "", name.lower()).split()
    return "".join(words[:2]) + ".example"


def seed():
    rows, ids = json.load(open(os.path.join(HERE, "accounts.json"))), {}
    for r in rows:
        acct = {k: r[k] for k in ("Name", "Type", "Industry", "BillingCity", "BillingState",
                                  "AnnualRevenue", "NumberOfEmployees")}
        acct.update(BillingCountry="US", OwnerId=OWNER, FinServ__Status__c="Prospect")
        found = q(f"SELECT Id FROM Account WHERE Name = '{esc(r['Name'])}'")
        aid = upsert("Account", found[0]["Id"] if found else None,
                     acct if found else {**acct, "RecordTypeId": RT})

        lead_in = r["lead"]
        lead = {**lead_in, "Company": r["Name"], "Industry": r["Industry"],
                "AnnualRevenue": r["AnnualRevenue"], "NumberOfEmployees": r["NumberOfEmployees"],
                "Email": f"{lead_in['FirstName'][0].lower()}{lead_in['LastName'].lower()}@{domain(r['Name'])}",
                "OwnerId": OWNER, "FinServ__RelatedAccount__c": aid,
                "City": r["BillingCity"], "State": r["BillingState"], "Country": "US"}
        lf = q(f"SELECT Id FROM Lead WHERE Company = '{esc(r['Name'])}' "
               f"AND LastName = '{esc(lead_in['LastName'])}' AND IsConverted = false")
        lid = upsert("Lead", lf[0]["Id"] if lf else None, lead)
        ids[r["key"]] = {"name": r["Name"], "account": aid, "lead": lid}
        print(f"{r['key']:>2} {aid} {lid} {r['Name']}")

    save(ids)
    h = ids["H"]
    cf = q(f"SELECT Id FROM Contact WHERE AccountId = '{h['account']}' "
           "AND FirstName = 'Elizabeth' AND LastName = 'Smith'")
    contact = {"FirstName": "Elizabeth", "LastName": "Smith", "Title": "CFO",
               "AccountId": h["account"], "Email": "esmith@northgatepoint.example", "OwnerId": OWNER}
    # Another Elizabeth Smith already exists, so the org's duplicate rule blocks a plain create.
    # The REST API's allowSave header lets this distinct contact through.
    h["contact"] = cf[0]["Id"] if cf else rest_create("Contact", contact)
    print(" H contact", h["contact"])
    save(ids)


def save(ids):
    json.dump(ids, open(os.path.join(HERE, "ids.json"), "w"), indent=1)
    print("wrote ids.json")


def rest_create(obj, fields):
    r = subprocess.run(["sf", "api", "request", "rest", f"/services/data/v62.0/sobjects/{obj}",
                        "--method", "POST", "--body", json.dumps(fields),
                        "--header", "Sforce-Duplicate-Rule-Header: allowSave=true",
                        "--target-org", ORG], capture_output=True, text=True)
    try:
        return json.loads(r.stdout)["id"]
    except (ValueError, KeyError):
        sys.exit(f"create {obj} failed: {(r.stdout or r.stderr)[:300]}")


def rollback():
    ids = json.load(open(os.path.join(HERE, "ids.json")))
    for v in ids.values():
        for obj, key in (("Contact", "contact"), ("Lead", "lead"), ("Account", "account")):
            if v.get(key):
                sf("data", "delete", "record", "-s", obj, "-i", v[key])
                print("deleted", obj, v[key])


if __name__ == "__main__":
    rollback() if "--rollback" in sys.argv else seed()
