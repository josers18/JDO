"""CRM reads shared by backfill.py (sf CLI) and feed.py (REST).

Each loader takes `query`: a callable mapping SOQL to the full record list.
"""

import json
import re
import subprocess
import sys
from datetime import date

from catalog import ORG

SF_ROW_CAP = 50000  # sf data query --json stops here; treat hitting it as truncation


def quote(s):
    return "'" + s.replace("\\", "\\\\").replace("'", "\\'") + "'"


def cli_query(soql):
    out = subprocess.run(["sf", "data", "query", "-o", ORG, "--json", "-q", soql], capture_output=True, text=True)
    data = json.loads(out.stdout or "{}")
    if data.get("status") != 0:
        sys.exit(f"SOQL failed: {data.get('message', out.stderr.strip())}\n  {soql}")
    recs = data["result"]["records"]
    if len(recs) >= SF_ROW_CAP:
        sys.exit(f"SOQL hit the {SF_ROW_CAP}-row cap (results truncated):\n  {soql}")
    return recs


def _day(ts):
    return date.fromisoformat(ts[:10])


def load_accounts(query):
    accounts = {
        r["Id"]: {"person": r["IsPersonAccount"], "person_contact": r["PersonContactId"], "created": _day(r["CreatedDate"])}
        for r in query("SELECT Id, IsPersonAccount, PersonContactId, CreatedDate FROM Account")
    }
    business_contact = {}
    for r in query("SELECT Id, AccountId FROM Contact WHERE Account.IsPersonAccount = false "
                   "AND Email != null ORDER BY CreatedDate, Id"):
        business_contact.setdefault(r["AccountId"], r["Id"])
    return accounts, business_contact


def load_members(query, campaign_ids):
    out = {}
    for cid in campaign_ids:
        if not re.fullmatch(r"[A-Za-z0-9]{15,18}", cid):
            raise ValueError(f"Bad campaign Id {cid!r}")
        out[cid] = [
            {"id": r["Id"], "contact_id": r["ContactId"], "account_id": r["Contact"]["AccountId"],
             "responded": r["HasResponded"], "created": _day(r["CreatedDate"])}
            for r in query("SELECT Id, ContactId, Contact.AccountId, HasResponded, CreatedDate FROM CampaignMember "
                           f"WHERE CampaignId = '{cid}' AND Contact.AccountId != null ORDER BY CreatedDate, Id")
        ]
    return out


def uncatalogued_member_campaigns(query, known_names):
    names = {r["n"] for r in query("SELECT Campaign.Name n FROM CampaignMember WHERE Campaign.Type = 'Email' "
                                   "AND Contact.AccountId != null GROUP BY Campaign.Name")}
    return sorted(names - set(known_names))
