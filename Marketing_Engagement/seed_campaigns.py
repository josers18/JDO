"""Create the new simulated email Campaigns in JDO (spec §4).

Idempotent: a campaign whose Name already exists is skipped; existing
campaigns are never modified.

    python3 seed_campaigns.py --dry-run
    python3 seed_campaigns.py
    python3 seed_campaigns.py --set-num-sent   # after backfill.py
"""

import argparse
import json
import subprocess
import sys

from catalog import NEW_CAMPAIGN_DESCRIPTION, ORG, SEGMENT_SOURCE, SIMULATED_CAMPAIGNS


def sf(*args):
    out = subprocess.run(["sf", *args, "-o", ORG, "--json"], capture_output=True, text=True)
    data = json.loads(out.stdout or "{}")
    if data.get("status") != 0:
        sys.exit(f"sf {args[0]} {args[1]} failed: {data.get('message', out.stderr.strip())}")
    return data["result"]


def soql_str(s):
    return "'" + s.replace("\\", "\\\\").replace("'", "\\'") + "'"


def existing_ids(names):
    q = f"SELECT Id, Name FROM Campaign WHERE Name IN ({', '.join(soql_str(n) for n in names)})"
    return {r["Name"]: r["Id"] for r in sf("data", "query", "-q", q)["records"]}


def values(fields):
    # sf data create/update record -v syntax: Field='value' pairs.
    return " ".join(f"{k}={soql_str(str(v))}" for k, v in fields.items())


def create_campaigns(dry_run):
    new = {n: c for n, c in SIMULATED_CAMPAIGNS.items() if c["new"]}
    have = existing_ids(new)
    for name, c in new.items():
        if name in have:
            print(f"skip    {name} ({have[name]}) — already exists")
            continue
        fields = {
            "Name": name, "Type": "Email", "Status": c["status"], "IsActive": "true",
            "StartDate": c["start"], "EndDate": c["end"], "Description": NEW_CAMPAIGN_DESCRIPTION,
        }
        if dry_run:
            print(f"would create  {name}  {c['start']} → {c['end']}  {c['status']}")
            continue
        rec = sf("data", "create", "record", "-s", "Campaign", "-v", values(fields))
        print(f"created {name} ({rec['id']})")


def set_num_sent(dry_run):
    import os
    import psycopg

    env = os.path.join(os.path.dirname(__file__), "..", ".env")
    cfg = {k.strip(): v.strip().strip("'\"") for k, v in
           (l.split("=", 1) for l in open(env) if "=" in l and not l.lstrip().startswith("#"))}
    with psycopg.connect(
        host=cfg["Heroku_PG_Host"], port=cfg["Heroku_PG_Port"], dbname=cfg["Heroku_PG_Database"],
        user=cfg["Heroku_PG_User"], password=cfg["Heroku_PG_Password"], sslmode="require",
    ) as conn:
        counts = dict(conn.execute(
            "select campaign_id, count(*) from \"Fins\".marketing_engagement "
            "where audience_source = %s and engagement_type = 'Sent' group by campaign_id", (SEGMENT_SOURCE,)
        ).fetchall())
    for name, cid in existing_ids(SIMULATED_CAMPAIGNS).items():
        n = counts.get(cid, 0)
        print(f"{'would set' if dry_run else 'set'} NumberSent={n}  {name}")
        if not dry_run:
            sf("data", "update", "record", "-s", "Campaign", "-i", cid, "-v", f"NumberSent={n}")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--set-num-sent", action="store_true")
    a = p.parse_args()
    (set_num_sent if a.set_num_sent else create_campaigns)(a.dry_run)
