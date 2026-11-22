"""Idempotent CRM seed for the Supercharge Bankers demo (org jdo-oe0sdd).

Hero: Rodriguez Industries, Account 001am00002A9jm4AAB (KYC Expired).
Creates the CEO + CFO Contacts and three Meeting_Note__c records ending in the
Nov 20 call transcript the "After the call" panel reads. Existing records are
matched by name / title, so re-runs never duplicate. Writes ids.json.

    python3 seed_crm.py             # seed
    python3 seed_crm.py --rollback  # delete everything ids.json lists
"""
import json
import os
import subprocess
import sys

ORG = "jdo-oe0sdd"
OWNER = "005am000003PbFDAA0"   # Allen Carter, owner of the commercial book
HERO = "001am00002A9jm4AAB"    # Rodriguez Industries
HERE = os.path.dirname(os.path.abspath(__file__))

CONTACTS = [
    {"FirstName": "Marisol", "LastName": "Rodriguez", "Title": "CEO",
     "Email": "mrodriguez@rodriguezindustries.example"},
    {"FirstName": "Daniel", "LastName": "Okafor", "Title": "CFO",
     "Email": "dokafor@rodriguezindustries.example"},
]


def transcript():
    # The md file carries a draft header; the note body starts at the Attendees line.
    lines = open(os.path.join(HERE, "transcript_2026-11-20.md")).read().splitlines()
    start = next(i for i, l in enumerate(lines) if l.startswith("Attendees:"))
    return "\n".join(lines[start:]).strip()


NOTES = [
    {"Date__c": "2026-10-28", "Title__c": "Treasury discovery session",
     "Notes__c": "Met Marisol Rodriguez (CEO) and Daniel Okafor (CFO). Strong interest in a "
                 "liquidity sweep across operating accounts and in automating payables. Daniel "
                 "wants fewer manual wires. Agreed to send a Treasury Services proposal."},
    {"Date__c": "2026-11-03", "Title__c": "Proposal walkthrough",
     "Notes__c": "Sent the Treasury Services proposal (liquidity sweep, ACH origination, "
                 "positive pay). Daniel raised renewal timing on their current bank and asked for "
                 "a detailed fee schedule. Follow-up call set for Nov 20."},
    {"Date__c": "2026-11-20", "Title__c": "Treasury Services proposal review — call transcript",
     "Notes__c": None},  # filled from the transcript file
]


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


def rest(method, path, fields):
    # REST (not `sf data create`) so long multi-line Notes__c survives intact and the
    # duplicate rule's allowSave header lets the contacts through.
    r = subprocess.run(["sf", "api", "request", "rest", f"/services/data/v62.0/sobjects/{path}",
                        "--method", method, "--body", json.dumps(fields),
                        "--header", "Sforce-Duplicate-Rule-Header: allowSave=true",
                        "--target-org", ORG], capture_output=True, text=True)
    if method == "PATCH":
        if r.returncode != 0 or (r.stdout.strip() and "errorCode" in r.stdout):
            sys.exit(f"update {path} failed: {(r.stdout or r.stderr)[:300]}")
        return path.split("/")[-1]
    try:
        return json.loads(r.stdout)["id"]
    except (ValueError, KeyError):
        sys.exit(f"create {path} failed: {(r.stdout or r.stderr)[:300]}")


def upsert(obj, existing_id, fields):
    return rest("PATCH", f"{obj}/{existing_id}", fields) if existing_id else rest("POST", obj, fields)


def seed():
    ids = {"account": HERO, "contacts": {}, "notes": {}}
    for c in CONTACTS:
        found = q(f"SELECT Id FROM Contact WHERE AccountId = '{HERO}' "
                  f"AND FirstName = '{esc(c['FirstName'])}' AND LastName = '{esc(c['LastName'])}'")
        cid = upsert("Contact", found[0]["Id"] if found else None,
                     {**c, "AccountId": HERO, "OwnerId": OWNER})
        ids["contacts"][c["Title"]] = cid
        print(f"contact {cid} {c['FirstName']} {c['LastName']}")

    for n in NOTES:
        fields = {**n, "Account__c": HERO, "Notes__c": n["Notes__c"] or transcript()}
        found = q(f"SELECT Id FROM Meeting_Note__c WHERE Account__c = '{HERO}' "
                  f"AND Title__c = '{esc(n['Title__c'])}'")
        nid = upsert("Meeting_Note__c", found[0]["Id"] if found else None, fields)
        ids["notes"][n["Date__c"]] = nid
        print(f"note    {nid} {n['Date__c']} {n['Title__c']}")
    save(ids)


def save(ids):
    json.dump(ids, open(os.path.join(HERE, "ids.json"), "w"), indent=1)
    print("wrote ids.json")


def rollback():
    ids = json.load(open(os.path.join(HERE, "ids.json")))
    for obj, group in (("Meeting_Note__c", "notes"), ("Contact", "contacts")):
        for rid in ids.get(group, {}).values():
            sf("data", "delete", "record", "-s", obj, "-i", rid)
            print("deleted", obj, rid)


if __name__ == "__main__":
    rollback() if "--rollback" in sys.argv else seed()
