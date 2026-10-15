"""Backfill "Fins".marketing_engagement from JDO campaigns (spec §2–§3, §7).

Reads JDO via sf CLI, builds each campaign's audience (CRM members or a
simulated audience), generates the email event funnel deterministically,
and replaces the table contents in one transaction.

    python3 backfill.py --dry-run     # per-campaign counts + coverage, no writes
    python3 backfill.py
    python3 backfill.py --as-of 2026-10-14

Reruns with the same --as-of produce identical rows (except last_modified_at).
"""

import argparse
import collections
import hashlib
import json
import os
import random
import subprocess
import sys
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from catalog import CRM_CAMPAIGNS, MEMBER_SOURCE, ORG, SEGMENT_SOURCE, SIMULATED_CAMPAIGNS

CENTRAL = ZoneInfo("America/Chicago")
SF_ROW_CAP = 50000  # sf data query --json stops here; treat hitting it as truncation

BOUNCE_RATE = 0.025
HARD_BOUNCE_SHARE = 0.20
SIM_RESPONDER_RATE = 0.20
NON_RESPONDER_OPEN_RATE = 0.25
REPEAT_OPEN_RATE = 0.30
REPEAT_CLICK_RATE = 0.15
UNSUB_RATE = 0.004
CAP_AFTER_END = timedelta(days=14)


# ── Salesforce reads ────────────────────────────────────────────────────────

def soql(q):
    out = subprocess.run(["sf", "data", "query", "-o", ORG, "--json", "-q", q], capture_output=True, text=True)
    data = json.loads(out.stdout or "{}")
    if data.get("status") != 0:
        sys.exit(f"SOQL failed: {data.get('message', out.stderr.strip())}\n  {q}")
    recs = data["result"]["records"]
    if len(recs) >= SF_ROW_CAP:
        sys.exit(f"SOQL hit the {SF_ROW_CAP}-row cap (results truncated):\n  {q}")
    return recs


def quote(s):
    return "'" + s.replace("\\", "\\\\").replace("'", "\\'") + "'"


def load_crm():
    accounts = {
        r["Id"]: {"person": r["IsPersonAccount"], "person_contact": r["PersonContactId"]}
        for r in soql("SELECT Id, IsPersonAccount, PersonContactId FROM Account")
    }

    business_contact = {}
    for r in soql("SELECT Id, AccountId FROM Contact WHERE Account.IsPersonAccount = false "
                  "AND Email != null ORDER BY CreatedDate, Id"):
        business_contact.setdefault(r["AccountId"], r["Id"])

    names = list(CRM_CAMPAIGNS) + list(SIMULATED_CAMPAIGNS)
    campaigns = {
        r["Name"]: r for r in soql(
            "SELECT Id, Name, Type, StartDate, EndDate FROM Campaign "
            f"WHERE Name IN ({', '.join(quote(n) for n in names)})")
    }
    missing = [n for n in names if n not in campaigns]
    if missing:
        sys.exit(f"Catalog campaigns not found in {ORG} (run seed_campaigns.py?): {missing}")
    for n, c in campaigns.items():
        if c["Type"] != "Email" or not c["StartDate"]:
            sys.exit(f"Catalog campaign {n!r} must be Type Email with a StartDate")

    with_members = {
        r["n"] for r in soql("SELECT Campaign.Name n FROM CampaignMember WHERE Campaign.Type = 'Email' "
                             "AND Contact.AccountId != null GROUP BY Campaign.Name")
    }
    uncatalogued = sorted(with_members - set(names))
    if uncatalogued:
        sys.exit(f"Email campaigns with account members missing from catalog.py: {uncatalogued}")

    members = {}
    for name in CRM_CAMPAIGNS:
        members[name] = soql(
            "SELECT Id, ContactId, Contact.AccountId, HasResponded FROM CampaignMember "
            f"WHERE CampaignId = '{campaigns[name]['Id']}' AND Contact.AccountId != null "
            "ORDER BY CreatedDate, Id")
    return accounts, business_contact, campaigns, members


# ── Audiences ───────────────────────────────────────────────────────────────

def unit(*parts):
    """Deterministic uniform [0, 1) from the given parts."""
    h = hashlib.md5("|".join(parts).encode()).hexdigest()
    return int(h[:15], 16) / 16**15


def md5(*parts):
    return hashlib.md5("|".join(parts).encode()).hexdigest()


def build_sends(accounts, business_contact, campaigns, members):
    """One send per (campaign, account). Returns list of send dicts."""
    sends = []

    def contact_for(acct_id):
        a = accounts[acct_id]
        return a["person_contact"] if a["person"] else business_contact.get(acct_id)

    def add(name, acct_id, source, member_id=None, contact_id=None, responded=None):
        c = campaigns[name]
        product = CRM_CAMPAIGNS[name] if source == MEMBER_SOURCE else SIMULATED_CAMPAIGNS[name]["product"]
        sends.append({
            "send_id": md5(c["Id"], acct_id),
            "campaign_id": c["Id"], "campaign_name": name, "audience_source": source,
            "campaign_member_id": member_id, "account_id": acct_id,
            "contact_id": contact_id or contact_for(acct_id),
            "personal_business": "Personal" if accounts[acct_id]["person"] else "Business",
            "product_name": product[0], "product_category": product[1],
            "start": date.fromisoformat(c["StartDate"]),
            "end": date.fromisoformat(c["EndDate"]) if c["EndDate"] else None,
            "responded": responded,
        })

    crm_reached = set()
    for name, rows in members.items():
        seen = set()
        for r in rows:  # ordered oldest first, so the oldest member per account wins
            acct = r["Contact"]["AccountId"]
            if acct in seen or acct not in accounts:
                continue
            seen.add(acct)
            add(name, acct, MEMBER_SOURCE, r["Id"], r["ContactId"], r["HasResponded"])
        crm_reached |= seen

    for name, spec in SIMULATED_CAMPAIGNS.items():
        want_person = spec["target"] == "Personal"
        rule = spec["audience"]
        for acct_id, a in accounts.items():
            if a["person"] != want_person:
                continue
            if rule == "all":
                pick = True
            elif isinstance(rule, str) and rule.startswith("uncovered+"):
                pick = acct_id not in crm_reached or unit(name, acct_id) < float(rule.split("+")[1])
            else:
                pick = unit(name, acct_id) < rule
            if pick:
                add(name, acct_id, SEGMENT_SOURCE)
    return sends


# ── Event funnel ────────────────────────────────────────────────────────────

def send_time(rng, start):
    """Within the first 48h of StartDate, 07:00–19:00 Central, returned as naive UTC."""
    day = start + timedelta(days=rng.randrange(2))
    local = datetime.combine(day, time(7), CENTRAL) + timedelta(seconds=rng.randrange(12 * 3600))
    return local.astimezone(timezone.utc).replace(tzinfo=None)


def events_for(s, as_of):
    rng = random.Random(int(s["send_id"], 16))
    cap = as_of if s["end"] is None else min(
        datetime.combine(s["end"], time(23, 59, 59)) + CAP_AFTER_END, as_of)
    out = []

    def ev(kind, at, bounce=None):
        if at <= cap:
            seq = sum(1 for e in out if e[0] == kind)
            out.append((kind, at, bounce, seq))

    sent = send_time(rng, s["start"])
    if sent > cap:
        return []
    ev("Sent", sent)
    landed = sent + timedelta(seconds=rng.uniform(0, 300))

    crm = s["audience_source"] == MEMBER_SOURCE
    bounce_roll, responder_roll = rng.random(), rng.random()
    if not (crm and s["responded"]) and bounce_roll < BOUNCE_RATE:
        ev("Bounced", landed, "Hard" if rng.random() < HARD_BOUNCE_SHARE else "Soft")
        return out
    ev("Delivered", landed)

    responder = s["responded"] if crm else responder_roll < SIM_RESPONDER_RATE
    if not responder and rng.random() >= NON_RESPONDER_OPEN_RATE:
        return out

    # First open 5 min – 72 h after delivery, skewed early (mean ~8 h).
    first_open = landed + timedelta(seconds=min(300 + rng.expovariate(1 / (8 * 3600)), 72 * 3600))
    ev("Opened", first_open)
    second_open = None
    if rng.random() < REPEAT_OPEN_RATE:
        second_open = first_open + timedelta(seconds=rng.uniform(600, 7 * 86400))
        ev("Opened", second_open)

    if responder:
        first_click = first_open + timedelta(seconds=rng.uniform(10, 600))
        ev("Clicked", first_click)
        if rng.random() < REPEAT_CLICK_RATE:
            after = second_open if second_open else first_click
            ev("Clicked", after + timedelta(seconds=rng.uniform(10, 600)))

    if rng.random() < UNSUB_RATE:
        ev("Unsubscribed", first_open + timedelta(seconds=rng.uniform(60, 86400)))
    return out


def build_rows(sends, as_of, loaded_at):
    cols = ("send_id", "campaign_id", "campaign_name", "audience_source", "campaign_member_id",
            "account_id", "contact_id", "personal_business", "product_name", "product_category")
    rows = []
    for s in sends:
        for kind, at, bounce, seq in events_for(s, as_of):
            rows.append((md5(s["send_id"], kind, str(seq)), *(s[c] for c in cols), kind, at, bounce, loaded_at))
    return rows


# ── Reporting ───────────────────────────────────────────────────────────────

def report(rows, accounts):
    by_campaign = collections.defaultdict(lambda: collections.Counter())
    sources = {}
    sends_by_type = collections.defaultdict(lambda: collections.defaultdict(set))
    for r in rows:
        name, src, send_id, kind = r[3], r[4], r[1], r[11]
        sources[name] = src
        by_campaign[name]["events"] += 1
        sends_by_type[name][kind].add(send_id)

    hdr = f"{'Campaign':44} {'Source':15} {'Sent':>7} {'Deliv':>7} {'Bounce':>6} {'Opened':>7} {'Clicked':>7} {'Unsub':>5} {'Events':>8}  Open%  CTR%"
    print(hdr); print("─" * len(hdr))
    tot = collections.Counter()
    for name in sorted(by_campaign, key=lambda n: (sources[n], n)):
        t = sends_by_type[name]
        n = {k: len(t[k]) for k in ("Sent", "Delivered", "Bounced", "Opened", "Clicked", "Unsubscribed")}
        n["events"] = by_campaign[name]["events"]
        tot.update(n)
        op = 100 * n["Opened"] / n["Delivered"] if n["Delivered"] else 0
        ct = 100 * n["Clicked"] / n["Delivered"] if n["Delivered"] else 0
        print(f"{name[:44]:44} {sources[name]:15} {n['Sent']:>7,} {n['Delivered']:>7,} {n['Bounced']:>6,} "
              f"{n['Opened']:>7,} {n['Clicked']:>7,} {n['Unsubscribed']:>5,} {n['events']:>8,}  {op:5.1f} {ct:5.1f}")
    print("─" * len(hdr))
    print(f"{'TOTAL':44} {'':15} {tot['Sent']:>7,} {tot['Delivered']:>7,} {tot['Bounced']:>6,} "
          f"{tot['Opened']:>7,} {tot['Clicked']:>7,} {tot['Unsubscribed']:>5,} {tot['events']:>8,}")
    print("(Opened/Clicked/Unsub count unique sends; Events counts all rows incl. repeats)\n")

    sent_per_acct = collections.Counter(r[6] for r in rows if r[11] == "Sent")
    print("Coverage (accounts with ≥1 Sent):")
    ok = True
    for person, label in ((True, "Person"), (False, "Business")):
        ids = [i for i, a in accounts.items() if a["person"] == person]
        covered = sum(1 for i in ids if sent_per_acct[i])
        dist = collections.Counter(min(sent_per_acct[i], 6) for i in ids)
        avg = sum(sent_per_acct[i] for i in ids) / len(ids)
        ok &= covered == len(ids)
        print(f"  {label:8} {covered:>6,} / {len(ids):,}  avg {avg:.2f} campaigns  "
              f"dist {{{', '.join(f'{k}{'+' if k == 6 else ''}: {v:,}' for k, v in sorted(dist.items()))}}}")
    print(f"  {'ALL':8} {sum(1 for i in accounts if sent_per_acct[i]):>6,} / {len(accounts):,}  "
          f"→ {'PASS' if ok else 'FAIL'}")
    return ok


# ── Load ────────────────────────────────────────────────────────────────────

def pg_connect():
    import psycopg
    env = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env")
    cfg = {k.strip(): v.strip().strip("'\"") for k, v in
           (l.split("=", 1) for l in open(env) if "=" in l and not l.lstrip().startswith("#"))}
    return psycopg.connect(
        host=cfg["Heroku_PG_Host"], port=cfg["Heroku_PG_Port"], dbname=cfg["Heroku_PG_Database"],
        user=cfg["Heroku_PG_User"], password=cfg["Heroku_PG_Password"], sslmode="require")


COLUMNS = ("engagement_id", "send_id", "campaign_id", "campaign_name", "audience_source",
           "campaign_member_id", "account_id", "contact_id", "personal_business", "product_name",
           "product_category", "engagement_type", "engagement_at", "bounce_type", "last_modified_at")


def load(rows):
    cols = ", ".join(COLUMNS)
    with pg_connect() as conn, conn.transaction():
        conn.execute('CREATE TEMP TABLE stage (LIKE "Fins".marketing_engagement INCLUDING DEFAULTS) ON COMMIT DROP')
        with conn.cursor().copy(f"COPY stage ({cols}) FROM STDIN") as cp:
            for r in rows:
                cp.write_row(r)
        conn.execute('TRUNCATE "Fins".marketing_engagement')
        conn.execute(f'INSERT INTO "Fins".marketing_engagement ({cols}) SELECT {cols} FROM stage')
        n = conn.execute('SELECT count(*) FROM "Fins".marketing_engagement').fetchone()[0]
    print(f"Loaded {n:,} rows into \"Fins\".marketing_engagement")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--as-of", type=date.fromisoformat, default=datetime.now(timezone.utc).date(),
                   help="Events after this date (UTC midnight) are dropped; default today")
    a = p.parse_args()
    as_of = datetime.combine(a.as_of, time())

    accounts, business_contact, campaigns, members = load_crm()
    sends = build_sends(accounts, business_contact, campaigns, members)
    rows = build_rows(sends, as_of, datetime.now(timezone.utc).replace(tzinfo=None, microsecond=0))
    print(f"as-of {as_of:%Y-%m-%d} UTC · {len(accounts):,} accounts · {len(sends):,} sends · {len(rows):,} events\n")
    covered = report(rows, accounts)
    if a.dry_run:
        print("\nDry run — nothing written.")
    elif not covered:
        sys.exit("Coverage check failed — not loading.")
    else:
        load(rows)
